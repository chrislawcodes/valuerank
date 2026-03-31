# Quickstart: Provider Budget Tracking

## Prerequisites

- [ ] Local dev environment running: `docker-compose up -d` from `cloud/`
- [ ] API server running: `npm run dev --workspace @valuerank/api`
- [ ] Web server running: `npm run dev --workspace @valuerank/web`
- [ ] Migration applied: `npx prisma migrate dev --name add_provider_budget_tracking --schema packages/db/prisma/schema.prisma`
- [ ] At least one LLM provider exists in the DB (OpenAI, Anthropic, etc.)
- [ ] At least one run configuration available (definition + model)

---

## Testing US-1 & US-5: Set and View Provider Balance

**Goal**: Verify balance can be set via the provider settings modal and displayed in the provider list.

**Steps**:
1. Navigate to `http://localhost:3030/settings` → Models tab
2. Expand a provider accordion (e.g., OpenAI)
3. Click the "Rate limit" button (provider settings modal)
4. Confirm "Budget Balance ($)" field is present
5. Enter `50.00` and click "Save Settings"
6. Reload the page
7. Confirm provider header shows `$50.00 remaining` (or similar)

**Expected**:
- "Budget Balance ($)" field is visible in modal alongside rate limit fields
- After save, balance persists on page reload
- Provider header shows the balance
- A provider with no balance shows "Not set"

**Verification** (DB query):
```sql
SELECT id, name, display_name, balance FROM llm_providers WHERE name = 'openai';
-- Should show: balance = 50.0000
```

---

## Testing US-2: Auto-Deduct Run Cost on Completion

**Goal**: Verify balance decrements after a completed run.

**Steps**:
1. Set OpenAI balance to `$10.00` (via Settings modal)
2. Navigate to a vignette (definition) that uses OpenAI models
3. Start a run with OpenAI models only — note the estimated cost (e.g., $0.05)
4. Wait for the run to reach COMPLETED status
5. Navigate to Settings → Models → OpenAI
6. Confirm balance has decreased by approximately the estimated cost

**Expected**:
- Balance shows `$9.95` (or `$10.00 - estimated_cost`)
- If the run was cancelled, balance does NOT change

**Verification** (DB query):
```sql
SELECT balance FROM llm_providers WHERE name = 'openai';
-- Should reflect deduction
```

**Edge case test** (multi-provider):
1. Set OpenAI balance to `$10.00`, Anthropic balance to `$5.00`
2. Start a run using both OpenAI and Anthropic models
3. After COMPLETED: OpenAI balance reduced by OpenAI portion only; Anthropic by Anthropic portion only

---

## Testing US-3: Manual Balance Sync

**Goal**: Verify sync records a drift delta.

**Steps**:
1. Set OpenAI balance to `$7.50` (to simulate a tracked balance)
2. In the provider settings modal, find the "Sync with real balance" field
3. Enter `$8.10` (simulating your real dashboard value)
4. Click Sync/Save
5. Confirm balance now shows `$8.10`
6. Confirm "Last synced: [today's date]" is visible

**Expected**:
- Balance updated to `$8.10`
- Last sync date shown in the UI
- Sync log entry recorded (delta = +$0.60)

**Verification** (DB query):
```sql
SELECT * FROM provider_balance_sync_logs
WHERE provider_id = (SELECT id FROM llm_providers WHERE name = 'openai')
ORDER BY synced_at DESC LIMIT 1;
-- Should show: system_balance_at_sync = 7.5000, entered_balance = 8.1000, delta = 0.6000
```

**Invalid input test**:
- Enter `-5.00` → error message should appear: "Balance must be non-negative"

---

## Testing US-4: Pre-Run Soft Warning Gate

**Goal**: Verify warning appears when estimated cost exceeds balance.

**Steps**:
1. Set OpenAI balance to `$1.00`
2. Navigate to a definition that will cost more than $1.00 to run (or set balance very low, e.g., `$0.01`)
3. Select OpenAI models in the run form
4. Click "Start Run"
5. Confirm a warning dialog appears before the run starts

**Expected**:
- Dialog shows: provider name ("OpenAI"), estimated cost for OpenAI models, current balance ($1.00)
- Two buttons: "Proceed Anyway" and "Cancel"
- Clicking "Cancel" → dialog closes, run NOT started, user stays on form
- Clicking "Proceed Anyway" → run starts normally

**No-warning test**:
1. Set OpenAI balance to `$1000.00`
2. Configure any run
3. Click "Start Run" → run starts immediately, NO dialog

**Multi-provider test**:
1. Set OpenAI balance to `$0.01` (will trigger), Anthropic balance to `$1000.00` (will not trigger)
2. Configure run with both providers
3. Warning dialog should list ONLY OpenAI, not Anthropic

---

## Troubleshooting

**Issue**: Balance field doesn't appear in the modal
**Fix**: Check that `LlmProvider.balance` is included in the `LlmProviderFields` fragment in `cloud/apps/web/src/api/operations/llm.ts`

**Issue**: Balance doesn't deduct after run completes
**Fix**: Check API logs for "Failed to deduct provider balances" error. Verify `run.config` contains `estimatedCosts.perModel` for the run (old runs may not have this).

**Issue**: Warning dialog doesn't appear
**Fix**: Confirm providers are loaded in `RunForm` context (requires `useQuery(LLM_PROVIDERS_QUERY)` in `RunForm` or `useRunForm`). Check browser console for errors.

**Issue**: Migration fails
**Fix**: Ensure `DIRECT_URL` is set (not `DATABASE_URL` with pgbouncer) for migration. Run from `cloud/` directory.
