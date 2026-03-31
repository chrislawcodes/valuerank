# Tasks: Provider Budget Tracking

**Prerequisites**: plan.md, spec-acceptance.md, spec.md

## Format: `[ID] [P: file]? [Story]? Description`

- **[P: repo/relative/file.ext]**: Can run in parallel — file list is **required** (comma-separated). Bare `[P]` without a file list is treated as serial by the runner.
- **[Story]**: User story (US1–US5)
- Exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish schema, DB migration, and exported types. Everything downstream depends on the schema being live.

- [ ] T001 Update Prisma schema — add `balance Decimal? @db.Decimal(10,4)` to `LlmProvider` and add `balanceSyncLogs ProviderBalanceSyncLog[]` relation in `cloud/packages/db/prisma/schema.prisma`
- [ ] T002 Add `ProviderBalanceSyncLog` model to Prisma schema with all fields, FK to `LlmProvider` and `User`, `@@index([providerId])`, `@@map("provider_balance_sync_logs")` in `cloud/packages/db/prisma/schema.prisma`
- [ ] T003 Add reverse relation `balanceSyncLogs ProviderBalanceSyncLog[]` to `User` model in `cloud/packages/db/prisma/schema.prisma`
- [ ] T004 Run `prisma migrate dev --name add_provider_budget_tracking` to generate and apply migration (generates file in `cloud/packages/db/prisma/migrations/`)
- [ ] T005 Export `ProviderBalanceSyncLog` type from `cloud/packages/db/src/index.ts`

**Checkpoint**: Schema is live. All API and service tasks can now reference `db.providerBalanceSyncLog` and `LlmProvider.balance`.

---

## Phase 2: Foundation — API Service Layer

**Purpose**: Deduction service and GQL type/mutation infrastructure. Must be complete before US2, US3, US1 wiring.

⚠️ **CRITICAL**: Depends on Phase 1 checkpoint.

- [ ] T006 [P: cloud/apps/api/src/services/budget/deduct.ts] Create `cloud/apps/api/src/services/budget/deduct.ts` — export `deductProviderBalancesForRun(runId: string): Promise<void>` with helpers: `extractProviderName(modelId)`, `groupCostByProvider(perModel)`, `atomicDeduct(providerName, cost)` using `db.$executeRaw`
- [ ] T007 [P: cloud/apps/api/src/graphql/types/refs.ts] Add `ProviderBalanceSyncLogRef` to `cloud/apps/api/src/graphql/types/refs.ts`
- [ ] T008 [P: cloud/apps/api/src/graphql/types/llm-provider.ts] Add `balance: Float` (nullable, `Decimal.toNumber()`) and `lastSyncedAt: DateTime` (nullable, resolved from most recent sync log) fields to `LlmProvider` GQL type in `cloud/apps/api/src/graphql/types/llm-provider.ts`
- [ ] T009 Add `ProviderBalanceSyncLog` GQL object type (id, providerId, systemBalanceAtSync, enteredBalance, delta, syncedAt) to `cloud/apps/api/src/graphql/types/llm-provider.ts` (or a new `provider-balance.ts` — whichever keeps files < 400 lines)
- [ ] T010 [P: cloud/apps/api/src/graphql/mutations/llm.ts] Add `setProviderBalance(providerId: ID!, balance: Float): LlmProvider` mutation to `cloud/apps/api/src/graphql/mutations/llm.ts` — validate balance ≥ 0, set `LlmProvider.balance`, audit log action `'set_provider_balance'`
- [ ] T011 Add `syncProviderBalance(providerId: ID!, realBalance: Float!): ProviderBalanceSyncLog` mutation to `cloud/apps/api/src/graphql/mutations/llm.ts` — validate realBalance ≥ 0, read current balance, create `ProviderBalanceSyncLog` row with delta, update `LlmProvider.balance` in a single `$transaction`, audit log action `'sync_provider_balance'`

**Checkpoint**: API layer complete. Web tasks and US2 hook can now proceed.

---

## Phase 3: User Story 2 — Auto-Deduct Run Cost on Completion (Priority: P1) 🎯 MVP

**Goal**: Balance automatically decrements when a run reaches COMPLETED status.

**Independent Test**: Set provider balance to $10.00. Complete a run. Confirm balance decreases by the run's per-provider estimated cost.

### Implementation

