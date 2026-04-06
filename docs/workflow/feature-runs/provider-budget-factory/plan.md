# Implementation Plan: Provider Budget Tracking

**Branch**: `factory/provider-budget` | **Date**: 2026-03-31 | **Spec**: [spec.md](spec.md)

## Summary

Add per-provider dollar balance tracking to the LLM settings page. The system stores a nullable balance on `LlmProvider`, auto-deducts completed run costs (atomically, via `summarize-transcript.ts::maybeCompleteRun`), records manual sync events in a new `ProviderBalanceSyncLog` table, and shows a soft client-side warning before runs that exceed the available balance.

---

## Technical Context

**Language/Version**: TypeScript 5.3+ (strict mode, no `any`)
**Primary Dependencies**: Prisma ORM, Pothos GraphQL builder, urql (web), React 18
**Storage**: PostgreSQL — two schema changes: `balance Decimal?` on `llm_providers`, new `provider_balance_sync_logs` table
**Testing**: vitest (API unit tests), vitest (web component tests)
**Target Platform**: Docker / Railway
**Performance Goals**: SC-004 — warning dialog < 200ms (no extra API round-trip, pure client-side)
**Constraints**: Constitution — no `any`, files ≤ 400 lines, structured logging, service layer owns DB access
**Scale/Scope**: 5 user stories, 2 new mutations, 2 schema changes, 1 service function, 3 UI components modified

---

## Constitution Check

**Status**: PASS

| Requirement | Status | Notes |
|------------|--------|-------|
| No `any` types | PASS | All new types explicit; `Decimal` used for monetary fields |
| File size ≤ 400 lines | PASS | Deduction service ~80 lines; modal changes ~50 lines |
| 80% test coverage | PASS | Deduction service + warning gate logic fully unit-testable |
| Structured logging | PASS | `createLogger` pattern, no `console.log` |
| Service layer owns DB access | PASS | `deductProviderBalancesForRun()` in services/, not in resolver |
| Audited mutations | PASS | Both mutations pass `createdByUserId: ctx.user?.id` |
| Prisma Migrate (not db push) | PASS | Migration file generated via `prisma migrate dev` |

---

## Architecture Decisions

### Decision 1: Where to Trigger Deduction

**Chosen**: Hook into `maybeCompleteRun()` in `cloud/apps/api/src/queue/handlers/summarize-transcript.ts`

**Rationale**: This is the *actual* place `status: 'COMPLETED'` is written. The spec initially referenced `progress.ts` but code inspection shows the COMPLETED transition happens in `summarize-transcript.ts` (when all transcripts are summarized). There is already a `try/catch` pattern here for post-completion triggers (analysis, token stats). The deduction follows the same isolation pattern.

**Alternatives Considered**:
- `progress.ts` — Wrong: COMPLETED is not written there (only SUMMARIZING is set from probe completion)
- Queue handler event bus — Overkill for a single hook; no event system exists in the codebase

**Tradeoffs**:
- Pros: Fits established pattern; failure is isolated; no circular deps
- Cons: Deduction is coupled to summarization completion (not probe completion); acceptable since COMPLETED only occurs post-summarization

### Decision 2: Provider Identification at Deduction Time

**Chosen**: Extract provider prefix from `modelId` string (`modelId.split(':')[0]`) and match `LlmProvider.name`

**Rationale**: `run.config.estimatedCosts.perModel` (stored as JSON) contains `modelId` in `"provider:model"` format (e.g., `"openai:gpt-4o"`). There is already a `getProviderNameFromModelId()` function in `summarize-transcript.ts` using this exact pattern. Reusing it avoids a redundant `LlmModel` join.

**Alternatives Considered**:
- Re-fetch `LlmModel` → `LlmProvider` at deduction time — Extra DB query per model; fragile if model is deprecated
- Snapshot `providerId` in run config at start — Schema change to run config; higher migration risk

**Tradeoffs**:
- Pros: Zero extra DB queries for provider lookup; reuses existing utility
- Cons: Breaks if `modelId` format ever changes (mitigated by existing codebase already relying on this format)

### Decision 3: Balance Storage Location

