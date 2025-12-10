# Quickstart: MCP API Enhancements

## Prerequisites

- [ ] Docker running with PostgreSQL container
- [ ] Development environment: `cd cloud && npm install`
- [ ] Database migrated: `npm run db:test:setup`
- [ ] API server running: `npm run dev`
- [ ] MCP client configured (Claude Desktop or test harness)
- [ ] Test data: At least one definition with scenarios and a completed run

---

## Testing User Story 1: Delete Definitions via MCP

**Goal**: Verify AI agents can soft-delete scenario definitions through MCP

### Test Case 1.1: Basic Deletion

**Steps**:
1. Create a test definition via MCP: `create_definition`
2. Note the returned `definition_id`
3. Call `delete_definition` with the definition_id

**Expected**:
- Returns `{ success: true, entityType: "definition", entityId: "...", deletedAt: "...", deletedCount: { primary: 1, scenarios: N } }`
- Definition no longer appears in `list_definitions`
- Database shows `deleted_at` timestamp set

**Verification**:
```sql
SELECT id, name, deleted_at FROM definitions WHERE id = '<definition_id>';
-- Should show non-null deleted_at
```

### Test Case 1.2: Cascade to Scenarios

**Steps**:
1. Create definition with auto-generated scenarios
2. Wait for scenario expansion to complete
3. Note scenario count
4. Delete the definition

**Expected**:
- Response includes `deletedCount.scenarios` matching expected count
- All scenarios also have `deleted_at` set

**Verification**:
```sql
SELECT COUNT(*) FROM scenarios WHERE definition_id = '<definition_id>' AND deleted_at IS NOT NULL;
-- Should match deletedCount.scenarios
```

### Test Case 1.3: Block Deletion with Running Run

