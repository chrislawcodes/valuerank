# Acceptance Criteria: Provider Budget Tracking

## User Stories

| ID | Title | Priority |
|----|-------|----------|
| US-1 | Set and View Provider Balance | P1 |
| US-2 | Auto-Deduct Run Cost on Completion | P1 |
| US-3 | Manual Balance Sync | P2 |
| US-4 | Pre-Run Soft Warning Gate | P1 |
| US-5 | Balance Visible in Provider Settings Modal | P2 |

---

## Acceptance Scenarios

### US-1: Set and View Provider Balance

- **Given** the Settings → Models page is open and a provider is expanded, **When** the user clicks the balance field and enters a dollar amount, **Then** the system saves the amount and displays it in the provider header.
- **Given** a provider has a saved balance, **When** the user views the Settings → Models page, **Then** each provider's current system balance is shown alongside the existing rate-limit info.
- **Given** a provider has no balance set, **When** the user views the Settings → Models page, **Then** the balance displays as "Not set" (no balance tracking active for that provider).

### US-2: Auto-Deduct Run Cost on Completion

- **Given** a provider has a balance set and a run using that provider's models completes successfully, **When** the run transitions to COMPLETED, **Then** the provider's balance is reduced by the run's estimated cost.
- **Given** a run uses models from multiple providers, **When** the run completes, **Then** each provider's balance is reduced only by the portion of estimated cost attributable to its own models.
- **Given** a provider has no balance set, **When** a run using that provider completes, **Then** no deduction occurs and no error is raised.
- **Given** a run is CANCELLED or FAILED, **When** the status is set, **Then** no deduction occurs (only COMPLETED triggers deduction).

### US-3: Manual Balance Sync

- **Given** a provider has a system-computed balance, **When** the user enters the real provider balance, **Then** the system updates the balance to the entered amount and records the delta (entered − system) in a sync log.
- **Given** a sync log entry exists, **When** the user views the provider balance section, **Then** the date of the last sync is shown.
- **Given** the user enters an invalid amount (e.g., negative number, non-numeric), **When** they attempt to save, **Then** the system rejects the input with a clear validation error.

### US-4: Pre-Run Soft Warning Gate

- **Given** a run is configured with an estimated cost that exceeds the provider's balance, **When** the user clicks "Start Run", **Then** a soft warning dialog appears showing provider name, estimated cost ($X), and remaining balance ($Y).
- **Given** the warning dialog is open, **When** the user clicks "Proceed Anyway", **Then** the run starts normally.
- **Given** the warning dialog is open, **When** the user clicks "Cancel", **Then** the run does not start and the user is returned to the run form.
- **Given** the run uses models from multiple providers and only one provider has insufficient balance, **When** the user clicks "Start Run", **Then** the warning dialog lists only the provider(s) with insufficient funds.
- **Given** a provider has no balance set, **When** the estimated cost is calculated, **Then** no warning is shown for that provider (budget tracking inactive).

### US-5: Balance Visible in Provider Settings Modal

- **Given** the provider settings modal is open (accessible via the "Rate limit" button in the provider accordion), **When** the modal renders, **Then** a "Budget Balance ($)" field is present alongside the existing rate-limit fields.
- **Given** an existing balance is set, **When** the modal opens, **Then** the balance field is pre-populated with the current value.
- **Given** the user clears the balance field and saves, **Then** balance tracking is deactivated for that provider (equivalent to "Not set").

---

## Success Criteria

- **SC-001**: A user can set, view, and update a provider balance within 3 clicks from the Settings → Models page.
- **SC-002**: Every COMPLETED run for a provider with a set balance results in an exact balance deduction matching the run's per-provider estimated cost.
- **SC-003**: No false-positive warnings appear for runs where all providers have sufficient balance or no balance set.
- **SC-004**: The warning dialog appears in under 200ms after clicking "Start Run" when a balance shortfall is detected (no additional API round-trip required — uses already-fetched cost estimate data).
- **SC-005**: Sync events are stored and the most recent sync date is visible on the Settings page.
- **SC-006**: Concurrent run completions for the same provider never produce an incorrect balance (atomicity verified by DB constraint, not application logic).

---

## Key Constraints

- **COMPLETED status triggers deduction**: Deduction fires only in `maybeCompleteRun()` in `summarize-transcript.ts` (not on FAILED or CANCELLED) — ensures only successfully completed runs reduce budget.
- **Atomic SQL update**: `UPDATE ... SET balance = balance - $cost WHERE balance IS NOT NULL` — prevents race condition when two runs complete simultaneously.
- **Deduction failure must not block run completion**: `deductProviderBalancesForRun()` is wrapped in try/catch just like analysis and token-stats triggers — budget tracking is best-effort.
- **Provider identified by modelId prefix**: Provider name = `modelId.split(':')[0]` — avoids extra DB join; relies on existing convention throughout codebase.
- **Client-side warning gate**: No server round-trip for the warning check — uses `costEstimate.perModel` already loaded in `RunForm` — required by SC-004.
- **Balance null = tracking disabled**: No validation or deduction runs for providers with `balance IS NULL` — deliberate opt-in design.
- **Validation at API layer**: Negative values for `balance` and `realBalance` → `ValidationError` before DB write.