**Chosen**: Nullable `Decimal?` column directly on `LlmProvider` (not a separate table)

**Rationale**: One balance per provider. The `Decimal` type (not `Float`) avoids floating-point rounding for monetary values. Prisma `@db.Decimal(10, 4)` gives 4-decimal precision, consistent with existing `costInputPerMillion` / `costOutputPerMillion` columns.

**Tradeoffs**:
- Pros: Simplest schema; no join required to read balance
- Cons: No balance history on the provider itself (drift history is in sync log)

### Decision 4: Warning Gate — Client-Side Only

**Chosen**: Compute per-provider cost breakdown client-side in `RunForm.tsx` before calling `startRun`

**Rationale**: The `costEstimate.perModel` data is already loaded in the run form (via `useCostEstimate` hook). Providers are loaded via `LLM_PROVIDERS_QUERY` (which will be extended to include `balance`). Grouping by `modelId.split(':')[0]` and comparing against provider balance is pure computation — no extra round-trip needed. SC-004 is satisfied.

**Alternatives Considered**:
- API-side warning check before run creation — Extra round-trip; contradicts SC-004
- Server-side validation that rejects start — Would make gate hard (contradicts spec: "soft only")

---

## Project Structure

### Files to Create

```
cloud/apps/api/src/
├── services/budget/
│   └── deduct.ts                    # deductProviderBalancesForRun() + helpers (~80 lines)
│
cloud/apps/api/tests/
├── services/budget/
│   └── deduct.test.ts               # Unit tests for deduction logic

cloud/apps/web/src/
├── components/runs/
│   └── BudgetWarningDialog.tsx      # New soft-warning dialog component
```

### Files to Modify

```
cloud/packages/db/prisma/
└── schema.prisma                    # Add balance to LlmProvider; add ProviderBalanceSyncLog model

cloud/packages/db/prisma/migrations/
└── [timestamp]_add_provider_budget/ # Generated migration

cloud/packages/db/src/
└── index.ts                         # Export new ProviderBalanceSyncLog type

cloud/apps/api/src/
├── graphql/
│   ├── types/llm-provider.ts        # Add balance + lastSyncedAt fields
│   ├── types/refs.ts                # Add ProviderBalanceSyncLogRef (if separate type)
│   └── mutations/llm.ts             # Add setProviderBalance + syncProviderBalance mutations
├── queue/handlers/
│   └── summarize-transcript.ts      # Call deductProviderBalancesForRun() in maybeCompleteRun()

cloud/apps/web/src/
├── api/operations/
│   └── llm.ts                       # Add balance+lastSyncedAt to LlmProvider type + fragment
│                                    # Add SetProviderBalance + SyncProviderBalance mutations
├── components/settings/models/
│   ├── ProviderSettingsModal.tsx    # Add "Budget Balance ($)" input field
│   ├── ProviderSection.tsx          # Show balance in provider header/expanded section
│   └── types.ts                     # Extend ProviderSettingsModalProps with balance
├── components/runs/
│   └── RunForm.tsx                  # Add budget warning gate before startRun call
```

---

## Data Model

### Schema Changes

#### 1. Add `balance` to `LlmProvider`

```prisma
model LlmProvider {
  // ... existing fields ...
  balance   Decimal?  @db.Decimal(10, 4)  // USD balance, null = not tracking

  balanceSyncLogs ProviderBalanceSyncLog[]
}
```

#### 2. New `ProviderBalanceSyncLog` model

```prisma
model ProviderBalanceSyncLog {
  id                   String   @id @default(cuid())
  providerId           String   @map("provider_id")
  systemBalanceAtSync  Decimal  @map("system_balance_at_sync") @db.Decimal(10, 4)
  enteredBalance       Decimal  @map("entered_balance") @db.Decimal(10, 4)
  delta                Decimal  @db.Decimal(10, 4)
  syncedAt             DateTime @default(now()) @map("synced_at")
  createdByUserId      String?  @map("created_by_user_id")

  provider     LlmProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)
  createdBy    User?       @relation(fields: [createdByUserId], references: [id])

  @@index([providerId])
  @@map("provider_balance_sync_logs")
}
```

### Migration Notes

