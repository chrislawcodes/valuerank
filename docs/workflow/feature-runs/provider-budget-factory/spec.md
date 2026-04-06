# Feature Specification: Provider Budget Tracking

**Feature branch**: `factory/provider-budget`
**Created**: 2026-03-31
**Status**: Draft
**Feature directory**: `specs/030-provider-budget-tracking/`

---

## Input Description

Allow users to track how much money they have remaining with each LLM provider. Users manually enter a dollar balance per provider; the system auto-deducts completed run costs; users can sync the real balance from the provider dashboard (recording the drift delta); and a soft warning gate fires before any run whose estimated cost would exceed the remaining balance.

---

## User Stories & Testing

### User Story 1 - Set and View Provider Balance (Priority: P1)

As a settings user, I need to enter my current balance for each LLM provider so that the system knows how much budget I have remaining and can warn me before I overspend.

**Why this priority**: Without this story, there is no balance to track. All other stories depend on it.

**Independent Test**: Navigate to Settings → Models. For a provider (e.g., OpenAI), enter $50.00 and save. Reload the page and confirm the balance is shown as $50.00 for that provider.

**Acceptance Scenarios**:

1. **Given** the Settings → Models page is open and a provider is expanded, **When** the user clicks the balance field and enters a dollar amount, **Then** the system saves the amount and displays it in the provider header.
2. **Given** a provider has a saved balance, **When** the user views the Settings → Models page, **Then** each provider's current system balance is shown alongside the existing rate-limit info.
3. **Given** a provider has no balance set, **When** the user views the Settings → Models page, **Then** the balance displays as "Not set" (no balance tracking active for that provider).

---

### User Story 2 - Auto-Deduct Run Cost on Completion (Priority: P1)

As a settings user, I need the system to automatically subtract each run's estimated cost from the provider's balance when the run completes so that my balance stays current without manual updates.

**Why this priority**: Auto-deduction is the core "tracking" behaviour. Without it, the balance becomes stale immediately.

**Independent Test**: Set provider balance to $10.00. Start and complete a run against that provider with estimated cost $2.50. Confirm the balance decrements to $7.50 after the run reaches COMPLETED status.

**Acceptance Scenarios**:

1. **Given** a provider has a balance set and a run using that provider's models completes successfully, **When** the run transitions to COMPLETED, **Then** the provider's balance is reduced by the run's estimated cost.
2. **Given** a run uses models from multiple providers, **When** the run completes, **Then** each provider's balance is reduced only by the portion of estimated cost attributable to its own models.
3. **Given** a provider has no balance set, **When** a run using that provider completes, **Then** no deduction occurs and no error is raised.
4. **Given** a run is CANCELLED or FAILED, **When** the status is set, **Then** no deduction occurs (only COMPLETED triggers deduction).

---

### User Story 3 - Manual Balance Sync (Priority: P2)

As a settings user, I need to enter the real balance from my provider's dashboard so that the system's tracking stays accurate and I can see how much my cost estimates have drifted.

**Why this priority**: Estimates are approximations. Drift accumulates over time. Sync keeps the balance reliable. Important but the system functions without it.

**Independent Test**: Set system balance to $7.50. Confirm with the provider dashboard that the real balance is $8.10. Enter $8.10 as the synced balance. Confirm the system now shows $8.10 and records a drift of +$0.60.

**Acceptance Scenarios**:

1. **Given** a provider has a system-computed balance, **When** the user enters the real provider balance, **Then** the system updates the balance to the entered amount and records the delta (entered − system) in a sync log.
2. **Given** a sync log entry exists, **When** the user views the provider balance section, **Then** the date of the last sync is shown.
3. **Given** the user enters an invalid amount (e.g., negative number, non-numeric), **When** they attempt to save, **Then** the system rejects the input with a clear validation error.

---

### User Story 4 - Pre-Run Soft Warning Gate (Priority: P1)

As a user starting a run, I need to see a warning when the estimated cost exceeds my provider's remaining balance so that I can make an informed decision before spending money I don't have.

**Why this priority**: Without this gate, the budget tracking is informational only. The warning is the point where tracking becomes actionable.

**Independent Test**: Set OpenAI balance to $1.00. Configure a run with estimated cost $5.00 against OpenAI models. Click Start Run. Confirm a warning dialog appears showing provider name, estimated cost, and current balance. Confirm the user can either dismiss/cancel or proceed anyway.

**Acceptance Scenarios**:

1. **Given** a run is configured with an estimated cost that exceeds the provider's balance, **When** the user clicks "Start Run", **Then** a soft warning dialog appears showing provider name, estimated cost ($X), and remaining balance ($Y).
2. **Given** the warning dialog is open, **When** the user clicks "Proceed Anyway", **Then** the run starts normally.
3. **Given** the warning dialog is open, **When** the user clicks "Cancel", **Then** the run does not start and the user is returned to the run form.
4. **Given** the run uses models from multiple providers and only one provider has insufficient balance, **When** the user clicks "Start Run", **Then** the warning dialog lists only the provider(s) with insufficient funds.
5. **Given** a provider has no balance set, **When** the estimated cost is calculated, **Then** no warning is shown for that provider (budget tracking inactive).

