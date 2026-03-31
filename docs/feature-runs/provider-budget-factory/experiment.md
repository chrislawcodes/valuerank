# Experiment: Provider Budget Tracking — Stage B Factory Run

**Feature**: Provider Budget Tracking
**Branch**: `factory/provider-budget`
**PR**: https://github.com/chrislawcodes/valuerank/pull/483
**Date**: 2026-03-31

---

## Stage Results

| Stage | Tool | Output | Result |
|-------|------|--------|--------|
| A: Spec | Claude | `spec.md` | SHA 723c1bc0 |
| A: Spec review | Gemini (adversarial) | 4 findings applied | `fix(spec)` 28035962 |
| B: Plan | Claude (feature-plan skill) | `plan.md`, `spec-acceptance.md`, `quickstart.md` | 2695c523 |
| B: Tasks | Claude (feature-tasks skill) | `tasks.md` (37 tasks, 7 phases) | 22f630d2 |
| B: Implement | Claude (feature-implement skill) | All 36 non-smoke tasks complete | 4f0f804d → f6854132 |
| B: Preflight | npm test + build + lint | All pass (see below) | PASS |
| B: PR | gh pr create | PR #483 | https://github.com/chrislawcodes/valuerank/pull/483 |

---

## Implementation Summary

### What was built

**Phase 1 — Schema** (`4f0f804d`)
- `llm_providers.balance DECIMAL(10,4)` nullable column
- New `provider_balance_sync_logs` table with FK to providers and users

**Phase 2+3 — API** (`f42f9a4e`)
- `deductProviderBalancesForRun(runId)` service — atomic SQL deduction per provider
- `ProviderBalanceSyncLogRef` GQL ref + `ProviderBalanceSyncLog` type
- `balance` + `lastSyncedAt` fields on `LlmProvider` GQL type
- `setProviderBalance` + `syncProviderBalance` mutations
- Auto-deduction wired into `maybeCompleteRun()` in `summarize-transcript.ts`
- 16 unit tests for deduct service

**Phase 4–6 — Web UI** (`021f8e94`)
- `balance` + `lastSyncedAt` on web `LlmProvider` type + fragment
- `SetProviderBalance` + `SyncProviderBalance` GQL mutations on client
- Budget balance input in `ProviderSettingsModal`
- Sync section with separate input + button (shown when balance is set)
- Balance badge (`$X.XX remaining` / `No budget set`) in `ProviderSection` header
- `Last synced: [date]` display
- `BudgetWarningDialog` component — table of overdraft providers, Proceed/Cancel
- `checkBudgetOverdraft()` helper in `RunForm.tsx`
- Budget gate wired into `RunForm` submit flow

**Phase 7 — Polish** (`f6854132`, `6195b579`)
- Fixed `RerunDialog.test.tsx` and `RunForm.test.tsx`: added urql mock for `RunForm.useQuery`
- Fixed `provider-balance.test.ts`: `ID!` → `String!` for `providerId` variable
- Fixed pre-existing lint errors in `run.ts` (unused vars renamed with `_` prefix)

---

## Preflight Results

| Check | Result |
|-------|--------|
| `npm run build --workspace @valuerank/api` | PASS — clean tsc |
| `npm run build --workspace @valuerank/web` | PASS — clean tsc + vite |
| `npm run lint --workspace @valuerank/api` | PASS — 0 errors (140 warnings, pre-existing) |
| `npm run lint --workspace @valuerank/web` | PASS — 0 errors (17 warnings, pre-existing) |
| `npm run test --workspace @valuerank/api` | PASS — 169 files, 2011 tests |
| `npm run test --workspace @valuerank/web` | PASS — 134 files, 1473 tests |

---

## Key Technical Decisions

- **Atomic deduction via raw SQL**: `UPDATE llm_providers SET balance = balance - $cost WHERE name = $provider AND balance IS NOT NULL` — avoids read-modify-write race conditions
- **Client-side budget gate**: Groups `costEstimate.perModel` by provider prefix (`modelId.split(':')[0]`), checks against provider balances fetched with `cache-only` policy — no extra round-trip
- **Soft warning (non-blocking)**: Dialog allows proceeding anyway — balance is advisory, not a hard gate
- **Null balance = opt-out**: Providers without a balance set are never checked or deducted

---

## Tasks Completed

All 36 automated tasks complete (T001–T036). T037 (manual smoke test) requires local dev environment.