- Adding nullable `balance Decimal?` to `llm_providers` is a zero-downtime migration (no default needed, existing rows get NULL)
- `provider_balance_sync_logs` is a new table — no data backfill needed
- No existing FK or index changes

---

## Service Layer: `services/budget/deduct.ts`

```typescript
// Key exports:
export async function deductProviderBalancesForRun(runId: string): Promise<void>

// Internal helpers:
function extractProviderName(modelId: string): string   // split(':')[0]
function groupCostByProvider(perModel: ModelCostEstimate[]): Map<string, number>
async function atomicDeduct(providerName: string, cost: number): Promise<void>
  // Uses: db.$executeRaw`UPDATE llm_providers SET balance = balance - ${cost} WHERE name = ${name} AND balance IS NOT NULL`
```

**Key behavior**:
1. Fetch `run.config` → cast to `RunConfig` → extract `estimatedCosts.perModel`
2. If `estimatedCosts` is null/empty → log warn and return
3. Group `perModel` by provider prefix → `Map<providerName, totalCost>`
4. For each provider: look up `LlmProvider` by `name` (single query for all providers at once)
5. For each provider with non-null `balance`: execute atomic `UPDATE ... SET balance = balance - $cost WHERE name = $name AND balance IS NOT NULL`
6. Wrap each deduction in try/catch — skip failing providers, log error, continue

---

## GraphQL API

### Mutations (in `cloud/apps/api/src/graphql/mutations/llm.ts`)

```graphql
# setProviderBalance(providerId: ID!, balance: Float): LlmProvider
# - balance null → sets DB balance to null (disables tracking)
# - balance < 0 → throws ValidationError
# - balance rounded to 4 decimal places (Decimal)
# - Audit: createAuditLog with action 'SET_PROVIDER_BALANCE'

# syncProviderBalance(providerId: ID!, realBalance: Float!): ProviderBalanceSyncLog
# - Reads current balance from LlmProvider
# - Creates ProviderBalanceSyncLog with delta = realBalance - currentBalance
# - Updates LlmProvider.balance = realBalance atomically (single transaction)
# - realBalance < 0 → throws ValidationError
# - Audit: createAuditLog with action 'SYNC_PROVIDER_BALANCE'
```

### Type Extensions

**`LlmProvider` GQL type** (`types/llm-provider.ts`):
```graphql
balance: Float          # nullable; from Decimal → toNumber()
lastSyncedAt: DateTime  # nullable; resolved from most recent ProviderBalanceSyncLog
```

**New `ProviderBalanceSyncLog` GQL type**:
```graphql
type ProviderBalanceSyncLog {
  id: ID!
  providerId: ID!
  systemBalanceAtSync: Float!
  enteredBalance: Float!
  delta: Float!
  syncedAt: DateTime!
}
```

---

## UI Flow

### Warning Gate (RunForm.tsx)

```
handleStartRun() {
  1. Compute per-provider cost: group costEstimate.perModel by modelId.split(':')[0]
  2. For each provider with balance != null:
     - if providerCost > balance → add to overdraftProviders[]
  3. if overdraftProviders.length > 0:
     - setState({ showBudgetWarning: true, overdraftProviders })
     - return (do NOT call startRun yet)
  4. else: call startRun() directly
}

BudgetWarningDialog onProceed → call startRun()
BudgetWarningDialog onCancel → close dialog, stay on form
```

**Provider balance availability**: `LLM_PROVIDERS_QUERY` will include `balance` field. The `providers` data is already loaded in `ModelsPanel` (parent page), passed down or re-queried in `RunForm` context. A lightweight additional query for provider balances may be needed if `RunForm` doesn't currently have access to provider data — see Implementation Notes below.

### ProviderSettingsModal Changes

1. Add `balance: number | null` to `ProviderSettingsModalProps`
2. Add `balance` state variable (string input, empty = null)
3. Add `<Input label="Budget Balance ($)" type="number" min="0" step="0.01" />` after rate limit fields
4. Pass `balance: parsed | null` in `onSave()` call
5. Caller (`ModelsPanel` or `ProviderSection`) invokes `setProviderBalance` mutation

### Provider Balance Display

