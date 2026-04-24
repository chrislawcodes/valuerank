# Plan — Feature 034: Hygiene Follow-ups

**Branch**: feat/034-hygiene-follow-ups
**Source spec**: `spec.md` in this directory

---

## Review Reconciliation

- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: HIGH US-1 both-predicates: fixed — spec now uses `getReconcileWindowDays()` helper at both call sites. MEDIUM US-4 anomaly signal: fixed — spec extends `hasRecoveryActivity()` to include orphan-backlog condition. MEDIUM US-2 field shape: fixed — details additively extended with `malformedTranscriptIds`, existing `transcriptIds` preserved.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: HIGH US-4 stranded backlog: fixed — scheduler activity check extended. MEDIUM US-1 two call sites: fixed — single helper used at both. MEDIUM US-2 payload contract: fixed — additive not breaking. MEDIUM US-3 min-probes guard: fixed — preserved per sibling-pair.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH US-3 breaking details shape: fixed — additive not breaking. HIGH US-1 sync: fixed — single helper at both call sites. MEDIUM US-4 memory: fixed — DB `LIMIT` not in-memory slice. MEDIUM US-2 sentinel: fixed — discriminated union replaces magic number.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted

## Implementation Waves

### Wave 1 — US-1 env-var window [CHECKPOINT]

**Files**
- `cloud/apps/api/src/services/run/scheduler.ts`: add `function getReconcileWindowDays(): number` helper that reads `process.env.RUN_RECONCILE_WINDOW_DAYS`, parses as int, falls back to `RECENT_COMPLETED_RUN_WINDOW_DAYS` when unset/invalid, `log.warn` on invalid. Replace both hardcoded reads of `RECENT_COMPLETED_RUN_WINDOW_DAYS` (in `hasRecoveryActivity` and `enqueueRunStateReconcileJobs`) with calls to the helper.
- `cloud/apps/api/tests/services/run/scheduler.test.ts` (if it exists, else a new focused test file): test helper with valid/invalid/unset env values.

**Estimated size**: ~40 lines.

### Wave 2 — US-2 strict-mode + US-4 DB cap [CHECKPOINT]

**Files**
- `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts`: rewrite `extractTranscriptTokenUsage` to return discriminated union `{kind:'ok',...} | {kind:'malformed',reason}`. Update `reconstructOrphans` to switch on `kind`, routing malformed to `failedIds` with reason logged.
- `cloud/apps/api/src/services/run/anomaly-detection.ts`: `findOrphanTranscripts` lives here as a raw SQL `$queryRaw` (per plan-review correction — not Prisma `findMany`). Extend the signature: `findOrphanTranscripts(runId, limit?)`. Apply `LIMIT $limit` in the raw SQL when the limit parameter is defined. Add a parallel `countOrphanTranscripts(runId): Promise<number>` helper using `SELECT COUNT(*) FROM transcripts ... WHERE p.id IS NULL AND t.created_at < ...` so the sweep can detect backlog without loading rows.
- `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts` (continued): `reconstructOrphans` calls `findOrphanTranscripts(runId, ORPHAN_RECONSTRUCTION_CAP_PER_TICK)` and then `countOrphanTranscripts(runId)`; if `total > cap`, log `info` with `{total, processing, overflow}`.
- `cloud/apps/api/src/services/run/anomaly-thresholds.ts`: add `export const ORPHAN_RECONSTRUCTION_CAP_PER_TICK = 500`.
- `cloud/apps/api/tests/queue/handlers/run-state-reconcile.test.ts`: tests for strict-mode returning malformed, DB-level LIMIT at 500, backlog logging.

**Estimated size**: ~150 lines.

### Wave 3 — US-3 multi-sibling pair asymmetry [CHECKPOINT]

**Files**
- `cloud/apps/api/src/services/run/anomaly-detection.ts`: rewrite `detectPairAsymmetry` to fetch all siblings, compute success rates, filter by per-sibling `PAIR_ASYMMETRY_MIN_PROBES` guard, compute max delta, fire when `> PAIR_ASYMMETRY_THRESHOLD_PCT`. Extend `details` payload additively (keep existing fields pointing at max-delta sibling; add `siblingRunIds`, `siblingSuccessRates`, `maxDeltaPct`, `skippedUnderSampledRunIds`).
- `cloud/apps/api/tests/services/run/anomaly-detection.test.ts`: tests for (a) 3-sibling group with one outlier at the bottom, (b) 4-sibling bimodal cluster (two runs high, two low — max delta should span the clusters), (c) 3-sibling group where one is under-sampled and should be skipped, (d) all-equal case returns null, (e) payload-size sanity — 10-sibling group yields `details` under 4 KB.

**Estimated size**: ~120 lines.

### Wave 4 — US-4 scheduler activity extension + enqueue predicate + STATUS update [CHECKPOINT]

