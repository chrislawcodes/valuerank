# Project Memory — Order Effect Error Banner

## Architectural Decisions
- 2026-03-06: Removed rate-limit guard from `is_billing_exhaustion_response` (billing patterns win unconditionally). Guard existed to prevent ambiguity but billing patterns are specific enough to be safe.
- 2026-03-06: TypeScript `isRetryableError` NOT modified — Python's `retryable` flag is the primary path (probe-scenario.ts:622). isRetryableError is only a fallback for process-level crashes.
- 2026-03-06: Stall heuristic uses `run.updatedAt` with 15-min DISPLAY threshold (recovery.ts uses 5-min STUCK_THRESHOLD_MINUTES for restarts — intentionally different).

## Off-limits Symbols (do NOT remove/rename without updating this file)
- `assumptionsOrderInvarianceLaunchStatus`: query name used by web operations/order-invariance.ts
- `ORDER_INVARIANCE_LAUNCH_STATUS_QUERY`: web GQL operation name
- `OrderInvarianceLaunchStatusRef`: API GQL ObjectRef
- `OrderInvarianceLaunchRunRef`: API GQL ObjectRef
- `is_billing_exhaustion_response`: function in base.py — behavior changed in Wave 1
- `BILLING_EXHAUSTION_PATTERNS_BY_PROVIDER`: dict in base.py — xai_like key added in Wave 1

## Removed/Renamed Symbols (for check-symbols.sh)
- none yet

## Error Propagation Chain (verified 2026-03-06)
Python `post_json()` → raises `LLMError(code, retryable)` → Python probe worker serializes as JSON
→ `spawnPython` returns `{ success: false, error: { retryable } }` → probe-scenario.ts:622
checks `!err.retryable` → if false (non-retryable): calls `recordProbeFailure` immediately

## Resolved Impasses
- Gemini proposed "billing wins immediately" but Codex flagged regression risk. Resolution: remove rate-limit guard entirely instead — simpler and safe because billing patterns don't overlap with throttling text.

## New Symbol Added (do NOT remove without updating this file)
- `UNAMBIGUOUS_BILLING_PATTERNS`: list in base.py — subset of billing patterns that bypass rate-limit guard.
  Contains: insufficient_quota, insufficient quota, exceeded your current quota, hard limit,
  credit balance is too low, insufficient credits, insufficient credit, out of credits,
  account is out of credits, out of funds, out of money, low balance, payment required.

## Current Wave
Wave 1 — Python billing classification fix — COMPLETE (commit 570fab5)
Wave 2 — API: Add failure diagnostics to launch status response — COMPLETE (merge commit b8de2e7, feat/order-effect-error-banner)
Wave 3 — Web: Update GQL operations + TS types — COMPLETE (commit 799e991)
Wave 4 — Web: UI error banners — COMPLETE (commit 28f9683)

Integration branch: `feat/order-effect-error-banner` (local, push before PR)
Base all subsequent waves on `feat/order-effect-error-banner`, NOT on main.

## Wave 2 New Fields Added (API)
- `OrderInvarianceLaunchRun.isStalled: boolean` — true when RUNNING && updatedAt > 15 min ago
- `OrderInvarianceLaunchStatus.stalledModels: string[]` — display names of models in stalled runs
- `OrderInvarianceLaunchStatus.failureSummaries: string[]` — distinct FAILED probe errorMessage values
