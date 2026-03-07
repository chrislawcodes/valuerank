# Order Effect Error Banner — Wave Plan

Generated: 2026-03-06
Feature: Surface provider/run execution failures to the Order Effect UI

## Problem Summary

The red error banner does NOT appear on the Order Effect page when xAI provider runs fail.
Root cause is a compound bug across three layers:

1. **Python worker (`base.py`)**: `is_billing_exhaustion_response` has a rate-limit guard —
   if the xAI 429 body contains any rate-limit text (e.g. "too many requests"), the function
   returns `False` before checking billing patterns. The response is then treated as a
   retryable rate-limit, so MAX_RATE_LIMIT_RETRIES backoffs fire, and the error returned
   to the PgBoss handler has `retryable=True`.

2. **API launch status query**: `assumptionsOrderInvarianceLaunchStatus` returns trial counts
   from `run.progress`, but no failure summaries or stall indicators. When runs are churning
   in retries (failedTrials=0), the UI has nothing to show.

3. **UI (OrderEffectPanel.tsx)**: Only shows `ErrorMessage` for GraphQL transport errors.
   No banner for `failedTrials > 0` or stalled runs even when that data is available.

## Waves

---

### Wave 1 — Python: Fix billing-exhaustion classification in base.py

**Files**:
- `/Users/chrislaw/valuerank/cloud/workers/common/llm_adapters/base.py`

**Changes**:
- Remove the rate-limit guard from `is_billing_exhaustion_response`. Currently the function
  returns `False` when `RATE_LIMIT_PATTERNS` appear in the response text, even if billing
  patterns also appear. Change: billing patterns checked first and unconditionally — if any
  billing pattern matches, return `True`. Do NOT retain the rate-limit guard.
- Add xAI-specific billing patterns to `BILLING_EXHAUSTION_PATTERNS_BY_PROVIDER`:
  new key `"xai_like"` with patterns: `["insufficient credits", "credit balance",
  "insufficient funds", "account balance is too low"]`
- The overall `BILLING_EXHAUSTION_PATTERNS` list is generated from the `_BY_PROVIDER` dict —
  no other changes needed for it to pick up the new patterns.

**Rationale for removing the guard**: The billing-specific patterns
(`"insufficient_quota"`, `"credit balance is too low"`, `"out of funds"`, etc.) are
semantically distinct from rate-limit text and will not produce false positives on
normal throttling responses. Billing patterns should always win.

**What NOT to touch**:
- `is_rate_limit_response` — leave unchanged
- `post_json` control flow — the order of billing check then rate-limit check is already correct
- `constants.py` (retry limits, backoffs)
- Any other adapter files (`xai.py`, `openai.py`, etc.)
- `probe-scenario.ts` — the TypeScript `isRetryableError` fallback is NOT the critical path;
  Python's `retryable` flag (set correctly after this fix) takes precedence at line 622

**Removed/renamed symbols**: none

**Risk**: LOW — the patterns are specific; removing the rate-limit guard has no impact when
billing patterns do not match (normal throttling). The guard existed to prevent ambiguity
but the billing patterns are non-overlapping.

**DATA_CRITICAL_WAVE**: NO

**Verification**: Run Python tests from `/Users/chrislaw/valuerank/cloud/workers/`:
`python -m pytest tests/test_rate_limit.py tests/test_errors.py -v`

---

### Wave 2 — API: Add failure diagnostics to launch status response

**Files**:
- `/Users/chrislaw/valuerank/cloud/apps/api/src/graphql/queries/order-invariance.ts`

**Changes**:

1. Extend the `OrderInvarianceLaunchRun` TypeScript interface (around line 118) to add:
   - `isStalled: boolean` — run is RUNNING and `updatedAt < now - 15 minutes`

2. Extend the `OrderInvarianceLaunchStatus` TypeScript interface (around line 129) to add:
   - `stalledModels: string[]` — display names of models with stalled runs
   - `failureSummaries: string[]` — distinct `errorMessage` values from failed ProbeResult rows

3. Extend `OrderInvarianceLaunchRunRef` ObjectRef field registration (around line 615) to
   expose `isStalled` as a boolean field.

4. Extend `OrderInvarianceLaunchStatusRef` ObjectRef field registration (around line 630) to
   expose `stalledModels` and `failureSummaries` as string-list fields.

5. In the `assumptionsOrderInvarianceLaunchStatus` resolver (line 800 onwards):
   - When building `filteredRuns`, also select `updatedAt` from `run` rows
   - Compute `isStalled` per run: `run.status === 'RUNNING' && run.updatedAt < new Date(Date.now() - 15 * 60 * 1000)`
   - After building `filteredRuns`, query `db.probeResult.findMany` for `runId in runIds` where `status === 'FAILED'`, selecting `modelId` and `errorMessage` only
   - Deduplicate `errorMessage` values for `failureSummaries`
   - Collect `modelId` values from stalled runs, look up display names from `activeModelLabels` map for `stalledModels`

**What NOT to touch**:
- `assumptionsOrderInvariance` query (line 886 onwards) — different query, leave alone
- Prisma schema — no schema changes; query existing probeResult and run tables only
- Other queries in this file
- `OrderInvarianceLaunchRunRef` fields that already exist

**Removed/renamed symbols**: none

