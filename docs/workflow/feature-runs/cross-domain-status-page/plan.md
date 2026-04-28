# Plan: Cross-Domain Status Page + Empty-Response Anomalies

**Slug:** cross-domain-status-page
**Created:** 2026-04-27
**Status:** draft
**Spec:** docs/workflow/feature-runs/cross-domain-status-page/spec.md

---

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: HIGH transcript-keyed anomalies persist after re-probe — addressed by Decision 1 (slot-keyed subject for `INVALID_RESPONSE_FAILURE`). HIGH re-probe mutation race — addressed by Decision 2 (Prisma `$transaction` wrapping the DB writes; queue enqueue post-commit). MEDIUM rate-limited/erroring status flag sources — addressed by Decision 6 (drop both flags from v1; only `stalled` and `done` are surfaced). MEDIUM mutation authorization — addressed by Decision 3 (mutations require auth; cross-domain access is the platform's intentional flat model — documented).
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: HIGH soft-deleted transcripts trigger detector — addressed by Decision 1 (detector WHERE clause includes `deletedAt IS NULL`). MEDIUM type filter scoping ambiguity — addressed by Decision 4 (type filter applies to anomalies only; active evaluations ignore it). MEDIUM ETA tie-break when empty — addressed by Decision 5 (rows with no ETA sort last, alphabetically among themselves). MEDIUM re-probe spam from persistent empty — addressed by Decision 1 (slot-keyed deduping) plus Decision 7 (re-probe circuit breaker: max 3 re-probes per slot, enforced by counting soft-deleted transcripts at the same slot).
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: CRITICAL cross-domain authorization — clarified by Decision 3 (ValueRank has a flat user model; all 6 users already see all 4 domains; mutations require authentication but no per-domain check is added in v1). HIGH manual Resolve flapping — accepted by design (per spec assumption: detector re-fire is the desired behavior, not a UX flaw; if the empty keeps coming back, that's signal). HIGH re-probe atomicity — addressed by Decision 2 (transaction). HIGH hard route removal user-hostile — rejected; user explicitly chose break-loudly per Story 4. MEDIUM circuit breaker — addressed by Decision 7 (cap at 3 re-probes per slot). MEDIUM ETA volatility — addressed by Decision 5 (≥3 completions floor; below floor, ETA is empty cell, not synthetic fallback). MEDIUM detection brittleness — accepted with verification; spec residual risk #2 already specifies a unit-test guard against `transcript.content` shape changes.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: HIGH destructive-before-durable — already documented in residual risks; UI shows error chip on enqueue failure and Resolve remains available. HIGH concurrency guard for duplicate reprobes — addressed by Decision 2 update (PgBoss `singletonKey` dedupes at queue layer regardless of pending-job check). MEDIUM circuit breaker miscount — accepted with verification: code search confirms re-probe is the only soft-delete path on transcripts at slot granularity (existing soft-delete uses are domain/run-level cascades, not slot-targeted); plus a unit test asserts the count is correct on a fixture.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: HIGH default+audit duplicate anomalies — addressed by Decision 1 update (audit sweep skips slots that have an open `default`-source anomaly; default sweep is the writer of record). HIGH enqueue race — addressed by Decision 2 update (PgBoss `singletonKey`). MEDIUM missing UI data fields — addressed by Wave 2 update (`reprobeCount`, `reprobeLimitReached`, `estimatedCost` added to augmented `RunAnomaly` GraphQL type). MEDIUM resolveRunAnomaly is dismissal not repair — accepted by design per spec; UI copy clarifies in Wave 3 update.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: HIGH missing UI data fields — same as above (Wave 2 update). MEDIUM detection criterion ambiguity — addressed by Wave 1 update (precise WHERE clause). MEDIUM switch fragility for unknown types — addressed by Wave 3 update (defensive default: unknown types render with type id as label and only `[Resolve]` action). LOW limit-reached discoverability — addressed by Wave 3 update (tooltip on disabled button explains escape hatch). LOW component regression — addressed by Wave 6 update (explicit `git grep` for `DomainEvaluationStatusPanel` consumers in addition to route URL sweep).

## Architecture Overview

This feature has three layers, each independently testable:

| Layer | Where | What it does |
|-------|-------|-------------|
| **Detection** | `cloud/apps/api/src/services/run/anomaly-detection.ts` + `anomaly-persistence.ts` | New `INVALID_RESPONSE_FAILURE` detector queries transcripts and emits drafts. `syncAnomalies()` upserts and auto-resolves via the existing pattern. |
| **API** | New GraphQL queries + mutations + augmented `RunAnomaly` type | `openRunAnomalies`, `activeEvaluations`, `reprobeAnomalySlot`, `resolveRunAnomaly` |
| **Web** | New `Status.tsx` page, augmented `DomainEvaluationStatusPanel`, route changes in `App.tsx` | Cross-domain anomaly table + active evaluations panel + URL-state filters |

The detection layer is the highest-risk piece because it's the first new anomaly type to be slot-keyed (existing types are subject-keyed by transcript or model id). The API and Web layers are conventional CRUD + UI.

---

## Architecture Decisions

### Decision 1: `INVALID_RESPONSE_FAILURE` subject is slot-keyed

**Choice:** Subject for the new anomaly type is `<runId>:<scenarioId>:<modelId>:<sampleIndex>` rather than `<transcript_id>`. The detector's WHERE clause includes `deletedAt IS NULL`.

**Rationale:** Re-probe creates a new transcript at the same slot and soft-deletes the old one. If the subject were `<transcript_id>`, the original anomaly would point at a soft-deleted transcript while the new transcript (if also empty) would create a fresh anomaly — leading to anomaly spam and orphaned rows. With slot-keyed subjects, the same `(runId, type, subject, source)` row is touched on every reconciliation pass; `syncAnomalies()` resolves it cleanly when the slot's current non-deleted transcript has non-empty content.

**Trade-off:** Existing anomaly types continue to use their current subject formats (transcript_id for `STRANDED_TRANSCRIPT` / `ORPHAN_TRANSCRIPT`, run-level for others). The mixed convention is documented in code comments. Migrating other types to slot-keyed subjects is out of scope for this feature.

**Implementation:** The detector function returns drafts where `subject = ${runId}:${scenarioId}:${modelId}:${sampleIndex}`. The UI's `displaySubject` field formats this into a readable label (e.g., "scenario … / model …") for the anomaly row.

**Source coordination (audit vs default):** To prevent the same slot from producing both a `source='default'` row and a `source='audit'` row, the **audit sweep skips slots that already have an open (`resolvedAt IS NULL`) anomaly of the same type at the same subject regardless of source**. The default sweep is the writer of record during run completion; the audit source exists only as backfill for runs that never ran the default sweep. Implementation: in the audit detector, query `RunAnomaly` for the candidate's `(runId, type, subject)` and skip if any open row exists.

### Decision 2: Re-probe mutation is transactional

**Choice:** `reprobeAnomalySlot` wraps the DB writes (soft-delete transcript, hard-delete probe_results, optionally update RunAnomaly.lastSeenAt) in a Prisma `$transaction`. The PgBoss `boss.send()` enqueue happens AFTER the transaction commits.

**Rationale:** Without a transaction, a partial failure between soft-delete and probe_results delete leaves the slot in a stuck state (soft-deleted transcript + remaining idempotency guard) that's not reachable via the UI. Wrapping in a transaction makes the DB writes all-or-nothing.

**Why post-commit enqueue:** PgBoss writes its job rows to the same Postgres instance and could in principle be wrapped in the same transaction, but the boss client API doesn't expose that pattern cleanly today. Post-commit enqueue is the simpler, supported approach. If the enqueue fails after commit, the soft-delete remains — the user sees a row-level error chip and can retry; the original anomaly stays open.

**Locking + queue dedupe:** The transaction does a `SELECT ... FOR UPDATE` on the `RunAnomaly` row at the start to serialize concurrent re-probe clicks for the same anomaly. The mutation also rejects if the slot already has a pending `probe_scenario` job (queried by scanning pgboss for active/retry/created jobs with matching `data->>'runId'`, `data->>'scenarioId'`, `data->>'modelId'`, `data->>'sampleIndex'`).

**Critical addition:** The new `boss.send('probe_scenario', payload, { singletonKey: '<runId>:<scenarioId>:<modelId>:<sampleIndex>' })` call uses a deterministic singleton key derived from the slot tuple. PgBoss's singleton enforcement dedupes concurrent enqueues at the queue layer — even if the pending-job check passes for two concurrent clicks (because timing puts both checks before either insert), the second `boss.send` is rejected by PgBoss itself. This eliminates the duplicate-enqueue race that the row-lock + pending-job check alone cannot close.

### Decision 3: Mutations require authentication; no per-domain authorization

**Choice:** Both new mutations (`reprobeAnomalySlot`, `resolveRunAnomaly`) require an authenticated user via the existing GraphQL auth context. Neither performs a per-domain access check.

**Rationale:** ValueRank's user model is flat — all 6 users (5 admin, 1 visitor) currently see all 4 domains. There is no concept of "user X belongs to domain Y." Adding per-domain checks would require a parallel access-control system that does not exist today. Gemini's CRITICAL finding was scoped to a hypothetical multi-tenant model; this platform is a research workspace, not a multi-tenant SaaS.

**Trade-off:** If ValueRank later introduces per-domain access (e.g., for external collaborators), these mutations need to add a domain check. Documented in plan-level residual risks below.

### Decision 4: Type filter applies to anomalies only

**Choice:** The type filter dropdown filters the Open Anomalies section. The Active Evaluations section ignores the type filter (it has nothing meaningful to filter against).

**Rationale:** "Type" is an anomaly-classification concept; runs don't have an anomaly type. Applying type filter to active evaluations would either hide all of them (if the type doesn't match any anomaly on the run) or show a confusing subset. The cleaner UX is to scope the type filter to the anomalies section visually and behaviorally.

**Implementation:** The Active Evaluations component reads only the `domain` filter from URL state. The Open Anomalies component reads both `domain` and `type`.

### Decision 5: ETA renders as empty when below 3-completions threshold

**Choice:** Per-model ETA cell is empty for models with fewer than 3 recent completions. Sorting puts empty-ETA rows last (sub-sorted alphabetically by model id).

**Rationale:** Falling back to the overall run rate for under-3-completions models (as the spec originally proposed) creates ETA volatility — a model with one slow first probe shows a wildly inflated ETA, then snaps to a reasonable value on the third completion. Better to render no ETA than a misleading one. The "bottleneck first" sort still works because in-progress models with reliable ETAs cluster at the top.

**Spec amendment:** This supersedes Assumption 5's "fall back to overall run rate" sentence. The threshold becomes a hard requirement: ≥3 completions or empty cell.

### Decision 6: Drop `rate-limited` and `erroring` status flags from v1

**Choice:** The per-model status flag column renders only `stalled` (from existing `Run.stalledModels[]`), `done` (from completion count), or empty. `rate-limited` and `erroring` are out of scope for v1.

**Rationale:** The data layer cannot reliably surface rate-limit or error signal today: `probe_results.error_code` is empty in prod for the last 30 days because successful retries overwrite failed attempts (the unique constraint on the slot tuple). Surfacing best-effort heuristics on a high-visibility UI would be misleading.

**When to revisit:** Once a `probe_attempts` log exists (separately tracked tech debt), the status flag column can be extended. Plan-level residual risks document the deferred state.

**Spec amendment:** This supersedes FR-008's status flag list. Updated FR-008 reads: *"Per-model status flag column supports `stalled` (sourced from existing `Run.stalledModels[]`) and `done` (sourced from per-model completion count). Other states render as empty cell. `rate-limited` and `erroring` are deferred."*

### Decision 7: Re-probe circuit breaker — max 3 attempts per anomaly

**Choice:** `reprobeAnomalySlot` rejects with `REPROBE_LIMIT_EXCEEDED` when `RunAnomaly.details.reprobeAttempts >= 3`. Each successful re-probe mutation increments the counter inside the transaction.

**Rationale:** Without a cap, a researcher could hammer `[Re-probe]` on a doomed slot (e.g., a model that consistently produces empty responses for a specific prompt), spending budget without making progress. Three attempts is enough to distinguish transient glitch from systemic failure; beyond that, a different intervention is needed (model swap, prompt fix).

**Why count via `details` JSON instead of soft-deleted transcripts:** Earlier draft tracked re-probe history by counting soft-deleted transcripts at the slot. That works for the historical-path shape (transcript exists, gets soft-deleted) but not for the forward-path shape (no transcript at slot — only a FAILED probe_results that gets hard-deleted, leaving no trace). Storing the counter on the anomaly row covers both.

**UI:** When the limit is reached, the `[Re-probe]` button is disabled and the row shows a `Limit reached` chip. Manual `[Resolve]` remains available.

### Decision 8: Component reuse boundary

**Choice:** `DomainEvaluationStatusPanel` is augmented in place to render the new per-model fields (ETA, throughput, status flag, cost). `DomainEvaluationStatusDrawer` is reused unchanged. Existing callers of `DomainEvaluationStatusPanel` (none after `DomainStatus.tsx` is deleted, but check during sweep) get the augmented version automatically.

**Rationale:** Forking the panel would duplicate ~150 lines of layout and progress logic for marginal benefit. The augmented fields are additive; if no data is available, the cells render empty.

---

## Wave Breakdown

### Wave 1 — Schema + detector + audit sweep [CHECKPOINT]
**~150 lines changed**

**Files:**
- `cloud/packages/db/prisma/schema.prisma` (enum extension)
- New migration: `cloud/packages/db/prisma/migrations/<ts>_add_empty_target_response_anomaly/migration.sql`
- `cloud/apps/api/src/services/run/anomaly-detection.ts` (new detector + slot-key helper)
- `cloud/apps/api/src/services/run/anomaly-persistence.ts` (call new detector from `syncAnomalies()` callsite for per-run reconciliation)
- `cloud/apps/api/src/queue/handlers/summarize-persistence.ts` (`maybeCompleteRun` already calls anomaly reconciliation; verify INVALID_RESPONSE_FAILURE is included in the per-run sweep)
- Audit sweep file (search for the existing sweep that runs default-source reconciliation periodically; add the new type)
- Tests: `cloud/apps/api/tests/services/run/anomaly-detection.test.ts` adds cases for the new detector

**Changes:**

1. **Schema:** Add `INVALID_RESPONSE_FAILURE` to `RunAnomalyType` enum at the END of the list (preserve ordinal position of existing values).
   ```prisma
   enum RunAnomalyType {
     STRANDED_TRANSCRIPT
     ORPHAN_TRANSCRIPT
     PAIR_ASYMMETRY
     SUMMARIZING_STALL
     MODEL_TRANSCRIPT_SHORTFALL
     SCHEDULED_COUNT_MISMATCH
     INVALID_RESPONSE_FAILURE  // NEW
   }
   ```

2. **Detector function** in `anomaly-detection.ts` — **dual-path** to absorb post-#760 forward path AND pre-#760 historical empties:
   ```typescript
   export async function detectInvalidResponseFailures(runId: string, source: 'default' | 'audit'): Promise<AnomalyDraft[]> {
     // PATH A (forward): probe_results with status='FAILED' AND error_code='INVALID_RESPONSE' AND deleted_at IS NULL,
     //   where there is NO associated non-deleted transcript at (run_id, scenario_id, model_id, sample_index).
     //   These slots have a failed probe and no transcript — caused by PR #760's adapter guards.
     //
     // PATH B (historical): transcripts with deleted_at IS NULL AND summarized_at IS NOT NULL,
     //   where getTranscriptResponseText(content).length === 0.
     //   These slots have a non-deleted transcript with empty visible response — pre-#760 data.
     //
     // Both paths produce drafts with the SAME slot-keyed subject:
     //   subject = `${runId}:${scenarioId}:${modelId}:${sampleIndex}`
     //   details = { scenarioId, modelId, sampleIndex, transcriptId?, probeResultId?, source: 'forward'|'historical', reprobeAttempts: 0 }
     //
     // For audit source only: skip slots that already have an open anomaly of the same (runId, type, subject) regardless of source — avoids default/audit duplication.
     //
     // The slot-keyed subject is the join key: when a slot is fixed (re-probed successfully → SUCCESS probe + non-empty transcript),
     // neither path returns it any more, and syncAnomalies() resolves the anomaly automatically.
   }
   ```
   Returning the same subject from both paths is what lets `syncAnomalies()` correctly close the anomaly when a re-probe lands a SUCCESS+non-empty transcript at the slot.

3. **Reconciliation call:** Add `INVALID_RESPONSE_FAILURE` to the per-run reconciliation pass invoked from `maybeCompleteRun()`. The runner already iterates over types via `syncAnomalies()`; ensure the new type is included.

4. **Audit sweep:** Add the new type to whatever audit-source sweep currently runs (search `audit` source references in anomaly-detection / persistence). The sweep iterates over completed runs; the new detector function is added to its loop.

**Verification:**
- Unit test: detector returns one draft per empty transcript on a run with 3 transcripts (1 empty visible, 1 non-empty, 1 soft-deleted-empty-which-must-be-skipped).
- Unit test: detector returns zero drafts on a run with all transcripts non-empty.
- Unit test: re-running the detector on the same state produces no duplicate inserts (uniqueness constraint enforces idempotency).
- Integration test: run `maybeCompleteRun()` on a fixture run that completes with one empty transcript; verify a `RunAnomaly` row is created with `type='INVALID_RESPONSE_FAILURE'`, `subject='<slot tuple>'`, `source='default'`, `resolvedAt=null`.
- Integration test: simulate a re-probe (manual transcript replacement at the same slot with non-empty content); call `syncAnomalies()`; verify the original anomaly's `resolvedAt` is set.

---

### Wave 2 — GraphQL queries + mutations [CHECKPOINT]
**~250 lines changed**

**Files:**
- New: `cloud/apps/api/src/graphql/queries/run-anomaly/open-run-anomalies.ts`
- New: `cloud/apps/api/src/graphql/queries/active-evaluation/active-evaluations.ts`
- New: `cloud/apps/api/src/graphql/mutations/run-anomaly/reprobe-anomaly-slot.ts`
- New: `cloud/apps/api/src/graphql/mutations/run-anomaly/resolve-run-anomaly.ts`
- `cloud/apps/api/src/graphql/queries/index.ts` (register new queries)
- `cloud/apps/api/src/graphql/mutations/index.ts` (register new mutations)
- `cloud/apps/api/src/graphql/types/run-anomaly.ts` (add `run`, `domain`, `displayLabel`, `displaySubject` fields)
- Tests for each query and mutation

**Changes:**

1. **`openRunAnomalies(domainId, type)` query:**
   - Filters: `resolvedAt IS NULL`. Optional domain filter joins via `run → definition → domain`. Optional type filter is straightforward.
   - Order by `firstSeenAt DESC`.
   - Returns `[RunAnomaly!]!` with `run`, `domain`, `displayLabel`, `displaySubject` populated.

2. **`activeEvaluations(domainId)` query:**
   - Filters: `DomainEvaluation` where any associated `Run` has `status IN ('RUNNING', 'SUMMARIZING')`. Optional domain filter on `DomainEvaluation.domainId`.
   - Returns `[DomainEvaluation!]!` with the same structure today's `DomainStatus` page consumes (so the existing `DomainEvaluationStatusPanel` can render unchanged).

3. **`reprobeAnomalySlot(anomalyId)` mutation — handles both data shapes at the slot:**
   - Validate: anomaly is open (`resolvedAt IS NULL`), eligible (`type = 'INVALID_RESPONSE_FAILURE'` for v1 — extend to STRANDED/ORPHAN as a follow-up), run is in non-terminal state (`status NOT IN ('FAILED', 'CANCELLED')`).
   - Validate: no pending `probe_scenario` job for the slot (query pgboss).
   - Validate: re-probe attempts for the anomaly < 3 (read `details.reprobeAttempts`; Decision 7).
   - Inside `$transaction`:
     - `SELECT ... FOR UPDATE` on `RunAnomaly` row.
     - Look up slot tuple from `subject` (parse `<runId>:<scenarioId>:<modelId>:<sampleIndex>`).
     - Soft-delete the **non-deleted transcript at the slot** if one exists (`UPDATE transcripts SET deleted_at = NOW() WHERE run_id=... AND scenario_id=... AND model_id=... AND sample_index=... AND deleted_at IS NULL`). The historical-path shape has a transcript here; the forward-path shape does not — both are tolerated.
     - Hard-delete the corresponding `probe_results` row at the slot if one exists. Both shapes have one (forward path: FAILED probe; historical path: SUCCESS probe with the empty transcript). Both must be removed to clear the idempotency guard.
     - Update `RunAnomaly.details.reprobeAttempts = (current ?? 0) + 1` and `lastSeenAt = NOW()`.
   - After commit: `boss.send('probe_scenario', payload, { singletonKey: '<runId>:<scenarioId>:<modelId>:<sampleIndex>' })`. The singleton key dedupes concurrent enqueues at the queue layer (Decision 2 update).
   - Errors: `RUN_NOT_REPROBABLE`, `ANOMALY_NOT_OPEN`, `ANOMALY_NOT_REPROBABLE`, `REPROBE_LIMIT_EXCEEDED`, `REPROBE_ALREADY_IN_FLIGHT`.

4. **`resolveRunAnomaly(id)` mutation:**
   - Idempotent. `UPDATE run_anomalies SET resolved_at = NOW() WHERE id = $1 AND resolved_at IS NULL`.
   - Returns the updated `RunAnomaly`.

5. **Augmented `RunAnomaly` type:**
   - `run: Run!` — resolves via `runId`
   - `domain: Domain!` — resolves via `run.definition.domain`
   - `displayLabel: String!` — type-aware human label ("Empty Response", "Stranded Transcript", etc.). For unknown future enum values, returns the raw enum string as a defensive default.
   - `displaySubject: String!` — type-aware subject formatter (parses slot tuple for slot-keyed types; uses transcript id for transcript-keyed; etc.). For unknown types, returns the raw `subject` string.
   - `reprobeEligible: Boolean!` — true only for `INVALID_RESPONSE_FAILURE` in v1 (extends to other slot-keyed types in follow-ups).
   - `reprobeCount: Int!` — for slot-keyed types, returns `details.reprobeAttempts` (default `0` if not set). For non-slot-keyed types, always `0`.
   - `reprobeLimitReached: Boolean!` — `reprobeCount >= 3`.
   - `estimatedCost: Float` — best-effort cost estimate for the next re-probe based on `transcript.estimatedCost` of recent successful probes for the same `modelId` (averaged over last 10). `null` if no data.

**Verification:**
- Unit test: each mutation's validation path rejects with the right error code for every failure mode.
- Integration test: `reprobeAnomalySlot` happy path on a fixture run; verify slot is correctly soft-deleted and a probe job is enqueued.
- Integration test: `reprobeAnomalySlot` on a slot with 3 prior soft-deletes returns `REPROBE_LIMIT_EXCEEDED`.
- Integration test: `resolveRunAnomaly` is idempotent (calling twice returns the same row, no error on second call).
- Schema test: `openRunAnomalies` returns expected rows with all augmented fields populated.

---

### Wave 3 — New `Status.tsx` page + Open Anomalies section [CHECKPOINT]
**~280 lines changed**

**Files:**
- New: `cloud/apps/web/src/pages/Status.tsx`
- New: `cloud/apps/web/src/components/status/OpenAnomaliesSection.tsx`
- New: `cloud/apps/web/src/components/status/AnomalyRow.tsx`
- New: `cloud/apps/web/src/components/status/ReprobeConfirmModal.tsx`
- `cloud/apps/web/src/api/operations/run-anomaly.ts` (new)
- `cloud/apps/web/src/App.tsx` (route `/status` now points to `Status`, not `StatusRedirect`)
- Tests: `Status.test.tsx`, `AnomalyRow.test.tsx`

**Changes:**

1. **`Status.tsx` shell:**
   - Reads `?domain` and `?type` from URL params.
   - Renders header with filter dropdowns, then `OpenAnomaliesSection`, then a placeholder (`<div>Active Evaluations coming in W4</div>` removed in W5).
   - Polling: `useQuery` with `requestPolicy: 'network-only'` and a 5-second `setInterval` that triggers refetch.

2. **`OpenAnomaliesSection`:**
   - Calls `openRunAnomalies` with current filters.
   - Renders amber banner header (matching `StalledModelsBanner` styling) with count + Refresh button.
   - Empty state: "No open anomalies" with calm visual treatment (no amber chrome).
   - Each row uses `AnomalyRow`.

3. **`AnomalyRow`:**
   - Columns: domain, run, type label (from `displayLabel`), subject (from `displaySubject`, truncated, clickable for transcript types), age (relative time).
   - Action stack rendered conditionally on `displayLabel`/type:
     - `INVALID_RESPONSE_FAILURE` → `[Re-probe]` `[View transcript]` `[Resolve]`
     - `STRANDED_TRANSCRIPT` / `ORPHAN_TRANSCRIPT` → `[View transcript]` `[Resolve]` (re-probe deferred for non-EMPTY types in v1)
     - `PAIR_ASYMMETRY` → `[View pair]` `[Resolve]`
     - `SUMMARIZING_STALL` / `MODEL_TRANSCRIPT_SHORTFALL` / `SCHEDULED_COUNT_MISMATCH` → `[View run]` `[Resolve]`
     - **default (unknown future types)** → `[Resolve]` only (defensive; renders `displayLabel` and `displaySubject` as best-effort)
   - Re-probe button opens `ReprobeConfirmModal` showing the API-supplied `estimatedCost`.
   - Resolve button calls mutation directly (no modal).
   - "Re-probing…" intermediate state shown when mutation is in flight.
   - Disabled state with `Limit reached` chip when `reprobeLimitReached === true`. Tooltip on the disabled button reads: "This slot has been re-probed 3 times. Use [Resolve] to close manually; if the underlying issue persists, the next sweep will re-create the anomaly."

4. **`ReprobeConfirmModal`:**
   - Shows: "This will soft-delete the existing transcript and trigger a new LLM call. Estimated cost: $X.XX."
   - Confirm → call mutation. Cancel → close.
   - Cost estimate read from anomaly details (added in W2 query).

**Verification:**
- Component test: `OpenAnomaliesSection` renders empty state correctly.
- Component test: `AnomalyRow` renders the correct action stack for each anomaly type.
- Component test: clicking `[Re-probe]` opens the confirm modal.
- Component test: clicking `[Resolve]` invokes the mutation without a modal.
- E2E test: navigate to `/status` with seeded anomalies in the test DB; verify rows appear correctly.

---

### Wave 4 — Enhanced `DomainEvaluationStatusPanel` [CHECKPOINT]
**~200 lines changed**

**Files:**
- `cloud/apps/web/src/components/domains/domainTrials/DomainEvaluationStatusPanel.tsx` (augment per-model row)
- New helper: `cloud/apps/web/src/lib/eta-throughput.ts` (ETA + throughput computation, pure functions)
- New helper: `cloud/apps/web/src/lib/cost-projection.ts` (cost spent/projected, pure functions)
- Tests for both helpers

**Changes:**

1. **Per-model row layout:** Add columns for ETA, throughput, status flag, cost. Sorted by ETA descending (worst first), empty-ETA rows last alphabetically.

2. **`eta-throughput.ts`:**
   - `computeRollingThroughput(modelId, transcripts, windowMs)` — count of transcripts in last N ms, divided by N/60s.
   - `computePerModelEta(modelId, totalExpected, completedCount, throughputTpm)` — returns ETA in ms or `null` if insufficient data (< 3 completions).
   - `computeRunEta(perModelEtas)` — max across in-progress models.
   - All pure functions, no React or DB.

3. **`cost-projection.ts`:**
   - `computeCostSpent(modelId, completedTranscripts)` — sum of `estimatedCost`.
   - `computeCostProjected(spent, completedCount, totalExpected)` — `spent / completed * total` (linear extrapolation).
   - Returns `null` for `done` rows where projected isn't displayed.

4. **Status flag:** Read `Run.stalledModels[]` from the run row. If model id is in the array, render `stalled`. If completion count == expected, render `done`. Otherwise empty cell.

5. **"Show N more" affordance:** Done models are collapsed under an expandable section. Click expands.

**Verification:**
- Unit test: `computeRollingThroughput` returns expected counts for various windows and inputs.
- Unit test: `computePerModelEta` returns null when fewer than 3 completions.
- Unit test: `computeRunEta` returns max across in-progress models, ignoring nulls.
- Unit test: `computeCostProjected` handles the zero-completions edge case.
- Component test: panel renders all 4 new columns correctly with seeded data.
- Component test: rows sort by ETA descending; empty-ETA rows go last.
- Component test: `done` rows render under "Show N more" by default.

---

### Wave 5 — Active Evaluations on Status page + filters [CHECKPOINT]
**~200 lines changed**

**Files:**
- `cloud/apps/web/src/pages/Status.tsx` (extend with active evaluations section + drawer)
- New: `cloud/apps/web/src/components/status/ActiveEvaluationsSection.tsx`
- New: `cloud/apps/web/src/components/status/StatusFilters.tsx`
- `cloud/apps/web/src/api/operations/active-evaluation.ts` (new)
- Tests

**Changes:**

1. **`ActiveEvaluationsSection`:**
   - Calls `activeEvaluations` with current `domain` filter only (per Decision 4).
   - Renders one `DomainEvaluationStatusPanel` per active evaluation, grouped under domain name headers.
   - Empty state: "No active evaluations."
   - Click a run row → set `?runId=<id>` in URL → render `DomainEvaluationStatusDrawer`.

2. **`StatusFilters`:**
   - Domain dropdown: "All Domains" + one entry per domain (fetched via `domains` query).
   - Type dropdown: "All Types" + one entry per `RunAnomalyType` enum value.
   - On change: update URL params, no localStorage.
   - Type filter is visually grouped above the Open Anomalies section to signal scope.

3. **Drawer integration:**
   - Reuse `DomainEvaluationStatusDrawer` exactly as it is on `DomainStatus.tsx` today.
   - Drawer opens when `?runId` is set; closes by clearing the param.

**Verification:**
- Component test: filter dropdowns reflect URL params on initial render.
- Component test: changing the domain filter re-fetches both anomalies and active evals.
- Component test: changing the type filter re-fetches anomalies but NOT active evals (Decision 4).
- Component test: clicking a run in the drawer opens with the correct `?runId`.
- E2E test: full page renders with seeded data across multiple domains; filtering narrows the view.

---

### Wave 6 — Route removal + cleanup + sweep [CHECKPOINT]
**~120 lines changed**

**Files to delete:**
- `cloud/apps/web/src/pages/StatusRedirect.tsx`
- `cloud/apps/web/src/pages/DomainStatus.tsx`
- Any orphaned queries (e.g., `DOMAIN_TRIAL_RUNS_STATUS_QUERY`) — verify no consumers remain

**Files to modify:**
- `cloud/apps/web/src/App.tsx` — remove `/domains/status/:domainId` and `/domains/status` routes; remove `StatusRedirect` import
- Search-and-update any internal URL generators that point at `/domains/status/`

**Sweep procedure:**
1. `git grep '/domains/status' cloud/` — list all matches.
2. For each match, rewrite to `/status` (or remove if dead).
3. Re-run grep; should return zero production-code matches (`docs/`, historical fixtures OK).
4. Verify no imports of `StatusRedirect` or `DomainStatus` remain.
5. **Component regression sweep:** `git grep -l 'DomainEvaluationStatusPanel\|DomainEvaluationStatusDrawer' cloud/apps/web/src/` — list all consumers. After Wave 4 augments the panel, manually verify each remaining consumer renders correctly with the new fields (the augmentation is additive; missing data renders as empty cells, not crashes — but verify).

**Verification:**
- Unit test: navigating to `/domains/status/<id>` in the React Router test environment renders the not-found surface, not a redirect.
- E2E test: clicking the top-nav "Status" link goes to the new `/status` page.
- Build verification: `npm run build --workspace @valuerank/web` passes with no unresolved imports.
- Search verification: `git grep '/domains/status' cloud/apps/web/src/` returns zero matches.

---

## Estimated Total Diff

| Wave | Approx. lines |
|------|--------------|
| W1 — Schema + detector + audit | 150 |
| W2 — GraphQL queries + mutations | 250 |
| W3 — Status.tsx + Open Anomalies | 280 |
| W4 — Enhanced panel | 200 |
| W5 — Active Evals + filters | 200 |
| W6 — Route removal + sweep | 120 |
| **Total** | **~1200 lines** |

Each wave is at or under the 300-line `[CHECKPOINT]` target.

---

## Test Strategy

| Layer | Test type | Where |
|-------|-----------|-------|
| Detector + persistence | Unit + integration with test DB | `cloud/apps/api/tests/services/run/anomaly-detection.test.ts` |
| GraphQL queries + mutations | Integration with test DB | `cloud/apps/api/tests/graphql/...` |
| ETA / cost helpers | Pure unit tests (no DOM) | `cloud/apps/web/src/lib/...test.ts` |
| Components | React Testing Library | `cloud/apps/web/src/components/status/...test.tsx` |
| Page | Component + E2E (seeded DB) | `cloud/apps/web/src/pages/Status.test.tsx` |
| Route removal | Router-level test | `cloud/apps/web/src/App.test.tsx` |

The DB-level integration tests run against the existing test database. Per `cloud/CLAUDE.md`, the test DB setup is `npm run db:test:setup` and migrations are applied automatically.

---

## Residual Risks

- **Existing anomaly types use transcript-keyed subjects; only `INVALID_RESPONSE_FAILURE` is slot-keyed.** Mixed conventions are confusing and may bite future implementers. **verification:** Add a code comment in `anomaly-detection.ts` documenting the convention per type. Add a unit test that asserts subject format per type. Migrating other types is left as an explicit follow-up tracked in `STATUS.md`.
- **PgBoss enqueue is not in the same transaction as DB writes.** A successful commit followed by a failed enqueue leaves the slot soft-deleted with no replacement probe scheduled. **verification:** Add an integration test that simulates an enqueue failure (mock `boss.send` to throw) and verifies the user-visible behavior: anomaly stays open, error chip appears, manual `[Re-probe]` retry works. Document the fallback path explicitly in the mutation's JSDoc.
- **Cross-domain `openRunAnomalies` query joins `run → definition → domain` which is 2 join hops.** At higher volumes this could be slow. **verification:** Run an EXPLAIN ANALYZE on the query against prod-shaped data (current 2 anomalies; injected 1000 synthetic rows for a load test). Assert p95 < 500ms. If it fails, add an explicit `domain_id` denormalization on `run_anomalies` (out of scope for v1; deferred).
- **Removing `/domains/status/:domainId` will break any external links we don't know about.** Slack pastes, emails, browser bookmarks. **verification:** `git grep '/domains/status' cloud/` returns zero production-code matches. Send a Slack message to the team announcing the change with the new URL. Accept that bookmarks will 404; this is the explicit "break loudly" choice (US4).
- **`stalled` flag on the per-model row amplifies the binary stalledModels[] false-positive problem.** Mistral and reasoning models will more frequently appear "stalled" in this prominent UI. **verification:** Document a follow-up ticket for the activity-vs-success detector rework. In the meantime, the spec acknowledges the limitation and the new UI does not promote the flag with extra visual prominence (it's an empty-cell-by-default column, not a banner).
- **Re-probe limit of 3 may bite legitimate retry needs (e.g., 3 transient provider failures in a row).** **verification:** Log an info-level message on every re-probe attempt with the current count. If telemetry shows the cap is hit by legitimate workflows, raise the cap or add an admin override. Until then, the manual escape hatch is to soft-delete the limit-reached anomaly via `[Resolve]` and let the next sweep re-detect.
- **No per-domain authorization on the new mutations.** If ValueRank later introduces domain-scoped access (e.g., for external collaborators), `reprobeAnomalySlot` and `resolveRunAnomaly` need to add a domain check. **verification:** Document this in `STATUS.md` as a known assumption tied to the flat-user-model. When access controls are added, a code search for `requireAuth` (or whatever the new helper is) in these two mutation files will surface them for retrofit.

---

## Out of Scope (deferred)

These are acknowledged as real concerns but are not addressed in this feature. They appear in the spec's Non-Goals section and have been confirmed during planning:

- Stall detection improvements (activity-vs-success split, per-model thresholds)
- `slow` tier in UI
- `probe_attempts` log for transient error retention
- Investigating empty `error_code` column
- WebSocket/SSE replacement for 5-second polling
- Pagination on `openRunAnomalies` query (added when volume justifies)
- Re-probe action for `STRANDED_TRANSCRIPT` / `ORPHAN_TRANSCRIPT` types (deferred to follow-up alongside subject-key migration for those types)
- Per-domain authorization on mutations (deferred until per-domain access control exists at all)
- Anomaly trend charts, bulk-resolve UI, recent-activity feed, per-scenario heatmaps, cost-per-model time-series
