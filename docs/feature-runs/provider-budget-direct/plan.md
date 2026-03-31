# Provider Budget Tracking — Technical Plan

## Architecture Decision

**Store budget state on `LlmProvider`, not in a separate balance table.**
Rationale: the balance is a single scalar per provider. A separate table would add a join on every provider query. Prisma `Decimal` handles precision. We add an event log table for history/audit separately.

**Hook into `maybeCompleteRun` in `summarize-transcript.ts`.**
This is the single canonical COMPLETED transition point for normal runs. The other paths (recovery, cancel-summarization) also set COMPLETED but are edge cases — they don't need deduction. Deduction is best-effort: errors are logged but never propagate.

**No new service file needed for the budget logic.** A small helper `deductProviderBudget(runId)` lives in `cloud/apps/api/src/services/run/budget.ts` (new file) and is called from `maybeCompleteRun`. This keeps orchestrator concerns in the run domain.

---

## Files to Change

### Database (Prisma)

1. **`cloud/packages/db/prisma/schema.prisma`**
   - Add `balance Decimal(12,2)?`, `lastSyncedAt DateTime?`, `lastSyncedBalance Decimal(12,2)?` to `LlmProvider`
   - Add `ProviderBudgetEvent` model
   - Add `ProviderBudgetEventType` enum

2. **New migration:** `cloud/packages/db/prisma/migrations/20260331000000_add_provider_budget/migration.sql`

### DB Package

3. **`cloud/packages/db/src/queries/llm.ts`**
   - Extend `updateProvider` to accept `balance?: Decimal | null`
   - Add `syncProviderBalance(id, enteredBalance)` — computes drift, creates event, updates balance
   - Add `deductProviderBudget(providerId, amount, runId)` — creates DEDUCTION event, decrements balance

4. **`cloud/packages/db/src/index.ts`** — export new functions

### API — GraphQL

5. **`cloud/apps/api/src/graphql/types/llm-provider.ts`**
   - Add `balance`, `lastSyncedAt`, `lastSyncedBalance` fields to `LlmProviderRef`

6. **`cloud/apps/api/src/graphql/types/inputs/llm.ts`**
   - Add `balance: Float` to `UpdateLlmProviderInput`

7. **`cloud/apps/api/src/graphql/mutations/llm.ts`**
   - Wire `balance` through `updateLlmProvider` mutation
   - Add `syncProviderBalance` mutation

### API — Run completion hook

8. **`cloud/apps/api/src/services/run/budget.ts`** (new)
   - `deductProviderBudget(runId): Promise<void>` — sums transcript costs by provider, calls DB helper
   - Groups transcripts by provider via model identifier prefix (`provider:modelId` format)

9. **`cloud/apps/api/src/queue/handlers/summarize-transcript.ts`**
   - Call `deductProviderBudget(runId)` (non-blocking) inside `maybeCompleteRun` after COMPLETED

### Web

10. **`cloud/apps/web/src/api/operations/llm.ts`**
    - Add `balance`, `lastSyncedAt`, `lastSyncedBalance` to `LlmProvider` type
    - Add fields to `LLM_PROVIDER_FRAGMENT`
    - Add `SYNC_PROVIDER_BALANCE_MUTATION`

11. **`cloud/apps/web/src/components/settings/models/types.ts`**
    - Extend `ProviderSettingsModalProps.onSave` to accept optional `syncBalance?: number`

12. **`cloud/apps/web/src/components/settings/models/ProviderSection.tsx`**
    - Show balance in the provider header (non-expanded state)

13. **`cloud/apps/web/src/components/settings/models/ProviderSettingsModal.tsx`**
    - Add "Balance ($)" input field (updates via updateLlmProvider `balance`)
    - Add "Sync Balance" section (calls `syncProviderBalance` mutation)
    - Show "Last synced: [date]" if `lastSyncedAt` is set

14. **`cloud/apps/web/src/components/settings/models/ModelsPanel.tsx`**
    - Add `syncProviderBalance` mutation handler + wire to modal

15. **`cloud/apps/web/src/components/runs/RunForm.tsx`** (or equivalent)
    - After cost estimation, check each provider's balance vs estimated cost
    - Show warning banner if any provider is underfunded
    - Need to read providers (balance) alongside cost estimate — may need to enrich the existing query

---

## DB Schema Changes

```prisma
// On LlmProvider — add these fields:
balance             Decimal?  @map("balance") @db.Decimal(12, 2)
lastSyncedAt        DateTime? @map("last_synced_at")
lastSyncedBalance   Decimal?  @map("last_synced_balance") @db.Decimal(12, 2)

// New enum:
enum ProviderBudgetEventType {
  MANUAL_SET
  DEDUCTION
  SYNC
}

// New table:
model ProviderBudgetEvent {
  id                    String                   @id @default(cuid())
  providerId            String                   @map("provider_id")
  type                  ProviderBudgetEventType  @map("type")
  amount                Decimal                  @map("amount") @db.Decimal(12, 2)
  drift                 Decimal?                 @map("drift") @db.Decimal(12, 2)
  runId                 String?                  @map("run_id")
  providerBalanceBefore Decimal?                 @map("provider_balance_before") @db.Decimal(12, 2)
  providerBalanceAfter  Decimal?                 @map("provider_balance_after") @db.Decimal(12, 2)
  createdAt             DateTime                 @default(now()) @map("created_at")

  provider LlmProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)
  run      Run?        @relation(fields: [runId], references: [id], onDelete: SetNull)

  @@index([providerId])
  @@index([runId])
  @@map("provider_budget_events")
}
```

---

## Provider Identification from Model ID

Model IDs in runs are stored as `provider:modelId` strings (e.g., `openai:gpt-4o-mini`). The prefix before `:` is the `LlmProvider.name`. We use this to join transcripts → provider without a DB lookup per transcript:

```typescript
// Group transcript costs by provider name
const costsByProvider: Record<string, number> = {};
for (const t of transcripts) {
  const providerName = t.modelId.split(':')[0]; // e.g., "openai"
  costsByProvider[providerName] = (costsByProvider[providerName] ?? 0) + (t.estimatedCost ?? 0);
}
```

Then for each provider name, look up provider by name and call `deductProviderBudget`.

---

## Pre-Run Warning Logic

In the RunForm, after cost estimation completes:
1. Fetch provider balances (already available in `LLM_PROVIDERS_QUERY` response once we add the field)
2. Group estimated costs by provider (same prefix logic)
3. For each provider where `balance !== null && balance < estimatedCost`: show warning

The RunForm already calls cost estimate. We need to pass provider data alongside. The `llmProviders` query is already loaded in `ModelsPanel` — but `RunForm` is on a different page. We'll add a lightweight provider balance check inside the existing run start flow by reading from a separate `LLM_PROVIDERS_QUERY` call in `RunForm`.

---

## Decimal vs Float note

Prisma `Decimal` is used for precision in DB. The GraphQL schema uses `Float` (standard for money in this codebase — see `costInputPerMillion`). The conversion is handled at the Pothos resolver layer: `t.exposeFloat('balance')` with a `nullable: true`.

---

## What is NOT changing

- No changes to `Run`, `Transcript`, or `Definition` models
- No changes to `probe-scenario.ts` handler
- No changes to the analysis or summary pipeline
- No changes to `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `.gitignore`