**Risk**: MEDIUM — adds a new DB query (probeResult lookup) inside the resolver. Keep it
efficient: only select `modelId` and `errorMessage`, filter by `status === 'FAILED'`, no
joins. The `run` select must be expanded to include `updatedAt` (currently not selected).

**DATA_CRITICAL_WAVE**: NO

**Verification**: `npm run build --workspace @valuerank/api` from cloud/. Fix all type errors.
No `@ts-ignore`. The new fields must appear in schema introspection.

---

### Wave 3 — Web: Update GQL operation and TypeScript types

**Files**:
- `/Users/chrislaw/valuerank/cloud/apps/web/src/api/operations/order-invariance.ts`

**Changes**:

1. Update `ORDER_INVARIANCE_LAUNCH_STATUS_QUERY` (around line 316) to add to the top-level
   selection: `stalledModels` and `failureSummaries`.

2. Update the TypeScript type for the top-level launch status result (around line 128) to
   add:
   - `stalledModels: string[]`
   - `failureSummaries: string[]`

3. Update the TypeScript type for per-run results (around line 117) to add:
   - `isStalled: boolean`

**What NOT to touch**:
- Other queries in this file
- Fragments used by other pages

**Removed/renamed symbols**: none

**Risk**: LOW — purely additive. Build will fail if field names don't match Wave 2.

**DATA_CRITICAL_WAVE**: NO

**Verification**: `npm run build --workspace @valuerank/web` from cloud/. Fix all type errors.

---

### Wave 4 — UI: Add error/warning banners to OrderEffectPanel

**Files**:
- `/Users/chrislaw/valuerank/cloud/apps/web/src/components/assumptions/OrderEffectPanel.tsx`

**Changes**:

Add two conditional banners inside the "Launch Status" card, after the progress bar section
(currently around line 608, before the `{launchStatusError && ...}` block):

1. **Failed-trials banner** (red, shown when `launchStatus.failedTrials > 0`):
   - Uses existing `ErrorMessage` component
   - Message: `"{N} trial(s) failed. Check error details below."`
   - Below the message, render `launchStatus.failureSummaries` as a bulleted list if
     `failureSummaries.length > 0`

2. **Stalled-run banner** (amber/warning, shown when `launchStatus.stalledModels.length > 0`):
   - Inline JSX with amber background (match existing styles, e.g. `bg-amber-50 border-amber-200`)
   - Message: `"One or more models appear stalled: {model1, model2, ...}. Provider may be
     rate-limited or out of credits. Runs will retry automatically."`

Both banners are shown in addition to the existing `{launchStatusError && ...}` block — they
are not replacements.

**What NOT to touch**:
- `{launchStatusError && ...}` block (line 610) — keep as-is
- Preflight review section
- Progress bar and trial counts
- Transcript viewer

**Removed/renamed symbols**: none

**Risk**: LOW — visual/JSX only. No data-fetching changes.

**DATA_CRITICAL_WAVE**: NO

**Verification**: `npm run build --workspace @valuerank/web` from cloud/. Confirm banners
render when `failedTrials > 0` or `stalledModels` is non-empty.

---

## Human Gates

- After Wave 1 ships: validate in Railway logs that xAI billing-exhaustion errors now emit
  `AUTH_ERROR` with `retryable=false`. Requires a run where xAI is genuinely credit-exhausted.
- After Wave 4 ships: manually verify the banner appears correctly in the UI.

## Cross-wave Dependencies

- Wave 2 depends on Wave 1 having shipped first to produce FAILED probeResult rows. Without
  Wave 1, `failureSummaries` will be empty, but `stalledModels` still works.
- Wave 3 MUST come after Wave 2 (fields don't exist on the API until Wave 2 is deployed).
- Wave 4 MUST come after Wave 3 (TypeScript types from Wave 3 are required to compile).
- Waves 1 and 2 are technically independent at the code level but sequenced by product value.

## Post-Deploy Verification Checklist

- [ ] Deployed commit confirmed on prod (Railway deploy log)
- [ ] xAI probe run triggered — confirm Railway API logs show `AUTH_ERROR` (not `RATE_LIMIT`)
      for billing-exhausted 429 responses after Wave 1
- [ ] Confirm `failedTrials` increments promptly (within 1 job timeout) after Wave 1
- [ ] API: introspect `assumptionsOrderInvarianceLaunchStatus` — confirm `stalledModels`,
      `failureSummaries`, `isStalled` fields exist after Wave 2
- [ ] UI: Order Effect page shows red/amber banner when a run has failed or stalled
- [ ] No error spikes in prod logs for 10 minutes post-deploy

## Adversarial Findings Addressed

| Finding | Resolution |
|---------|-----------|
| Python over-eager billing classification | Removed rate-limit guard; billing patterns take unconditional priority |
| Wave ordering was product-value not code dependency | Explicitly noted; sequencing retained for correct data flow |
| failedTrials=0 makes failureSummaries empty | stalledModels heuristic (updatedAt) works even with 0 failed rows |
| TypeScript isRetryableError gap | Not the critical path — Python `retryable` flag takes precedence at line 622; no change needed |
| Backing TS types missing from Gemini plan | Explicitly scoped into Wave 2 (API types) and Wave 3 (web types) |
| Wave 2 size risk | Estimated ~80 lines; probeResult query minimal (modelId + errorMessage, status=FAILED only) |
| run.updatedAt false positives | Threshold set to 15 minutes, same as recovery.ts STUCK_THRESHOLD_MINUTES |
