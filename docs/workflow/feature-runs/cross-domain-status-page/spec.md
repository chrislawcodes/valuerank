# Spec: Cross-Domain Status Page + Empty-Response Anomalies

**Slug:** cross-domain-status-page
**Created:** 2026-04-27
**Status:** draft
**Input:** Replace the per-domain `/domains/status/:domainId` page with a cross-domain `/status` page that surfaces open RunAnomalies (with type-aware actions including single-slot re-probe) and active evaluations across all domains using an enhanced per-model panel. Add a new `INVALID_RESPONSE_FAILURE` anomaly type detected via the existing run-completion reconciliation hook. Stall detection (binary `stalledModels[]`) stays unchanged for this feature.

---

## Background

Today's `Status` top-nav link is a redirect to `/domains/status/:domainId`, a per-domain evaluation health page that requires the user to pick one domain to view. That made sense when researchers worked inside a single domain at a time, but it surfaces nothing about *anomalies* (the existing `RunAnomaly` table has shipped detection + storage but no UI surface) and forces the user to switch domains to find runs that need attention.

Separately, reasoning models like `deepseek-reasoner` occasionally emit zero visible response tokens — the model burns its budget on internal reasoning and surfaces an empty answer. PR #760 (merged 2026-04-25) added adapter-level guards that now raise `LLMError(INVALID_RESPONSE)` when this happens, marking the probe as **FAILED** with `error_code='INVALID_RESPONSE'` and creating no transcript. Because `INVALID_RESPONSE` is **not** in `RETRYABLE_CODES`, the failure is terminal — the slot stays empty until a human intervenes. There is currently no UI surface for these failures: a researcher would have to query `probe_results` directly to find them.

Two adjacent failure modes need surfacing in one UI:

| failure mode | when | data shape |
|---|---|---|
| Post-#760 invalid-response failures | Going forward, when an adapter guard fires | FAILED `probe_results` row with `error_code='INVALID_RESPONSE'`, **no transcript** |
| Historical empty transcripts | Pre-#760 data, e.g. the 1,272 transcripts found in the 2026-04-25 prod scan (1,250 in run `cmmzamyy6039ikdtm5nszgsr9`) | `transcripts` row with non-null `summarizedAt` but zero visible response text |

Both produce the same operator question: *should we re-probe this slot?* The right UI doesn't care which underlying shape the data takes — both deserve the same anomaly row and the same `[Re-probe]` action.

This feature solves both problems with the same surface:

1. `/status` becomes a cross-domain page that surfaces open anomalies (any type, any domain) at the top, with type-aware actions including single-slot re-probe.
2. A new `INVALID_RESPONSE_FAILURE` anomaly type fires for both data shapes above. Detection happens at run-completion reconciliation (the same hook that already drives `STRANDED_TRANSCRIPT` reconciliation in commit #753) and via the existing audit sweep for backfill of historical empties.
3. A new single-slot re-probe mutation lets a human resolve an anomaly by spending a fresh LLM call on the affected slot. The mutation handles both data shapes: if a transcript exists at the slot it is soft-deleted; if only a FAILED probe exists, the probe_results row is hard-deleted. In either case a fresh `probe_scenario` job is enqueued. Auto-resolve via `syncAnomalies()` closes the anomaly when the new probe completes successfully.
4. The active-evaluation panel is enhanced with per-model ETA, throughput, status flag, and cost (spent/projected) so a user can tell at a glance whether a long-running batch is healthy, slow, or stalled.

The per-domain `/domains/status/:domainId` route is removed entirely — no redirect — to force any URL-generation site (post-launch redirects, Slack pastes, bookmarks) to be tracked down and updated. With 6 users (5 admin) on the platform, this is a Slack message and a `git grep`.

---

## Assumptions

1. **Authorization.** The new `/status` page requires authentication but NOT admin role. This matches today's `/status` accessibility for researchers.
2. **Active Evaluations scope.** The Active Evaluations section includes runs in `RUNNING` or `SUMMARIZING` status. `PENDING`, `PAUSED`, `FAILED`, `CANCELLED`, and `COMPLETED` are excluded from the live panel.
3. **Re-probe confirmation.** Clicking the `[Re-probe]` button on an anomaly row opens a confirmation modal noting that the existing transcript will be soft-deleted and a new LLM call will be made. The manual `[Resolve]` button does NOT show a confirmation (it is idempotent — the detector can re-fire if the underlying condition is still present).
4. **Filter UX.** The domain filter is a single-select dropdown with "All Domains" as the default. The type filter is a single-select dropdown with "All Types" as the default. Filter state persists in URL query params (`?domain=`, `?type=`) only. No `localStorage`.
5. **Per-model ETA.** ETA per model = `(remaining transcripts) / (rolling 5-minute throughput for that model)`. If the model has fewer than 3 recent completions, fall back to the overall run rate.
6. **Run-level ETA.** ETA at run level = the worst-model ETA across in-progress models (the honest "when can I move on" answer).
7. **Per-model cost.** Cost spent per model = `SUM(transcript.estimatedCost)` for completed transcripts. Cost projected = `current avg cost per transcript × remaining transcripts`. Cost is shown per model only — there is no run-level cost rollup.
8. **Status flag column.** Per-model status flag supports `rate-limited`, `erroring`, `stalled` (sourced from existing `Run.stalledModels[]`), and `done`. Flag is best-effort: surfaced only when underlying data exists; absence is an empty cell, not "unknown."
9. **Re-probe mutation behavior — dual path.** Re-probe handles two slot states: (a) **Transcript-exists path:** soft-delete the existing transcript (set `deletedAt`), then hard-delete the corresponding `probe_results` row to clear the SUCCESS+transcriptId idempotency guard at `probe-scenario/handler.ts:82-92`. (b) **No-transcript path:** the slot has only a FAILED `probe_results` row (post-#760 path); hard-delete it. In both paths, enqueue a new `probe_scenario` job at the same `(runId, scenarioId, modelId, sampleIndex)` slot using a `singletonKey` derived from the slot tuple to dedupe concurrent enqueues.
10. **`INVALID_RESPONSE_FAILURE` detection criterion — dual path.** The detector emits an anomaly draft for any slot matching either of the following, with subject `<runId>:<scenarioId>:<modelId>:<sampleIndex>` in both cases: **(a) Forward path:** a `probe_results` row with `status='FAILED'`, `error_code='INVALID_RESPONSE'`, `deleted_at IS NULL`, and no associated non-deleted transcript. **(b) Historical path:** a `transcripts` row with `deleted_at IS NULL`, `summarized_at IS NOT NULL`, and `getTranscriptResponseText(content).length === 0` (the same helper used by `computeTranscriptResponseSha256`). The detector hooks into `maybeCompleteRun()` in `summarize-persistence.ts` via the existing `syncAnomalies()` pattern. The audit sweep adds the new type to the existing audit job for retrospective backfill of historical empties.
11. **Component reuse.** `DomainEvaluationStatusPanel` and `DomainEvaluationStatusDrawer` are reused as-is, augmented with the new per-model fields. The LLM Models reference panel from current `DomainStatus` is dropped (it is config, not status; lives in `/settings/models`).
12. **Polling.** The `/status` page polls every 5 seconds while open — matching the existing `DomainStatus` cadence. The drawer state for a selected run is in URL state via `?runId=`.
13. **Hard route removal.** `/domains/status/:domainId` is removed entirely — no redirect. `StatusRedirect.tsx`, `DomainStatus.tsx`, and any `DOMAIN_TRIAL_RUNS_STATUS_QUERY` consumers that no longer have callers are deleted. URL-generation sites are swept and updated.

---

## Non-Goals

- Stall detection improvements (the binary `Run.stalledModels[]` stays unchanged for this feature)
- A `slow` tier in the UI between healthy and stalled
- Per-model stall thresholds
- A `probe_attempts` log for retaining transient error codes across retries
- Investigation of why `probe_results.error_code` is empty in prod for the last 30 days
- Anomaly trend charts or time-series views
- Bulk-resolve UI for anomalies
- A "Recent activity" / completed runs feed on `/status`
- Per-scenario or per-condition heatmaps
- Cost-per-model time-series sparkline

---

## Layout (visual reference)

```
┌─────────────────────────────────────────────────────────────────┐
│  Status                                                         │
│  Filter:  [ All Domains ▾ ]   [ Type: All ▾ ]                  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ ⚠  Open Anomalies (3)                          [Refresh]  │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │ Domain        Run        Type            Subject  Age     │ │
│  │ Job Choice  → run-abc12  Empty Response  tr-cmm…  2h      │ │
│  │             [Re-probe]  [View transcript]  [Resolve]      │ │
│  │ Neighborhood→ run-def34  Stranded        tr-xyz…  1d      │ │
│  │             [Re-probe]  [View run]  [Resolve]             │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Active Evaluations (1)                                    │ │
│  ├───────────────────────────────────────────────────────────┤ │
│  │ ▼ Job Choice                                              │ │
│  │   Job Choice / run-abc12              [Open run details →]│ │
│  │   Started 14:32  ·  ETA 16:18                             │ │
│  │   [████████████░░░░░░░] 67%   840 / 1,250 transcripts     │ │
│  │                                                           │ │
│  │   Models — sorted by ETA, bottleneck first                │ │
│  │   ⚠ deepseek-reasoner  40/125  ~25m  3 t/min  rate-lim    │ │
│  │   ⏳ grok-4-0709       104/125  ~4m  5 t/min              │ │
│  │   ⏳ deepseek-chat     108/125  ~3m  6 t/min              │ │
│  │   ✓ claude-sonnet-4-5 125/125 done                        │ │
│  │   [Show 4 more ▾]                                         │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

Per-model row columns: status icon · model id · progress (X/Y) · ETA · throughput (t/min) · status flag · cost (`spent / projected`).

---

## User Stories

### User Story 1 — View open anomalies cross-domain (Priority: P1)

As a researcher, I want to see all open `RunAnomaly` records across every domain in one place, so I can know what needs attention without drilling into individual runs.

**Why this priority:** Anomaly detection has been shipped to the data layer, but no UI surface reads the table today. Without this story, the entire anomaly system remains invisible to users — defeating the purpose of the existing detector work.

**Independent Test:** With at least one open `RunAnomaly` row in the database (any type, any domain), navigate to `/status`. Verify the Open Anomalies section renders the row with its domain name, run id, anomaly type label, subject, and age. Verify the action buttons appropriate to the anomaly type are present.

**Acceptance Scenarios:**

1. **Given** open anomalies exist across multiple domains, **When** the user opens `/status`, **Then** the Open Anomalies section lists every anomaly with `resolvedAt IS NULL`, ordered by `firstSeenAt` descending, with columns: domain name, run id, type label, subject, age (relative time).
2. **Given** no open anomalies exist, **When** the user opens `/status`, **Then** the Open Anomalies section shows "No open anomalies" with a calm visual treatment (no amber chrome).
3. **Given** the user is viewing `/status` while a new anomaly is detected upstream, **When** 5 seconds pass (one polling tick), **Then** the new anomaly appears in the list without a manual refresh.

### User Story 2 — View active evaluations cross-domain (Priority: P1)

As a researcher, I want to see active evaluations from every domain in one place, so I can monitor in-progress work without switching domains.

**Why this priority:** The current `/status` redirect picks one domain via `localStorage` and shows nothing for the others. With 4 domains and typically 0-1 active evaluations across the system, the per-domain default leaves users on an empty page most of the time. This story is the direct replacement for that behavior.

**Independent Test:** With at least one run in `RUNNING` or `SUMMARIZING` status across any domain, navigate to `/status`. Verify the Active Evaluations section renders the run grouped under its domain name, using the existing `DomainEvaluationStatusPanel` augmented with the new per-model fields (ETA, throughput, status flag, cost). Verify clicking a run opens the existing `DomainEvaluationStatusDrawer`.

**Acceptance Scenarios:**

1. **Given** runs in `RUNNING` or `SUMMARIZING` status exist across multiple domains, **When** the user opens `/status`, **Then** the Active Evaluations section groups them by domain name and renders a `DomainEvaluationStatusPanel` for each.
2. **Given** no active evaluations exist, **When** the user opens `/status`, **Then** the Active Evaluations section shows "No active evaluations."
3. **Given** the user clicks a run row inside `DomainEvaluationStatusPanel`, **When** the click fires, **Then** the existing `DomainEvaluationStatusDrawer` slides in from the right, scoped to that run, and `?runId=<id>` is reflected in the URL.
4. **Given** a run completes while the user is viewing `/status`, **When** the next polling tick fires, **Then** the run drops out of the Active Evaluations section.

### User Story 3 — Detect invalid-response failures as anomalies (Priority: P1)

As a research operator, I want slots whose probe failed with `INVALID_RESPONSE` (forward) or whose transcript has empty visible response (historical) to be flagged automatically as `INVALID_RESPONSE_FAILURE` anomalies, so I have a record of probes that produced no usable answer and can decide whether to re-probe.

**Why this priority:** This is the originating use case for the feature. Without detection feeding the anomaly table, the new UI surface has nothing to show that the existing 6 anomaly types didn't already have. Detection must ship together with the surface. Detector covers both forward (post-PR #760) and historical (pre-PR #760) data shapes — see Background.

**Independent Test (forward path):** Use a fixture run where a `probe_results` row has `status='FAILED'`, `error_code='INVALID_RESPONSE'`, no associated transcript. Trigger run-completion reconciliation. Verify a `RunAnomaly` row exists with `type = INVALID_RESPONSE_FAILURE`, `subject = <runId>:<scenarioId>:<modelId>:<sampleIndex>`, `resolvedAt IS NULL`.

**Independent Test (historical path):** Identify a pre-#760 transcript with `summarizedAt IS NOT NULL` and zero visible response text (e.g., `cmmzas9xi07cfkdtm2sibvtfl` in run `cmmzamyy6039ikdtm5nszgsr9`). Run the audit sweep. Verify a `RunAnomaly` row is created with the same shape as above and `source='audit'`.

**Acceptance Scenarios:**

1. **Given** a run completes with at least one slot in the forward-path failure shape (FAILED probe + INVALID_RESPONSE + no transcript), **When** `maybeCompleteRun()` runs the anomaly reconciler via `syncAnomalies()`, **Then** an `INVALID_RESPONSE_FAILURE` anomaly is created for each such slot with `subject = <runId>:<scenarioId>:<modelId>:<sampleIndex>` and `source = 'default'`.
2. **Given** the audit sweep runs over a previously completed run, **When** the sweep finds a transcript matching the historical-path criterion (empty visible response) that has no existing anomaly for the slot, **Then** the sweep creates an `INVALID_RESPONSE_FAILURE` row with `source = 'audit'`.
3. **Given** an `INVALID_RESPONSE_FAILURE` anomaly exists for a slot and neither the failed probe nor the transcript at that slot changes, **When** the detector re-runs, **Then** `lastSeenAt` is updated but no new row is created (uniqueness constraint on `runId + type + subject + source`).
4. **Given** an `INVALID_RESPONSE_FAILURE` anomaly is open and a re-probe lands a new SUCCESS probe + non-empty transcript at the same slot, **When** the detector re-runs after `maybeCompleteRun()`, **Then** the existing anomaly is auto-resolved (its `resolvedAt` is set) by the `syncAnomalies()` symmetric reconciliation logic — neither failure shape is detected at the slot any more, so the symmetric sync resolves it.

### User Story 4 — Remove the per-domain status route loudly (Priority: P1)

As the author of this feature, I want `/domains/status/:domainId` to fail loudly when accessed, so any code path or bookmark that still references it is surfaced for cleanup rather than silently masked.

**Why this priority:** A redirect would hide the migration. The user's stated preference is explicit: break loudly, with the small user base making the cost of breakage low and the cleanup value high.

**Independent Test:** After deploying the change, navigate to a previously valid `/domains/status/<some-domain-id>` URL. Verify the route does not render the old page and does not redirect to the new one. Run `git grep '/domains/status'` and verify no production code paths still generate the URL.

**Acceptance Scenarios:**

1. **Given** the feature is deployed, **When** any client navigates to `/domains/status/<id>`, **Then** the application renders the standard 404 / unknown-route surface (or whatever the app's existing not-found handling is).
2. **Given** the feature is deployed, **When** the developer runs `git grep '/domains/status'` against the working repo, **Then** zero production-code matches remain (matches in `docs/`, `tests/` of historical fixtures, and post-mortem notes are acceptable).
3. **Given** the feature is deployed, **When** the developer searches for `StatusRedirect`, `DomainStatus`, or `DOMAIN_TRIAL_RUNS_STATUS_QUERY` in `cloud/apps/web/src/`, **Then** any file with no remaining consumers is deleted, not left dangling.

### User Story 5 — Re-probe a single anomaly slot (Priority: P2)

As a researcher who has reviewed an `INVALID_RESPONSE_FAILURE` anomaly, I want a single-click `[Re-probe]` action that schedules a fresh LLM call for that exact slot, so I can resolve the anomaly with a real answer instead of writing SQL.

**Why this priority:** Without this, anomalies are read-only — users can see what's wrong but cannot act. Re-probe is the primary "fix" action for the feature's headline anomaly type. P2 (not P1) because users could still view, audit, and manually mark resolved without it; the page is functional in P1 alone.

**Independent Test:** With an `INVALID_RESPONSE_FAILURE` anomaly visible on `/status` (forward-path: FAILED probe with no transcript), click `[Re-probe]`. Confirm the modal. Verify a new `probe_scenario` job appears in the queue, the FAILED `probe_results` row is hard-deleted, and a new SUCCESS probe + transcript lands at the same slot. After `maybeCompleteRun()` runs, verify the original anomaly is auto-resolved. Repeat for the historical-path shape (transcript with empty visible response): verify the existing transcript is soft-deleted, the probe_results row is hard-deleted, and a new transcript lands.

**Acceptance Scenarios:**

1. **Given** an open `INVALID_RESPONSE_FAILURE` anomaly in the **forward-path shape** (FAILED probe, no transcript at slot), **When** the user clicks `[Re-probe]` and confirms in the modal, **Then** the system hard-deletes the FAILED `probe_results` row and enqueues a new `probe_scenario` job at the slot.
2. **Given** an open `INVALID_RESPONSE_FAILURE` anomaly in the **historical-path shape** (transcript with empty visible response, possibly with a SUCCESS probe_results row), **When** the user clicks `[Re-probe]` and confirms, **Then** the system soft-deletes the existing transcript, hard-deletes the corresponding `probe_results` row, and enqueues a new `probe_scenario` job.
3. **Given** the re-probe job runs and produces a new SUCCESS probe + non-empty transcript, **When** `maybeCompleteRun()` runs, **Then** the original anomaly is auto-resolved.
4. **Given** the re-probe job fails (e.g., provider error), **When** the job exhausts its retries, **Then** the original anomaly remains open and a row-level error chip appears on the anomaly indicating the re-probe attempt failed.
5. **Given** a re-probe is in flight, **When** the user views `/status`, **Then** the row shows "Re-probing…" status and the `[Re-probe]` button is disabled until the next polling tick reflects the outcome.
6. **Given** a slot already has a SUCCESS probe + non-empty transcript and no open anomaly, **When** the re-probe mutation is invoked for that slot via API, **Then** the mutation rejects with `FORBIDDEN_NON_ANOMALOUS_SLOT` (re-probe is gated to anomaly-eligible slots — see Edge Cases).
7. **Given** the slot has reached the re-probe limit (`details.reprobeAttempts >= 3`), **When** the user clicks `[Re-probe]`, **Then** the button is disabled in the UI and the mutation rejects with `REPROBE_LIMIT_EXCEEDED` if invoked directly.

### User Story 6 — Enhanced per-model status panel (Priority: P2)

As a researcher watching a long-running evaluation, I want each model's row in the status panel to show ETA, throughput, status flag, and cost (spent/projected), so I can identify the bottleneck without opening the full run detail page.

**Why this priority:** The current `DomainEvaluationStatusPanel` shows progress bars and that's it — the user can't tell which model is slow, which is rate-limited, or how much budget has been spent. P2 because the page is functional with the existing panel; this story makes it more useful for the long-batch case the user has flagged as historically painful.

**Independent Test:** With an active evaluation running across multiple models at varied throughput, open `/status`. Verify each in-progress model row shows progress (X/Y), ETA, throughput (t/min), status flag (when applicable), and cost (`spent / projected`). Verify rows are sorted by ETA with the bottleneck first. Verify completed models are collapsed under "Show N more."

**Acceptance Scenarios:**

1. **Given** an evaluation with multiple models at different completion percentages, **When** the user views `/status`, **Then** the Models table within `DomainEvaluationStatusPanel` is sorted by ETA descending (worst ETA first), with completed models collapsed under "Show N more."
2. **Given** a model with at least 3 recent completions, **When** ETA is computed for that model's row, **Then** the displayed ETA reflects rolling 5-minute throughput.
3. **Given** a model with fewer than 3 recent completions, **When** ETA is computed, **Then** the displayed ETA falls back to the overall run rate.
4. **Given** a model is in the existing `Run.stalledModels[]`, **When** the row is rendered, **Then** the status flag column shows `stalled` with appropriate visual treatment.
5. **Given** a model's row shows cost, **When** the model is in progress, **Then** cost is rendered as `spent / projected`. **When** the model is `done`, **Then** cost is rendered as `spent` only.
6. **Given** the run's overall ETA is computed, **When** displayed in the panel header, **Then** it equals the worst-model ETA across in-progress models.

### User Story 7 — Manual resolve as escape hatch (Priority: P2)

As a researcher, I want a `[Resolve]` button on each open anomaly so I can close anomalies that auto-resolution can't or shouldn't handle (e.g., I judge it's not worth re-probing, or the anomaly type's auto-resolve criterion is fuzzy).

**Why this priority:** Most anomalies will auto-resolve via the `syncAnomalies()` pattern when the underlying condition is fixed. The manual resolve button is a backstop for cases where the user has decided to accept the anomaly as data, not a bug. P2 because the page is usable without it (users can ignore old open anomalies indefinitely; the detector's idempotent re-fire prevents duplicates).

**Independent Test:** With any open anomaly visible on `/status`, click `[Resolve]`. Verify the anomaly is removed from the open list on the next polling tick. Verify the `RunAnomaly` row in the database has `resolvedAt` set. Verify no confirmation modal is shown (per Assumption 3).

**Acceptance Scenarios:**

1. **Given** an open anomaly, **When** the user clicks `[Resolve]`, **Then** the system invokes `resolveRunAnomaly(id)` and the row drops out of the open list on the next polling tick.
2. **Given** the user clicks `[Resolve]`, **When** the click fires, **Then** no confirmation modal is shown.
3. **Given** a manually resolved anomaly's underlying condition is still detected on the next reconciliation, **When** the detector runs, **Then** a new `RunAnomaly` row is created (the unique constraint allows re-creation because `resolvedAt` of the prior row is non-null and the constraint is on open anomalies).

### User Story 8 — Domain and type filters (Priority: P3)

As a researcher who works in one domain at a time, I want to filter the page to a single domain and/or anomaly type, so I can focus on the slice that matters to me right now.

**Why this priority:** The cross-domain default is the right starting point given current cardinality (4 domains, 2 open anomalies). Filters are polish — a researcher can mentally skip rows from other domains. P3 because the page is fully usable without filters at current volume.

**Independent Test:** With anomalies and active evaluations across multiple domains, navigate to `/status`. Use the domain filter dropdown to select one domain. Verify only rows from that domain appear in both Open Anomalies and Active Evaluations. Verify the URL reflects `?domain=<id>`. Use the type filter to narrow to one anomaly type and verify the same.

**Acceptance Scenarios:**

1. **Given** anomalies exist in multiple domains, **When** the user selects a domain in the filter dropdown, **Then** the Open Anomalies and Active Evaluations sections show only entries from that domain, and the URL reflects `?domain=<id>`.
2. **Given** the user selects a specific anomaly type, **When** the type filter is applied, **Then** only matching anomalies are shown, and the URL reflects `?type=<enum>`.
3. **Given** a URL with filter query params is shared, **When** another user opens it, **Then** the page renders with the same filter applied without requiring extra clicks.

---

## Edge Cases

- **Re-probe for a non-anomalous slot.** If a client invokes the re-probe mutation for a slot that does not have an open re-probe-eligible anomaly, the mutation rejects with `FORBIDDEN_NON_ANOMALOUS_SLOT`. Re-probing is gated to anomaly-eligible slots only — researchers do not get an "anyone can re-roll any transcript" lever.
- **Re-probe failure.** If the new `probe_scenario` job fails permanently after retries, the soft-deleted original transcript stays soft-deleted, the slot is left empty, and the original anomaly stays open with an error chip. Manual `[Resolve]` remains the escape hatch.
- **Concurrent re-probes for the same slot.** A second `[Re-probe]` click for a slot already in flight is rejected at the mutation layer (idempotency: check that the slot does not already have a pending `probe_scenario` job for it).
- **Run is FAILED or CANCELLED.** Anomalies on terminal-failure runs still appear in the list. Re-probe is *not* offered for runs in `FAILED` or `CANCELLED` state — the action button is hidden, and the API-layer mutation rejects.
- **Run completes while drawer is open.** If a user has the `DomainEvaluationStatusDrawer` open for a run and that run drops out of `RUNNING`/`SUMMARIZING` on the next polling tick, the drawer remains open (it's URL-driven via `?runId=`) but the underlying data is now read-only. The user can close it.
- **Domain has no active evaluations.** A domain with zero in-progress runs is hidden from the Active Evaluations section by default. There is no "Show all domains" toggle in v1 (per non-goals).
- **Anomaly subject points at a deleted transcript.** If a transcript referenced in `RunAnomaly.subject` has been hard-deleted (uncommon — soft-delete is the norm), the row still renders with a warning chip and the `[View transcript]` action is disabled.
- **No data for ETA computation.** If a model has zero recent completions, the ETA cell is empty (no "—" placeholder).
- **First completion bias.** Newly-started models will show inflated ETAs from the first completion (one slow probe drives the average). The ≥ 3 completions floor for rolling-throughput exists to mitigate this.
- **5-second polling under load.** If the cross-domain anomaly query becomes slow (>1s) at higher anomaly volumes than current (~2 in prod today), the polling cadence stays at 5s but the front-end debounces overlapping requests. Pagination is deferred (see Non-Goals).
- **User navigates away during re-probe.** The re-probe mutation is fire-and-forget from the UI's perspective. The job continues in the queue regardless of whether the user is still on the page.

---

## Functional Requirements

- **FR-001:** The web app MUST expose `/status` as a top-level route rendering the new `Status` page.
- **FR-002:** The web app MUST remove the `/domains/status/:domainId` route entirely. No redirect or fallback.
- **FR-003:** The new `Status` page MUST render an Open Anomalies section listing every `RunAnomaly` row with `resolvedAt IS NULL`, ordered by `firstSeenAt` descending, scoped by the active filter values.
- **FR-004:** The new `Status` page MUST render an Active Evaluations section listing every run with status `RUNNING` or `SUMMARIZING`, grouped by domain, scoped by the active filter values.
- **FR-005:** The new `Status` page MUST poll its data sources every 5 seconds while open and stop polling when the page is unmounted.
- **FR-006:** The new `Status` page MUST persist domain and type filter selections in URL query params (`?domain=`, `?type=`) and read them on page load. No `localStorage` persistence.
- **FR-007:** The system MUST add `INVALID_RESPONSE_FAILURE` to the `RunAnomalyType` enum.
- **FR-008:** The anomaly detector MUST detect `INVALID_RESPONSE_FAILURE` via TWO query paths, both scoped to the run being reconciled, both producing the same slot-keyed `subject = <runId>:<scenarioId>:<modelId>:<sampleIndex>`: **(a) Forward path:** any `probe_results` row with `status='FAILED'`, `error_code='INVALID_RESPONSE'`, `deleted_at IS NULL`, and no associated non-deleted transcript at the slot. **(b) Historical path:** any `transcripts` row with `deleted_at IS NULL`, `summarized_at IS NOT NULL`, and zero visible response text (`getTranscriptResponseText(content).length === 0`).
- **FR-009:** The detector MUST be invoked from `maybeCompleteRun()` in `summarize-persistence.ts` via `syncAnomalies()`. Auto-resolution is a free byproduct of the symmetric sync pattern: if neither failure shape is present at the slot any more, the anomaly is closed.
- **FR-010:** The audit sweep MUST include `INVALID_RESPONSE_FAILURE` in its retrospective detection scope so historical empty transcripts get flagged. The audit detector MUST skip slots that already have an open default-source anomaly of the same type (avoid duplicate default+audit rows).
- **FR-011:** The system MUST expose a new GraphQL mutation `reprobeAnomalySlot(anomalyId: ID!)` that handles both data shapes at the slot: (a) verifies the anomaly is open and re-probe-eligible; (b) verifies the slot has not exceeded `details.reprobeAttempts >= 3`; (c) verifies no `probe_scenario` job is already pending for the slot AND uses a `singletonKey` derived from the slot tuple on the new enqueue to dedupe at the queue layer; (d) inside a Prisma `$transaction`, **if a non-deleted transcript exists at the slot, soft-deletes it**; **always hard-deletes the corresponding `probe_results` row** if one exists; **increments `details.reprobeAttempts` on the anomaly row**; (e) post-commit, enqueues a new `probe_scenario` job at the slot.
- **FR-012:** The `reprobeAnomalySlot` mutation MUST reject for runs in `FAILED` or `CANCELLED` status with error code `RUN_NOT_REPROBABLE`.
- **FR-013:** The `reprobeAnomalySlot` mutation MUST reject for slots that do not have an open re-probe-eligible anomaly with error code `FORBIDDEN_NON_ANOMALOUS_SLOT`.
- **FR-014:** The system MUST expose a new GraphQL mutation `resolveRunAnomaly(id: ID!)` that sets `resolvedAt = NOW()` on the specified anomaly. The mutation MUST be idempotent (resolving an already-resolved anomaly is a no-op success).
- **FR-015:** The system MUST expose a new GraphQL query `openRunAnomalies(domainId: ID, type: RunAnomalyType): [RunAnomaly!]!` returning open anomalies optionally filtered by domain or type, with the `run`, `domain` (via `run.definition.domain`), `displayLabel`, and `displaySubject` fields populated.
- **FR-016:** The system MUST expose a new GraphQL query `activeEvaluations(domainId: ID): [DomainEvaluation!]!` returning evaluations whose runs are in `RUNNING` or `SUMMARIZING` status, optionally filtered by domain.
- **FR-017:** The `DomainEvaluationStatusPanel` component MUST render a per-model row including: status icon, model id, progress (`X/Y`), per-model ETA, throughput (transcripts/min), status flag, and cost (`spent / projected` for in-progress, `spent` for done).
- **FR-018:** The per-model row MUST sort by ETA descending (worst-ETA first) for in-progress models. Done models MUST be collapsed under a "Show N more" affordance.
- **FR-019:** The panel header MUST display the run-level ETA equal to the worst-model ETA across in-progress models.
- **FR-020:** The Re-probe button MUST display a confirmation modal before invoking the mutation. The modal MUST note that the existing transcript will be soft-deleted and a new LLM call will be made.
- **FR-021:** The Resolve button MUST invoke the mutation immediately without a confirmation modal.
- **FR-022:** The `/status` page MUST be accessible to all authenticated users. It MUST NOT require admin role.
- **FR-023:** The system MUST keep the existing `Run.stalledModels[]` data and `StalledModelsBanner` rendering on the run-detail page unchanged for this feature.

---

## Success Criteria

- **SC-001:** A researcher can identify every open anomaly across all domains in under 10 seconds by navigating to `/status` and reading the Open Anomalies section.
- **SC-002:** A researcher can re-probe a single empty-response transcript in under 30 seconds end-to-end (open `/status` → click `[Re-probe]` → confirm modal), without writing any SQL.
- **SC-003:** A slot that fails with `INVALID_RESPONSE` during a run (forward path) OR a historical empty transcript discovered by the audit sweep is flagged as `INVALID_RESPONSE_FAILURE` in the anomaly table within one polling tick (5 seconds) of `maybeCompleteRun()` finishing or the audit sweep completing for that run.
- **SC-004:** After re-probing an `INVALID_RESPONSE_FAILURE` anomaly with a successful follow-up probe, the anomaly is auto-resolved and disappears from the open list on the next polling tick.
- **SC-005:** Across the existing 4 prod domains, the cross-domain anomaly query returns within 500ms at p95 for the current cardinality.
- **SC-006:** After deploy, zero production-code paths in `cloud/apps/web/` reference `/domains/status/`.
- **SC-007:** A researcher watching an active evaluation can identify the bottleneck model (highest ETA, with status flag if applicable) at a glance without reading every row.

---

## Key Entities

- **`RunAnomaly`** — existing Prisma model. New enum value `INVALID_RESPONSE_FAILURE` is added to `RunAnomalyType`. No schema migration beyond the enum extension.
- **`RunAnomalyType` enum** — gains `INVALID_RESPONSE_FAILURE` (ordered last to avoid renumbering existing values).
- **No new database tables.** All new functionality is layered on existing schemas (`run_anomalies`, `transcripts`, `probe_results`, `runs`, `domains`, `definitions`, `domain_evaluations`).

---

## Residual Risks

- **Re-probe deletes the soft-delete fence on `probe_results`.** Today no production code path deletes `probe_results` rows; the re-probe mutation is the first. **verification:** Add a dev/preview test that runs the re-probe mutation on a fixture run, then verifies the new probe job successfully completes and a fresh transcript is created at the same slot. Run before merge.
- **`computeTranscriptResponseSha256(content)` returning null is a proxy for "empty response" but may also fire if content shape changes in the future.** A future schema change to `transcript.content` could silently disable the INVALID_RESPONSE_FAILURE detector. **verification:** Add a unit test that exercises the detector against known-empty and known-non-empty fixtures based on the current `transcript.content` shape; assert that detector output matches expectations. The test will fail loudly if the content shape changes.
- **Auto-resolve relies on `syncAnomalies()` running after a successful re-probe.** If a re-probe completes but `maybeCompleteRun()` is not invoked (e.g., the run was already in COMPLETED state and the new transcript bypasses summarization), the anomaly will not auto-resolve. **verification:** Add a test that re-probes an anomaly on a COMPLETED run and verifies that either (a) the run re-enters SUMMARIZING and the detector re-runs, or (b) the manual `[Resolve]` action remains available as the user-visible escape hatch. Document whichever behavior is in fact correct.
- **The 5-second poll could become expensive as anomaly volume grows.** Today's volume (2 open anomalies in prod) is trivial; at 1000+ open anomalies the cross-domain query will need pagination. **verification:** Add a performance budget assertion to the GraphQL query: if `openRunAnomalies` exceeds 1s p95 in synthetic load tests at 1000 open rows, the test fails and we add pagination before merge.
- **Removing `/domains/status/:domainId` may break post-launch redirects in code we haven't yet found.** Sweep is the mitigation but a missed call site will surface as a broken nav. **verification:** Run `git grep '/domains/status' cloud/` after the change is staged; confirm zero production-code matches. Run an end-to-end click-through of "launch evaluation → confirm we land on a working status page" before merge.
- **`Run.stalledModels[]` is binary today and produces false positives for Mistral/reasoning models.** The new panel surfaces the same eager flag. Users may see the `stalled` status flag on rows that are merely slow. **verification:** This is documented as a known limitation deferred to the "stall detection rework" follow-up. The status flag column treats data as best-effort and renders no flag when underlying signal is weak; users with concerns can drill into the run detail page for the existing `StalledModelsBanner` context. Accept-and-document.