In `ProviderSection.tsx` accordion header: show `$X.XX remaining` or `No budget set` badge alongside existing rate-limit info.

---

## Implementation Notes

### Provider data in RunForm

`RunForm.tsx` does not currently load provider data. Two options:
1. **(Recommended)** Add a `useQuery(LLM_PROVIDERS_QUERY)` in `RunForm` or `useRunForm` hook — providers are already loaded by `ModelsPanel` but not passed to `RunForm`
2. Or pass providers as a prop from the parent page

Option 1 is cleaner since `RunForm` is used in multiple contexts. Provider data is small (typically <10 providers).

### Decimal → Float conversion

Prisma `Decimal` fields serialize as `Decimal` objects (not plain numbers). In GQL resolvers, expose with explicit conversion:
```typescript
balance: t.float({
  nullable: true,
  resolve: (provider) => provider.balance != null ? provider.balance.toNumber() : null,
})
```

### Atomic deduction SQL

Do NOT use `prisma.llmProvider.update({ data: { balance: { decrement: cost } } })` — Prisma's `decrement` is not NULL-safe (will fail if balance is null). Use raw SQL:
```typescript
await db.$executeRaw`
  UPDATE llm_providers
  SET balance = balance - ${cost}
  WHERE name = ${providerName}
  AND balance IS NOT NULL
`
```

### No `User` relation on `ProviderBalanceSyncLog` in `index.ts` exports

The `User` model has many relations; add the reverse relation to `User` model in `schema.prisma` for `balanceSyncLogs ProviderBalanceSyncLog[]`.

---

## Test Plan

### API Unit Tests (`tests/services/budget/deduct.test.ts`)

| Test case | Assertion |
|-----------|-----------|
| Provider with balance, run with cost → balance decremented | Balance reduced by `perModel.totalCost` sum for that provider |
| Provider with null balance → no deduction | No DB update called for null-balance provider |
| Run with null `estimatedCosts` in config → no deduction, no error | Function returns silently |
| Two providers in one run → each deducted independently | Both providers updated atomically |
| `modelId` without colon (no provider prefix) → skipped with warn | Warning logged, other providers processed |
| `LlmProvider` not found for prefix → skipped with warn | Warning logged, other providers processed |

### Mutation Tests

| Test case | Assertion |
|-----------|-----------|
| `setProviderBalance` with positive balance → saved | `LlmProvider.balance` updated |
| `setProviderBalance` with null → balance cleared | `LlmProvider.balance` is null |
| `setProviderBalance` with negative value → ValidationError | Error returned |
| `syncProviderBalance` → log entry created with correct delta | `ProviderBalanceSyncLog` row with `delta = real - system` |
| `syncProviderBalance` with negative value → ValidationError | Error returned |

### Web Unit Tests

| Test case | Assertion |
|-----------|-----------|
| `BudgetWarningDialog` renders provider rows correctly | Each row shows name, cost, balance |
| Warning gate: no overdraft → `startRun` called immediately | No dialog shown |
| Warning gate: overdraft → dialog shown, startRun NOT called | Dialog visible |
| Warning gate: user clicks "Proceed Anyway" → `startRun` called | Run starts |
| Warning gate: user clicks "Cancel" → `startRun` NOT called | Dialog closes |

---

## Migration Command

```bash
cd /tmp/wt-provider-budget-factory/cloud

# Generate and apply migration
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma migrate dev \
    --name add_provider_budget_tracking \
    --schema packages/db/prisma/schema.prisma
```

---

## Constitution Compliance Summary

| Requirement | Approach |
|------------|----------|
| Service layer owns DB | `deductProviderBalancesForRun()` in `services/budget/deduct.ts` |
| No `any` | All types explicit; JSON config cast via `as RunConfig` with zod or typed assertion |
| File size ≤ 400 lines | All new files < 100 lines; modified files grow by < 50 lines each |
| Structured logging | `createLogger('services:budget:deduct')` with object + message |
| Atomic DB operation | Raw SQL `UPDATE ... SET balance = balance - $cost WHERE balance IS NOT NULL` |
| Audited mutations | Both mutations create audit log entries |
| Migration via Prisma Migrate | `prisma migrate dev`, not `db push` |