---

### User Story 5 - Balance Visible in Provider Settings Modal (Priority: P2)

As a settings user, I need to update the provider balance inline from the Settings → Models page without navigating away so that adjustments are quick.

**Why this priority**: Balance entry must be low-friction. Fitting it into the existing provider settings modal (already used for rate limits) is the right UX rather than a new page.

**Independent Test**: Open the provider settings modal for a provider. Confirm a balance input field is present. Enter a value, save, and confirm the provider header reflects the new balance.

**Acceptance Scenarios**:

1. **Given** the provider settings modal is open (accessible via the "Rate limit" button in the provider accordion), **When** the modal renders, **Then** a "Budget Balance ($)" field is present alongside the existing rate-limit fields.
2. **Given** an existing balance is set, **When** the modal opens, **Then** the balance field is pre-populated with the current value.
3. **Given** the user clears the balance field and saves, **Then** balance tracking is deactivated for that provider (equivalent to "Not set").

---

## Edge Cases

- **Multi-provider run**: A single run may use models from different providers. Each provider's balance is reduced only by costs from its own models. Computed from per-model cost breakdown already in `CostEstimate.perModel`.
- **Negative balance**: Deduction can push balance below zero. The system allows negative balances (it's tracking, not blocking). The warning gate still fires if the pre-run estimate would exceed the current (possibly already negative) balance.
- **Zero balance**: A balance of exactly $0.00 should trigger the warning gate for any run with positive estimated cost.
- **Concurrency**: Two runs complete simultaneously for the same provider. Balance deduction must be atomic to prevent race conditions. Implement with a database-level atomic decrement (`UPDATE ... SET balance = balance - cost`).
- **Run with no estimated cost**: If estimated cost is null or zero, no deduction and no warning gate.
- **Provider not found for model**: If a model's provider cannot be resolved at completion time, log a warning and skip deduction for that model.
- **Balance set to null via sync**: Clearing the balance disables tracking silently. No error, no warning gate for future runs.
- **Warning gate eventual consistency**: If a run completes between the user loading the run form and clicking Start Run, the balance shown in the gate may be stale. This is acceptable; the gate is soft and always bypassable.

---

## GraphQL API Contract

### Mutations (added to `cloud/apps/api/src/graphql/mutations/llm.ts` or a new `provider-balance.ts`)

| Mutation | Input | Returns | Audited |
|----------|-------|---------|---------|
| `setProviderBalance(providerId: ID!, balance: Float)` | `balance` null = clear (disable tracking) | `LlmProvider` | Yes — `createdByUserId` |
| `syncProviderBalance(providerId: ID!, realBalance: Float!)` | Real balance from provider dashboard | `ProviderBalanceSyncLog` | Yes |

### Type additions

- `LlmProvider` GQL type: add `balance: Float` (nullable) and `lastSyncedAt: DateTime` (nullable, derived from most recent sync log entry)
- `ProviderBalanceSyncLog` GQL type: new — `id`, `providerId`, `systemBalanceAtSync`, `enteredBalance`, `delta`, `syncedAt`

### Validation (enforced in mutation resolver)

- `balance`: reject negative values with `ValidationError`; round to 2 decimal places before storing
- `realBalance`: reject negative values with `ValidationError`

---

## Functional Requirements

- **FR-001**: System MUST allow users to store a dollar-denominated balance for each LlmProvider record. (Supports US1, US5)
- **FR-002**: System MUST display each provider's current balance on the Settings → Models page, in the provider's accordion header or expanded section. (Supports US1)
- **FR-003**: System MUST reduce the provider's balance by the run's per-provider estimated cost atomically when a run transitions to COMPLETED status. (Supports US2)
- **FR-004**: System MUST compute per-provider cost from the run's existing per-model cost breakdown (`CostEstimate.perModel`) using each model's `provider` relation. (Supports US2)
- **FR-005**: System MUST skip balance deduction if the provider has no balance set (null). (Supports US2, US3)
- **FR-006**: System MUST record a sync event (timestamp, entered amount, system amount at time of sync, delta) when a user manually enters a real provider balance. (Supports US3)
- **FR-007**: System MUST display the date of the most recent sync for each provider where a sync has occurred. (Supports US3)
- **FR-008**: System MUST validate balance input as a non-negative number with at most 2 decimal places. (Supports US1, US3)
- **FR-009**: System MUST check all providers used by a run's configured models before starting the run. If any provider's balance is set and the estimated cost for that provider exceeds the balance, show a soft warning dialog. (Supports US4)
- **FR-010**: The soft warning dialog MUST show: provider display name, estimated cost for that provider, and current balance. (Supports US4)
- **FR-011**: The soft warning dialog MUST provide two actions: "Proceed Anyway" (run starts) and "Cancel" (run does not start). (Supports US4)
- **FR-012**: System MUST expose balance field in the existing ProviderSettingsModal alongside rate limit fields. (Supports US5)
- **FR-013**: Clearing the balance field and saving MUST set the balance to null (tracking disabled). (Supports US5, edge case)
- **FR-014**: Balance deduction MUST use an atomic database update to prevent race conditions under concurrent run completions. (Edge case: concurrency)
- **FR-015**: If a model's `LlmModel` record cannot be found at deduction time (model deprecated or deleted after run start), the system MUST log a warning and skip deduction for that model. Remaining models MUST still be processed. (Edge case: provider not found)
- **FR-016**: The `ProviderBalanceSyncLog` table MUST have an index on `providerId` to support efficient last-sync queries. (Schema)
- **FR-017**: The pre-run warning dialog MUST support listing multiple providers (when more than one has insufficient funds), with one row per provider showing: provider display name, estimated cost for that provider, and current balance. (Supports US4 scenario 4)

---

## Success Criteria

- **SC-001**: A user can set, view, and update a provider balance within 3 clicks from the Settings → Models page.
- **SC-002**: Every COMPLETED run for a provider with a set balance results in an exact balance deduction matching the run's per-provider estimated cost.
- **SC-003**: No false-positive warnings appear for runs where all providers have sufficient balance or no balance set.
- **SC-004**: The warning dialog appears in under 200ms after clicking "Start Run" when a balance shortfall is detected (no additional API round-trip required — uses already-fetched cost estimate data).
- **SC-005**: Sync events are stored and the most recent sync date is visible on the Settings page.
- **SC-006**: Concurrent run completions for the same provider never produce an incorrect balance (atomicity verified by DB constraint, not application logic).

---

## Key Entities

### ProviderBalance (new — stored on LlmProvider)

| Field | Type | Notes |
|-------|------|-------|
| `balance` | `Decimal?` | Current system-tracked balance in USD. Null = not tracking. |

### ProviderBalanceSyncLog (new table)

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` | CUID primary key |
| `providerId` | `String` | FK → LlmProvider |
| `systemBalanceAtSync` | `Decimal` | Balance the system computed before the sync |
| `enteredBalance` | `Decimal` | Value the user entered from their dashboard |
| `delta` | `Decimal` | `enteredBalance - systemBalanceAtSync` (positive = undercount, negative = overcount) |
| `syncedAt` | `DateTime` | Timestamp of sync |
| `createdByUserId` | `String?` | FK → User |

---

## Assumptions

1. **Estimate-based deduction, not actuals**: Deduction uses the run's cost estimate stored in `run.config.estimatedCosts.perModel` (a `CostEstimate` object serialised as JSON at run-start time). Actual cost reconciliation is out of scope for this feature.
2. **Single currency (USD)**: All balances and costs are USD. No currency conversion.
3. **No hard block**: The soft gate is always bypassable. There is no admin toggle to make the gate hard.
4. **Sync log is append-only**: Old sync entries are not deleted. This provides a full drift history.
5. **Provider extracted from modelId prefix**: `ModelCostEstimate.modelId` uses the format `"provider:model"` (e.g. `"openai:gpt-4o"`). At deduction time, extract the provider prefix via `modelId.split(':')[0]`, then look up `LlmProvider` where `name = providerPrefix`. No additional join on `LlmModel` is needed for the provider lookup.
6. **Balance stored on LlmProvider directly**: Not a separate table. Simpler schema; one balance per provider.
7. **No notifications**: Low balance does not trigger email or push notifications in this version. The warning gate covers the in-app case.
8. **Warning gate uses client-side aggregation**: The UI has already loaded model-to-provider mapping from the model selector. Per-provider cost aggregation for the warning gate groups `CostEstimate.perModel` entries by their `modelId` prefix — no additional API round-trip required.
9. **Warning gate is eventually consistent**: If a run completes between the user loading the form and clicking Start Run, the displayed balance may be stale. This is acceptable; the gate is soft and bypassable.
10. **Deduction trigger location**: `deductProviderBalancesForRun(runId)` is called in `cloud/apps/api/src/services/run/progress.ts` immediately after the `status: 'COMPLETED'` update. It is wrapped in a try/catch — deduction failure MUST NOT prevent run completion from being recorded.

---

## Constitution Validation (cloud/CLAUDE.md)

| Requirement | Status | Notes |
|------------|--------|-------|
| TypeScript, no `any` types | PASS | Spec mandates typed entities |
| File size ≤ 400 lines | PASS | New files will be focused: one modal, one service, one mutation |
| Test coverage | PASS | FR-003, FR-009, FR-014 are directly testable with unit tests |
| Audited mutations | PASS | Balance updates use createdByUserId pattern already in project |
| Authentication required | PASS | All mutations run through existing auth middleware |
| No direct DB access from resolvers | PASS | Service layer will own deduction logic |