- [ ] T012 [US2] Wire `deductProviderBalancesForRun(runId)` call inside `maybeCompleteRun()` in `cloud/apps/api/src/queue/handlers/summarize-transcript.ts` — call after `status: 'COMPLETED'` update, inside a try/catch block identical to the existing `triggerBasicAnalysis` try/catch pattern
- [ ] T013 [US2] Write unit tests for `deductProviderBalancesForRun` in `cloud/apps/api/tests/services/budget/deduct.test.ts` covering: provider with balance → deducted; null balance → skipped; null estimatedCosts → no error; two providers → each deducted; malformed modelId → warn+skip; provider name not in DB → warn+skip

**Checkpoint**: US2 complete. Set a balance, run a job to COMPLETED, confirm balance decremented.

---

## Phase 4: User Story 1 & 5 — Set and View Provider Balance / Settings Modal (Priority: P1 + P2)

**Goal**: Users can set and view provider balances via the Settings → Models page, including in the ProviderSettingsModal.

**Independent Test**: Open Settings → Models. Expand a provider. Click the settings modal button. Confirm "Budget Balance ($)" field exists. Enter $50.00 and save. Confirm balance displayed in provider header.

### Implementation

- [ ] T014 [P: cloud/apps/web/src/api/operations/llm.ts] Update `LlmProvider` TypeScript type in `cloud/apps/web/src/api/operations/llm.ts` to add `balance: number | null` and `lastSyncedAt: string | null` fields
- [ ] T015 [P: cloud/apps/web/src/api/operations/llm.ts] Update `LLM_PROVIDER_FRAGMENT` in `cloud/apps/web/src/api/operations/llm.ts` to include `balance` and `lastSyncedAt` fields
- [ ] T016 Add `SetProviderBalance` mutation and `SyncProviderBalance` mutation GQL strings + result types to `cloud/apps/web/src/api/operations/llm.ts`
- [ ] T017 [US1] [US5] Extend `ProviderSettingsModalProps` in `cloud/apps/web/src/components/settings/models/types.ts` to include `balance: number | null` in the provider prop and `balance: number | null` in `onSave` input
- [ ] T018 [US5] Add "Budget Balance ($)" `<Input>` field (type="number", min="0", step="0.01") to `ProviderSettingsModal` in `cloud/apps/web/src/components/settings/models/ProviderSettingsModal.tsx` — pre-populate with current balance, pass balance in onSave, empty string → null
- [ ] T019 [US1] Show `$X.XX remaining` or `No budget set` badge in `ProviderSection` accordion header in `cloud/apps/web/src/components/settings/models/ProviderSection.tsx`
- [ ] T020 [US1] Wire `setProviderBalance` mutation call in the ModelsPanel save handler (`cloud/apps/web/src/components/settings/models/ModelsPanel.tsx`) — call when ProviderSettingsModal onSave includes a balance change

**Checkpoint**: US1 + US5 complete. Balance field visible in modal, displayed in provider header, persists after reload.

---

## Phase 5: User Story 3 — Manual Balance Sync (Priority: P2)

**Goal**: Users can enter the real balance from their provider dashboard to correct drift, and see when the last sync occurred.

**Independent Test**: With system balance $7.50, enter $8.10 in the sync field. Confirm balance updates to $8.10 and last-synced date appears.

### Implementation

- [ ] T021 [US3] Add "Sync with real balance" section to `ProviderSettingsModal` in `cloud/apps/web/src/components/settings/models/ProviderSettingsModal.tsx` — a separate input + "Sync" button distinct from the balance set flow
- [ ] T022 [US3] Wire `syncProviderBalance` mutation in the ModelsPanel/ProviderSection save handler for the sync action in `cloud/apps/web/src/components/settings/models/ModelsPanel.tsx`
- [ ] T023 [US3] Display `Last synced: [date]` in `ProviderSection.tsx` when `provider.lastSyncedAt` is non-null in `cloud/apps/web/src/components/settings/models/ProviderSection.tsx`
- [ ] T024 [US3] Add mutation test for `syncProviderBalance` in `cloud/apps/api/tests/graphql/mutations/llm-mutations.test.ts` or a new `provider-balance.test.ts` — covers: correct delta stored, negative value rejected, no existing balance handled gracefully

**Checkpoint**: US3 complete. Sync field visible. Last-synced date displayed. Negative input rejected.

---

## Phase 6: User Story 4 — Pre-Run Soft Warning Gate (Priority: P1) 🎯 MVP

