# Provider Budget Tracking — Tasks

## Phase 1 — Database Schema + Migration

- [ ] Add `balance`, `lastSyncedAt`, `lastSyncedBalance` fields to `LlmProvider` in `schema.prisma`
- [ ] Add `ProviderBudgetEventType` enum in `schema.prisma`
- [ ] Add `ProviderBudgetEvent` model in `schema.prisma`
- [ ] Add reverse relations `budgetEvents ProviderBudgetEvent[]` to `LlmProvider` and `Run` models
- [ ] Create migration file `cloud/packages/db/prisma/migrations/20260331000000_add_provider_budget/migration.sql`
- [ ] Run `npx prisma generate` in `cloud/packages/db/` to regenerate client

**Commit:** `feat(db): add provider budget schema`

---

## Phase 2 — DB Query Helpers

- [ ] Extend `updateProvider` in `cloud/packages/db/src/queries/llm.ts` to accept `balance?: number | null`
- [ ] Add `syncProviderBalance(id: string, enteredBalance: number): Promise<LlmProvider>` to `queries/llm.ts`
  - Reads current `balance` as `balanceBefore`
  - Computes `drift = enteredBalance - (balanceBefore ?? 0)` (null prior = 0 drift)
  - Creates `ProviderBudgetEvent` with `type=SYNC`
  - Updates provider `balance`, `lastSyncedAt`, `lastSyncedBalance`
  - Returns updated provider
- [ ] Add `deductFromProviderBalance(providerId: string, amount: number, runId: string): Promise<void>` to `queries/llm.ts`
  - Reads current `balance`
  - If balance is null, return early (no-op)
  - Creates `ProviderBudgetEvent` with `type=DEDUCTION`, `amount=-amount`
  - Decrements `balance` by `amount`
- [ ] Export new functions from `cloud/packages/db/src/queries/index.ts`
- [ ] Export from `cloud/packages/db/src/index.ts`

**Commit:** `feat(db): add provider budget query helpers`

---

## Phase 3 — API: GraphQL Types + Mutations

- [ ] Add `balance`, `lastSyncedAt`, `lastSyncedBalance` fields to `LlmProviderRef` in `cloud/apps/api/src/graphql/types/llm-provider.ts`
- [ ] Add `balance: Float` (optional) to `UpdateLlmProviderInput` in `cloud/apps/api/src/graphql/types/inputs/llm.ts`
- [ ] Wire `balance` through `updateLlmProvider` mutation resolver in `cloud/apps/api/src/graphql/mutations/llm.ts`
- [ ] Add `syncProviderBalance` mutation to `cloud/apps/api/src/graphql/mutations/llm.ts`
  - Args: `id: String!`, `balance: Float!`
  - Calls `syncProviderBalance` DB helper
  - Returns `LlmProvider`
  - Adds audit log entry

**Commit:** `feat(api): add provider balance GraphQL fields + mutations`

---

## Phase 4 — Run Completion Hook

- [ ] Create `cloud/apps/api/src/services/run/budget.ts`
  - Export `deductProviderBudget(runId: string): Promise<void>`
  - Queries transcripts for the run (non-deleted, with `estimatedCost` and `modelId`)
  - Groups costs by provider name using `modelId.split(':')[0]`
  - Skips models with no `:` in modelId (unknown format)
  - For each provider name with cost > 0: looks up provider by name, calls `deductFromProviderBalance`
  - All errors caught and logged — never throws
- [ ] Call `deductProviderBudget(runId)` (non-blocking `void`) inside `maybeCompleteRun` in `cloud/apps/api/src/queue/handlers/summarize-transcript.ts`
  - Add import at top of file
  - Place call after the COMPLETED db.run.update, before the analysis trigger

**Commit:** `feat(api): auto-deduct provider budget on run completion`

---

## Phase 5 — Web: Provider Balance Display + Settings

- [ ] Add `balance`, `lastSyncedAt`, `lastSyncedBalance` to `LlmProvider` TypeScript type in `cloud/apps/web/src/api/operations/llm.ts`
- [ ] Add fields to `LLM_PROVIDER_FRAGMENT`
- [ ] Add `SYNC_PROVIDER_BALANCE_MUTATION` GraphQL operation
- [ ] Add lightweight `LLM_PROVIDER_BALANCES_QUERY` (only `id`, `name`, `balance` fields — no models list)
- [ ] Update `ProviderSection.tsx` to show balance in provider header row (non-expanded):
  - Show "Balance: $X.XX" if `balance !== null`
  - Show "Balance: —" with muted style if null
- [ ] Update `ProviderSettingsModal.tsx`:
  - Add "Set / Sync Balance ($)" number input (min=0, step=0.01)
  - Show "Last synced: [formatted date]" if `lastSyncedAt` is set
  - On save: if balance input is filled, call `syncProviderBalance` mutation; pass result back
- [ ] Update `types.ts` — extend `ProviderSettingsModalProps.onSave` to accept `syncBalance?: number`
- [ ] Update `ModelsPanel.tsx`:
  - Add `syncProviderBalance` useMutation
  - Handle sync in `handleUpdateProvider`: if `syncBalance` is provided, call `syncProviderBalance` mutation; otherwise call `updateProvider`

**Commit:** `feat(web): show provider balance + sync UI in settings`

---

## Phase 6 — Web: Pre-Run Warning

- [ ] In the RunForm component (`cloud/apps/web/src/components/runs/RunForm.tsx` or `useRunForm.ts`):
  - Add `useQuery` for `LLM_PROVIDER_BALANCES_QUERY`
  - After cost estimate is computed, compute per-provider estimated cost:
    - For each `perModel` entry in `costEstimate`, extract provider name from `modelId.split(':')[0]`
    - Sum costs per provider name
  - Build list of warnings: providers where `balance !== null && balance < providerCost`
  - Render warning banner above Submit button: "Low balance: [ProviderName] has $Y.YY remaining, estimated cost $X.XX"
  - Warning is informational only — does not block run start

**Commit:** `feat(web): pre-run soft warning for insufficient provider balance`

---

## Phase 7 — Preflight + Tests

- [ ] Run `npm run lint --workspace @valuerank/shared`
- [ ] Run `npm run lint --workspace @valuerank/db`
- [ ] Run `npm run lint --workspace @valuerank/api`
- [ ] Run `npm run build --workspace @valuerank/api` — fix all errors
- [ ] Run `npm run lint --workspace @valuerank/web`
- [ ] Run `npm run test --workspace @valuerank/web`
- [ ] Run `npm run build --workspace @valuerank/web` — fix all errors

**Commit:** `chore: fix lint/build errors after preflight`

---

## DO NOT TOUCH
- `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `MEMORY.md`, `.gitignore`
- Any file not listed above