**Steps**:
1. Create definition
2. Start a run against it (don't wait for completion)
3. Attempt to delete the definition

**Expected**:
- Returns error: `{ error: "VALIDATION_ERROR", message: "Cannot delete definition with running runs" }`
- Definition remains undeleted

---

## Testing User Story 2: Delete Runs via MCP

**Goal**: Verify AI agents can soft-delete evaluation runs through MCP

### Test Case 2.1: Delete Completed Run

**Steps**:
1. Identify a completed run (status: COMPLETED)
2. Call `delete_run` with the run_id

**Expected**:
- Returns `{ success: true, entityType: "run", entityId: "...", deletedAt: "...", deletedCount: { primary: 1, transcripts: N, analysisResults: M } }`
- Run no longer appears in `list_runs`

**Verification**:
```sql
SELECT id, status, deleted_at FROM runs WHERE id = '<run_id>';
SELECT COUNT(*) FROM transcripts WHERE run_id = '<run_id>' AND deleted_at IS NOT NULL;
```

### Test Case 2.2: Delete Running Run (Cancellation)

**Steps**:
1. Start a new run (will be in PENDING/RUNNING state)
2. Immediately call `delete_run`

**Expected**:
- Run status changes to CANCELLED
- Run is soft-deleted
- Any queued jobs are cancelled

---

## Testing User Story 3: List LLM Providers via MCP

**Goal**: Verify AI agents can discover available providers

### Test Case 3.1: Basic Provider List

**Steps**:
1. Call `list_llm_providers`

**Expected**:
- Returns array of providers with: id, name, displayName, isEnabled, requestsPerMinute, maxParallelRequests
- Sorted by displayName
- Response under 3KB

**Sample Response**:
```json
{
  "providers": [
    {
      "id": "clxyz...",
      "name": "anthropic",
      "displayName": "Anthropic",
      "isEnabled": true,
      "requestsPerMinute": 60,
      "maxParallelRequests": 5,
      "modelCount": 4,
      "activeModelCount": 3
    }
  ]
}
```

### Test Case 3.2: Include Models

**Steps**:
1. Call `list_llm_providers` with `include_models: true`

**Expected**:
- Each provider includes `models` array
- Response under 8KB

---

## Testing User Story 4: List LLM Models via MCP

**Goal**: Verify AI agents can see available models with costs

### Test Case 4.1: List All Models

**Steps**:
1. Call `list_llm_models`

**Expected**:
- Returns all models with: id, modelId, displayName, status, isDefault, costInputPerMillion, costOutputPerMillion
- Includes provider name for each
- Response under 5KB

### Test Case 4.2: Filter by Provider

**Steps**:
1. Get provider ID from `list_llm_providers`
2. Call `list_llm_models` with `provider_id: "<id>"`

**Expected**:
- Only returns models from specified provider

### Test Case 4.3: Filter by Status

**Steps**:
1. Call `list_llm_models` with `status: "ACTIVE"`

**Expected**:
- Only returns models with ACTIVE status
- No DEPRECATED models in response

---

## Testing User Story 5: Add New LLM Model via MCP

**Goal**: Verify operators can add models through conversation

### Test Case 5.1: Create Basic Model

**Steps**:
1. Get provider ID for OpenAI
2. Call `create_llm_model` with:
   - `provider_id`: OpenAI's ID
   - `model_id`: "gpt-test-model"
   - `display_name`: "Test Model"
   - `cost_input_per_million`: 0.50
   - `cost_output_per_million`: 1.50

**Expected**:
- Returns created model with all fields populated
- Model appears in `list_llm_models`

**Cleanup**:
```sql
DELETE FROM llm_models WHERE model_id = 'gpt-test-model';
```

### Test Case 5.2: Create as Default

**Steps**:
1. Create model with `set_as_default: true`

**Expected**:
- New model has `isDefault: true`
- Previous default (if any) has `isDefault: false`

### Test Case 5.3: Duplicate Model Error

**Steps**:
1. Create a model
2. Attempt to create same model_id for same provider

**Expected**:
- Returns error: `{ error: "CONFLICT", message: "Model already exists..." }`

---

## Testing User Story 6: Update LLM Model via MCP

**Goal**: Verify operators can update model costs

### Test Case 6.1: Update Costs

**Steps**:
1. Create a test model
2. Call `update_llm_model` with new costs

**Expected**:
- Returns updated model with new cost values
- Database reflects changes

### Test Case 6.2: Partial Update

**Steps**:
1. Call `update_llm_model` with only `display_name`

**Expected**:
- Only display_name changes
- Costs remain unchanged

---

## Testing User Story 7: Deprecate/Reactivate LLM Model via MCP

**Goal**: Verify operators can manage model lifecycle

### Test Case 7.1: Deprecate Model

**Steps**:
1. Ensure model is ACTIVE
2. Call `deprecate_llm_model`

**Expected**:
- Model status changes to DEPRECATED
- If was default, another model becomes default

### Test Case 7.2: Reactivate Model

**Steps**:
1. Deprecate a model
2. Call `reactivate_llm_model`

**Expected**:
- Model status changes to ACTIVE
- Does not automatically become default

---

## Testing User Story 8: Set Default Model via MCP

**Goal**: Verify operators can set provider defaults

### Test Case 8.1: Change Default

**Steps**:
1. Note current default for a provider
2. Call `set_default_llm_model` with different model

**Expected**:
- Returns both new default and previous default
- Only new model has `isDefault: true`

### Test Case 8.2: Set Deprecated as Default (Error)

**Steps**:
1. Deprecate a model
2. Attempt to set it as default

**Expected**:
- Returns error: `{ error: "VALIDATION_ERROR", message: "Cannot set deprecated model as default" }`

---

## Testing User Story 9: Update Provider Settings via MCP

**Goal**: Verify operators can tune rate limits

### Test Case 9.1: Update Rate Limits

**Steps**:
1. Call `update_llm_provider` with:
   - `max_parallel_requests`: 10
   - `requests_per_minute`: 120

**Expected**:
- Provider settings updated
- Returns updated provider object

### Test Case 9.2: Invalid Parallel Requests

**Steps**:
1. Call with `max_parallel_requests: 0`

**Expected**:
- Validation error (minimum 1)

---

## Testing User Story 10: Configure Infrastructure Models via MCP

**Goal**: Verify operators can configure which models handle infrastructure tasks

### Test Case 10.1: Set Scenario Expansion Model

**Steps**:
1. Call `set_infra_model` with:
   - `purpose`: "scenario_expansion"
   - `provider_name`: "openai"
   - `model_id`: "gpt-4o-mini"

**Expected**:
- System setting created/updated
- Setting key: `infra_model_scenario_expansion`

### Test Case 10.2: Invalid Purpose

**Steps**:
1. Call with `purpose: "invalid"`

**Expected**:
- Validation error listing valid options

---

## Testing User Story 11: Get System Settings via MCP

**Goal**: Verify operators can view system configuration

### Test Case 11.1: List All Settings

**Steps**:
1. Call `list_system_settings`

**Expected**:
- Returns array of settings with key, value, updatedAt
- Response under 2KB

### Test Case 11.2: Get Specific Setting

**Steps**:
1. Call with `key: "infra_model_scenario_expansion"`

**Expected**:
- Returns only that setting
- Empty array if not found

---

## Troubleshooting

### Issue: MCP tools not appearing
**Fix**: Ensure API server restarted after adding new tools. Check `npm run dev` logs for registration messages.

### Issue: "Definition not found" after creation
**Fix**: Check if soft-delete filter is working. Run:
```sql
SELECT * FROM definitions WHERE id = '<id>' AND deleted_at IS NULL;
```

### Issue: Cascade delete counts wrong
**Fix**: Check for pre-existing soft-deleted scenarios. They won't be counted in the delete operation.

### Issue: Provider ID not accepted
**Fix**: Use UUID format, not provider name. Get ID from `list_llm_providers` first.

### Issue: Job cancellation not working
**Fix**: Check PgBoss queue state. Jobs may have already completed.

---

## Response Size Verification

After implementing, verify response sizes:

```typescript
// In test
const response = await tool.call({ ... });
const size = JSON.stringify(response).length;
expect(size).toBeLessThan(5000); // 5KB limit
```

Expected limits per spec:
- `list_llm_providers` (no models): < 3KB
- `list_llm_providers` (with models): < 8KB
- `list_llm_models`: < 5KB
- `list_system_settings`: < 2KB