**Goal**: A non-blocking warning dialog appears before runs that exceed a provider's balance.

**Independent Test**: Set OpenAI balance to $0.01. Configure any run with OpenAI models. Click "Start Run". Confirm dialog appears listing OpenAI with cost vs balance. "Proceed Anyway" starts run. "Cancel" closes dialog without starting run.

### Implementation

- [ ] T025 [P: cloud/apps/web/src/components/runs/BudgetWarningDialog.tsx] [US4] Create `BudgetWarningDialog` component in `cloud/apps/web/src/components/runs/BudgetWarningDialog.tsx` — accepts `overdraftProviders: Array<{name: string, displayName: string, estimatedCost: number, balance: number}>`, `onProceed: () => void`, `onCancel: () => void`; renders per-provider rows with provider name, estimated cost, current balance; "Proceed Anyway" and "Cancel" buttons
- [ ] T026 [US4] Add `useQuery(LLM_PROVIDERS_QUERY)` to `cloud/apps/web/src/components/runs/useRunForm.ts` (or directly in `RunForm.tsx`) to make provider balance data available in the run form
- [ ] T027 [US4] Implement `checkBudgetOverdraft(costEstimate, providers)` helper in `RunForm.tsx` or a separate util — groups `costEstimate.perModel` by `modelId.split(':')[0]`, matches provider names, returns overdraft list
- [ ] T028 [US4] Integrate budget warning gate into `handleStartRun` flow in `cloud/apps/web/src/components/runs/RunForm.tsx` — call `checkBudgetOverdraft`, if overdrafts found: `setState({ showBudgetWarning: true, overdraftProviders })` and return; render `<BudgetWarningDialog>` when `showBudgetWarning` is true
- [ ] T029 [US4] Write web unit tests for `BudgetWarningDialog` in `cloud/apps/web/src/components/runs/BudgetWarningDialog.test.tsx` — covers: renders rows, Proceed calls onProceed, Cancel calls onCancel
- [ ] T030 [US4] Write unit tests for `checkBudgetOverdraft` helper — covers: no overdraft → empty array; single overdraft; multi-provider one overdraft; null balance → not included

**Checkpoint**: US4 complete. Warning dialog appears for underfunded providers. Proceed starts run. Cancel stays on form.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation, edge case handling, and build verification.

- [ ] T031 Verify `run npm run build --workspace @valuerank/api` passes with no TypeScript errors
- [ ] T032 Verify `npm run build --workspace @valuerank/web` passes with no TypeScript errors
- [ ] T033 Verify `npm run lint --workspace @valuerank/api` passes
- [ ] T034 Verify `npm run lint --workspace @valuerank/web` passes
- [ ] T035 Verify `npm run test --workspace @valuerank/api` passes (all existing tests + new deduct.test.ts + mutation tests)
- [ ] T036 Verify `npm run test --workspace @valuerank/web` passes (all existing tests + new BudgetWarningDialog.test.tsx)
- [ ] T037 Manual smoke test using quickstart.md — validate US1 through US4 end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start here
- **Phase 2 (Foundation)**: Depends on Phase 1 — blocks all phases below
- **Phase 3 (US2)**: Depends on Phase 2 — deduction service must exist
- **Phase 4 (US1+US5)**: Depends on Phase 2 (mutations + GQL types) — parallel with Phase 3
- **Phase 5 (US3)**: Depends on Phase 4 (modal already extended) — add sync section
- **Phase 6 (US4)**: Depends on Phase 2 (provider balance in GQL query) — can start after Phase 2
- **Phase 7 (Polish)**: Depends on Phases 3–6 all complete

### Parallel Opportunities

Tasks marked `[P: ...]` within a phase can run concurrently:
- **T006, T007, T008** (Phase 2): Independent files — deduct service, refs, GQL type
- **T014, T015** (Phase 4): Same file (`llm.ts`) — serial (type + fragment in sequence)
- **T025, T026** (Phase 6): Independent files — dialog component, hook query

### Critical Path

`T001 → T002 → T003 → T004 → T005` (schema) → `T006 + T008 + T010 + T011` (service + mutations) → `T012` (US2 hook) → run tests

### User Story Independence

- **US1 + US5** can be manually tested immediately after T020
- **US2** can be manually tested immediately after T013
- **US3** can be manually tested immediately after T024
- **US4** can be manually tested immediately after T030
