# Provider Budget Tracking — Spec

## Overview

Allow users to track how much money they have remaining with each LLM provider. This gives a running
"balance" per provider that is reduced by run costs, with a manual sync flow to correct drift against
the real provider dashboard balance.

---

## User Stories (priority order)

### US-1 — View provider balances on Settings → Models
**As** an admin,
**I want** to see the current balance for each LLM provider on the Settings → Models page,
**so that** I can tell at a glance whether I have enough credit to run more evaluations.

**Acceptance criteria:**
- Each provider card shows a "Balance: $X.XX" line (or "—" if not set)
- Balance is shown in the expanded provider header area (visible without expanding the accordion)
- Null/unset balance renders as "—" with a muted style

---

### US-2 — Manually set a provider's balance
**As** an admin,
**I want** to enter the current balance from a provider's billing dashboard,
**so that** the system knows roughly how much credit I have left.

**Acceptance criteria:**
- The existing ProviderSettingsModal gains a "Balance ($)" number input
- Accepts values ≥ 0, precision to 2 decimal places
- Submitting saves the value via `updateLlmProvider` mutation (new `balance` field)
- On save, also records: `lastSyncedAt = now()`, `lastSyncedBalance = entered_value`
- A "Last synced" timestamp is shown beside the balance (format: "Synced Jan 15, 2:30 PM")

---

### US-3 — Auto-deduct run cost on run completion
**As** the system,
**I want** to deduct each run's actual cost from the relevant provider's balance,
**so that** the displayed balance tracks spending automatically.

**Acceptance criteria:**
- When a run reaches COMPLETED status, the system computes actual cost from transcript token counts (summing `transcript.estimatedCost` across all non-deleted transcripts for the run)
- For multi-provider runs (models from different providers), costs are split per provider: sum transcript costs grouped by provider via `model → provider` lookup
- If a provider's balance is null (not set), no deduction occurs (silent skip)
- Deduction is a non-blocking background operation (failure logged, does not fail the run)
- `providerBudgetEvents` table records each deduction: `type=DEDUCTION`, `amount` (negative, as deduction), `runId`, `providerBalanceBefore`, `providerBalanceAfter`, `createdAt`
- Cost is computed from `transcript.estimatedCost` (already populated by the probe handler)

---

### US-4 — Pre-run soft warning when balance is insufficient
**As** an admin,
**I want** a warning before starting a run if the estimated cost exceeds the provider's balance,
**so that** I don't accidentally overdraw my credits.

**Acceptance criteria:**
- On the Run Form, after model selection and cost estimation, if any provider's balance < estimated cost for that provider's models:
  - Show a non-blocking warning banner: "Low balance: [Provider] has $Y balance, estimated cost $X."
  - User can proceed anyway (no hard block)
  - The warning is per-provider (if multiple providers are selected, show one warning per underfunded provider)
- If balance is null/not set for a provider, no warning is shown (opt-in behavior)

---

### US-5 — Manual sync: record drift
**As** an admin,
**I want** to enter my real provider balance (from their dashboard) and have the system record the gap,
**so that** I can see how accurate the auto-deduction estimates have been.

**Acceptance criteria:**
- In ProviderSettingsModal, there's a "Sync Balance" section with a number input for the real balance
- On sync, the system:
  1. Computes `drift = entered_balance - current_system_balance`
  2. Records a `providerBudgetEvents` entry: `type=SYNC`, `amount=entered_balance`, `drift`, `providerBalanceBefore`, `providerBalanceAfter=entered_balance`
  3. Updates `llmProvider.balance = entered_balance`, `lastSyncedAt`, `lastSyncedBalance`
- Drift is stored but not displayed in v1 (future analytics)

---

## Data Model Changes

### `LlmProvider` — new fields
| Field | Type | Notes |
|-------|------|-------|
| `balance` | `Decimal(12,2)?` | Current system-tracked balance (USD) |
| `lastSyncedAt` | `DateTime?` | When user last manually synced |
| `lastSyncedBalance` | `Decimal(12,2)?` | Balance entered at last sync |

### New table: `ProviderBudgetEvent`
| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(cuid())` | |
| `providerId` | `String` | FK → llm_providers |
| `type` | `ProviderBudgetEventType` enum | DEDUCTION, SYNC, MANUAL_SET |
| `amount` | `Decimal(12,2)` | Absolute amount (positive = set/sync, negative = deduction) |
| `drift` | `Decimal(12,2)?` | For SYNC events: entered − system |
| `runId` | `String?` | FK → runs (for DEDUCTION events) |
| `providerBalanceBefore` | `Decimal(12,2)?` | Balance before event |
| `providerBalanceAfter` | `Decimal(12,2)?` | Balance after event |
| `createdAt` | `DateTime @default(now())` | |

---

## GraphQL Changes

### `LlmProvider` type — new fields
- `balance: Float` (nullable)
- `lastSyncedAt: DateTime` (nullable)
- `lastSyncedBalance: Float` (nullable)

### `UpdateLlmProviderInput` — new optional fields
- `balance: Float` — used for initial manual set (creates `MANUAL_SET` event, no drift calculation)

### New mutation: `syncProviderBalance(id: ID!, balance: Float!): LlmProvider`
- Replaces the `syncBalance` sub-field approach for clarity
- Triggers a SYNC event with drift = entered_balance − current_system_balance
- Updates `balance`, `lastSyncedAt`, `lastSyncedBalance`

### Fragment updates
- `LLM_PROVIDER_FRAGMENT` in `cloud/apps/web/src/api/operations/llm.ts` must include `balance`, `lastSyncedAt`, `lastSyncedBalance`

### No new queries needed for v1 (budget events table is write-only for now)

---

## Scope Boundaries (what this spec does NOT include)

- No budget alerts via email/notifications
- No per-model budget caps
- No visualization of budget event history in the UI
- No hard gate that prevents runs from starting (soft warning only)
- No display of drift history (SYNC events are recorded but not shown in v1)

---

## Open Questions

1. **Multi-provider runs**: When a user selects models from 2 different providers, we deduct from each provider proportionally. The `estimateCost` service already returns `perModel` with costs. We can sum per provider. — Accepted approach.

2. **Run cost deduction trigger**: Run reaches COMPLETED in the orchestrator. We hook into the run completion path in `services/run/control.ts`. — Confirmed.

3. **Negative balance**: We allow balance to go negative (no hard floor). This is intentional — it shows overspend.
