# Testing Quality Checklist

**Purpose**: Validate test coverage and quality before PR
**Feature**: [tasks.md](../tasks.md) | Constitution: [cloud/CLAUDE.md](../../../../cloud/CLAUDE.md)

## Pre-PR Requirements (per constitution: "Preflight Gate")

Run from `cloud/`:

- [ ] `npm run lint --workspace @valuerank/shared` — PASS
- [ ] `npm run lint --workspace @valuerank/db` — PASS
- [ ] `npm run lint --workspace @valuerank/api` — PASS
- [ ] `npm run test --workspace @valuerank/api` — PASS (all tests including new ones)
- [ ] `npm run build --workspace @valuerank/api` — PASS
- [ ] `npm run lint --workspace @valuerank/web` — PASS
- [ ] `npm run test --workspace @valuerank/web` — PASS
- [ ] `npm run build --workspace @valuerank/web` — PASS

## Test Coverage (per constitution: "80% minimum, 90% target")

- [ ] `deduct.ts` service has ≥ 80% line coverage (6 test cases specified in plan)
- [ ] `setProviderBalance` mutation: positive, null, negative covered
- [ ] `syncProviderBalance` mutation: correct delta, negative input, no existing balance
- [ ] `BudgetWarningDialog` component: renders, Proceed, Cancel covered
- [ ] `checkBudgetOverdraft` util: no overdraft, single, multi-provider, null balance covered

## Deduction Service Tests (`deduct.test.ts`)

- [ ] Provider with balance + run with cost → `balance` field decremented in DB
- [ ] Provider with `null` balance + run with cost → no DB update, no error
- [ ] Run with `null` `estimatedCosts` in config → function returns without error or log.error
- [ ] Run with two providers → each provider's balance decremented by its own portion only
- [ ] `modelId` without `:` separator → `log.warn` called, other providers still processed
- [ ] Provider name not found in DB → `log.warn` called, other providers still processed

## Mutation Tests

- [ ] `setProviderBalance(balance: 50.0)` → `LlmProvider.balance` = 50.0 in DB
- [ ] `setProviderBalance(balance: null)` → `LlmProvider.balance` = null in DB
- [ ] `setProviderBalance(balance: -1)` → returns `ValidationError`
- [ ] `syncProviderBalance(realBalance: 8.10)` with system balance 7.50 → sync log row with `delta = 0.60`, `LlmProvider.balance = 8.10`
- [ ] `syncProviderBalance(realBalance: -5)` → returns `ValidationError`

## Web Component Tests

- [ ] `BudgetWarningDialog` renders one row per provider in `overdraftProviders`
- [ ] Each row shows: `displayName`, formatted estimated cost, formatted balance
- [ ] Clicking "Proceed Anyway" calls `onProceed`
- [ ] Clicking "Cancel" calls `onCancel`
- [ ] Warning gate: `checkBudgetOverdraft` returns empty array → `handleStartRun` calls startRun directly
- [ ] Warning gate: `checkBudgetOverdraft` returns 1 item → `showBudgetWarning` becomes true, startRun NOT called

## Regression Tests

- [ ] Existing `llmProviders` query tests still pass (no balance field required for old tests)
- [ ] Existing `summarize-transcript` handler tests still pass (deduction wrapped in try/catch)
- [ ] Existing `ProviderSettingsModal` snapshot/render tests updated (new balance field added)
- [ ] No existing mutation tests broken by new mutations added to `llm.ts`