**Predicate correction per plan-review** (all three reviewers flagged this): orphans are defined by "transcript exists, no matching `probe_result`, aged beyond `ORPHAN_TRANSCRIPT_MIN_AGE_SECONDS`" — NOT by `summarizedAt IS NOT NULL`. The earlier draft wording was wrong. The predicate below matches the existing `findOrphanTranscripts` logic.

**Files**
- `cloud/apps/api/src/services/run/scheduler.ts` — two changes in one pass:
  1. **`hasRecoveryActivity()`**: extend to also return true when orphan backlog exists. Use a predicate that matches `findOrphanTranscripts`: `EXISTS (SELECT 1 FROM transcripts t LEFT JOIN probe_results p ON p.run_id = t.run_id AND p.scenario_id = t.scenario_id AND p.model_id = t.model_id AND p.sample_index = t.sample_index WHERE p.id IS NULL AND t.deleted_at IS NULL AND t.created_at < NOW() - INTERVAL '<ORPHAN_MIN_AGE_SECONDS> seconds' AND <run updated within reconcile window>)`. Use `EXISTS` / `LIMIT 1` to keep it cheap.
  2. **`enqueueRunStateReconcileJobs()`**: the current COMPLETED-run selection fires only when stranded transcripts exist (`summarized_at IS NULL`). Add a second condition OR'd in: OR the run has any orphan transcripts (same predicate as #1, scoped per run). Without this, even when `hasRecoveryActivity()` keeps the scheduler alive, a COMPLETED run with orphan-only backlog never gets a `run_state_reconcile` job — so the backlog never drains.
- `cloud/apps/api/tests/services/run/scheduler.test.ts`: tests that (a) a pure-orphan-backlog COMPLETED run keeps the scheduler active, AND (b) gets enqueued for reconcile.
- `STATUS.md`: remove resolved items (#1, #4, #5, #6).

**Estimated size**: ~80 lines.

### Wave 5 — verification + soak [CHECKPOINT]

- Preflight lint + test + build for `@valuerank/api`.
- `grep -RIn "RECENT_COMPLETED_RUN_WINDOW_DAYS" cloud/apps/api/src` — all matches either inside the helper or replaced with the helper call.
- `grep -RIn "inputTokens: 0" cloud/apps/api/src/queue/handlers/run-state-reconcile.ts` — zero matches (the silent-zero branch is gone).
- Manual smoke: set `RUN_RECONCILE_WINDOW_DAYS=60` in test env, verify the predicate in scheduler reflects 60 not 30. Per plan-review feedback, Wave 1 already has automated tests for valid/invalid/unset values — the manual smoke is a belt-and-suspenders check, not the primary verification.

---

## Residual Risks (each with `verification:`)

- **Risk: memoizing `getReconcileWindowDays()` means env var changes need a process restart. Operator who changes the value mid-session won't see it.**
  verification: comment explicitly in the helper. Acceptable; env-var changes are deploy-time config. Documented in STATUS.md if hot-reload becomes needed.

- **Risk: the new orphan activity predicate is a heavier query (JOIN or subquery) that runs every scheduler tick.**
  verification: before merge, `EXPLAIN` the new `hasRecoveryActivity` query against a production snapshot; target < 100 ms p99; add a functional index if the plan is sequential.

- **Risk: discriminated-union return type for `extractTranscriptTokenUsage` changes its public signature.**
  verification: grep for every caller; confirm all callers updated in the same wave. No external consumers.

- **Risk: US-4 capped orphan draining means a 10k-backlog takes 20 ticks × 5 min = ~100 min to fully drain.**
  verification: operator-acceptable at current scale. If backlog becomes common, raise the cap or run the sweep at a tighter cadence — follow-up on STATUS.md.

- **Risk: US-3 additive details shape means the payload grows over time. On a 10-run pair group, `siblingRunIds` is 9 entries, `siblingSuccessRates` is 9 entries. JSONB column stays manageable.**
  verification: size sanity — confirm `details` stays < 4 KB for realistic pair groups.

---

## Verification Before Push

Per `cloud/CLAUDE.md` preflight:
1. `npx turbo lint --filter=@valuerank/api`
2. `npm run db:test:setup`
3. `npx turbo test --filter=@valuerank/api`
4. `npx turbo build --filter=@valuerank/api`

Validation section in the PR description lists each command and pass/fail.

---

## Constitution Validation

| Requirement | Status |
|---|---|
| Type safety — no `any` | PASS — discriminated union is strict-typed |
| File size ≤ 400 lines prod | PASS — edits small, no new files |
| Test coverage ≥ 80% | PASS — each wave has test coverage |
| Structured logging | PASS — new logs use existing `log.*` |
| Prisma migrations | N/A — no schema change |
| Protected files untouched | PASS — CLAUDE.md, AGENTS.md, MEMORY.md, .gitignore off-limits; STATUS.md only touched in wave 4 for the resolved-item cleanup |
