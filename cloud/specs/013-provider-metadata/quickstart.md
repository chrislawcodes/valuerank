# Quickstart: LLM Provider Metadata

## Prerequisites

- [ ] Docker running (`docker-compose up -d postgres`)
- [ ] Database migrated (`npm run db:push`)
- [ ] Database seeded (`npm run db:seed`)
- [ ] API running (`npm run dev` in `apps/api/`)
- [ ] Web running (`npm run dev` in `apps/web/`)
- [ ] At least one LLM provider API key configured (OPENAI_API_KEY, etc.)

---

## Testing User Story 1: Database-Driven Model Configuration

**Goal**: Verify model metadata is stored in and read from database

### Test via GraphQL Playground

1. Open GraphQL Playground: `http://localhost:4000/graphql`

2. Query all providers and models:
```graphql
query {
  llmProviders {
    id
    name
    displayName
    maxParallelRequests
    requestsPerMinute
    isEnabled
    models {
      id
      modelId
      displayName
      costInputPerMillion
      costOutputPerMillion
      status
      isDefault
      isAvailable
    }
  }
}
```

3. **Expected**:
   - 6 providers returned (openai, anthropic, google, xai, deepseek, mistral)
   - Each provider has at least one model
   - Models have cost data populated
   - `isAvailable` reflects API key presence

### Test via Database

```bash
cd cloud
DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank" \
  npx prisma studio
```

1. Open `llm_providers` table - verify 6 providers
2. Open `llm_models` table - verify models with costs
3. Check `is_default` column - one per provider

---

## Testing User Story 2: Model Management Admin UI

**Goal**: Verify admin can manage models via Settings UI

### Test: View Models

1. Navigate to `http://localhost:5173/settings`
2. Click "Models" tab
3. **Expected**: Table showing all models grouped by provider

### Test: Add New Model

1. Click "Add Model" button
2. Fill in:
   - Provider: OpenAI
   - Model ID: `gpt-4o-mini-2024-07-18`
   - Display Name: GPT-4o Mini (July 2024)
   - Input Cost: 0.15
   - Output Cost: 0.60
3. Click "Create"
4. **Expected**:
   - Model appears in table under OpenAI
   - Success toast notification
   - Database shows new record

### Test: Edit Model Costs

1. Find an existing model in the table
2. Click "Edit" (pencil icon)
3. Change input cost to a new value
4. Click "Save"
5. **Expected**:
   - Cost updates in table
   - Database reflects change

### Test: Deprecate Model

1. Find a non-default model
2. Click "Deprecate" button
3. Confirm in dialog
4. **Expected**:
   - Model shows "Deprecated" badge
   - Model hidden from run model selection
   - Model still visible in admin table

---

## Testing User Story 3: Default Model Per Provider

**Goal**: Verify default models are auto-selected and manageable

### Test: View Default Models

1. In Models tab, look for "Default" badge
2. **Expected**: One model per provider has the badge

### Test: Change Default

1. Click "Set as Default" on a non-default model
2. **Expected**:
   - Previous default loses badge
   - New model has badge
   - Database `is_default` updated

### Test: Default in Run Creation

1. Navigate to a definition
2. Click "Start Run"
3. **Expected**:
   - Model selector shows default models pre-selected
   - Each enabled provider has its default checked

---

## Testing User Story 4: Infrastructure Model Selection

**Goal**: Verify infra model can be configured separately

### Test: View Infrastructure Settings

1. In Settings page, look for "Infrastructure" section/tab
2. **Expected**: Dropdown to select scenario expansion model

### Test: Change Infrastructure Model

1. Select a different model from dropdown
2. **Expected**:
   - Selection saved
   - `system_settings` table updated with new model ID

### Test: Verify Infra Model Usage

1. Set infra model to a cheap model (e.g., gpt-4o-mini)
2. Create a definition that needs scenario expansion
3. Trigger scenario expansion
4. Check worker logs
5. **Expected**: Expansion uses configured infra model, not run's target models

---

## Testing User Story 5: Safe Parallelism Defaults

**Goal**: Verify parallelism limits are enforced

### Test: View Provider Parallelism

```graphql
query {
  llmProviders {
    name
    maxParallelRequests
    requestsPerMinute
  }
}
```

**Expected**:
- OpenAI: 5 parallel
- Google: 1 parallel
- Others: 1-3 parallel

### Test: Edit Provider Limits

```graphql
mutation {
  updateLlmProvider(
    id: "provider-id-here"
    input: { maxParallelRequests: 3 }
  ) {
    provider {
      name
      maxParallelRequests
    }
  }
}
```

**Expected**: Provider limits updated in database

### Test: Parallelism Enforcement

1. Set a provider to `maxParallelRequests: 1`
2. Start a run with 5+ scenarios for that provider's model
3. Watch job queue in PgBoss
4. **Expected**: Only 1 probe job runs at a time for that provider

---

## Testing User Story 6: Rate Limit Retry

**Goal**: Verify workers handle rate limits gracefully

### Test: Simulate Rate Limit (Manual)

1. Temporarily set provider rate limit very low
2. Run multiple probes rapidly
3. Check worker logs

**Expected**:
- Log shows "rate limit detected"
- Worker backs off (30s, 60s, 90s, 120s)
- Job eventually succeeds or fails with `RATE_LIMITED` error code

### Test: Verify Error Classification

Check worker output for rate limit scenarios:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded after 4 retries",
    "retryable": true
  }
}
```

---

## Testing User Story 7: Cost Tracking

**Goal**: Verify cost estimates are calculated and displayed

### Test: Probe Output Includes Cost

1. Run a probe job
2. Check transcript record in database
3. **Expected**: `content` JSON includes `estimatedCost` field

### Test: Cost Display in UI

1. Navigate to a completed run
2. View run details
3. **Expected**: Cost breakdown shown per model

### Test: Historical Cost Accuracy

1. Note a model's current costs
2. Run a probe
3. Update model costs in admin
4. View the previous run
5. **Expected**: Run shows original costs (not updated costs)

---

## Troubleshooting

**Issue**: Models not loading
- Check database connection: `docker ps | grep postgres`
- Check migration ran: `npm run db:push`
- Check seed ran: `npm run db:seed`

**Issue**: Provider shows as unavailable
- Check API key in `.env`: `OPENAI_API_KEY`, etc.
- Restart API server after adding key

**Issue**: Parallelism not enforced
- Check PgBoss is running
- Check job scheduler reads provider limits
- Check active job counting logic

**Issue**: Costs not appearing
- Check model has non-null cost values
- Check probe worker fetches model metadata
- Check transcript content includes cost snapshot
