# Quickstart: Cost Visibility

## Prerequisites

- [ ] Docker running with PostgreSQL container (`docker-compose up -d postgres`)
- [ ] Development database migrated (`npm run db:migrate`)
- [ ] API server running (`npm run dev` in `apps/api`)
- [ ] Web app running (`npm run dev` in `apps/web`)
- [ ] At least one LLM provider configured with API key
- [ ] At least one definition with generated scenarios

---

## Testing User Story 1: View Predicted Cost Per Model Before Starting Run

**Goal**: Verify that cost predictions are shown per model when starting a run

### Via Web UI

**Steps**:
1. Navigate to the Definitions page
2. Select a definition with scenarios
3. Click "Start Run"
4. Select 2-3 different models (e.g., `openai:gpt-4o`, `anthropic:claude-3-5-sonnet`)
5. Observe the cost breakdown section

**Expected**:
- Each model shows predicted cost in format `$X.XX`
- Cost breakdown shows input/output token predictions
- If model has no history, shows "(estimate based on limited data)" indicator
- Costs change when sample percentage is adjusted

**Verification**:
```graphql
# Query to verify cost estimate
query {
  estimateCost(
    definitionId: "<DEFINITION_ID>",
    models: ["openai:gpt-4o", "anthropic:claude-3-5-sonnet"],
    samplePercentage: 100
  ) {
    total
    perModel {
      modelId
      displayName
      inputTokens
      outputTokens
      inputCost
      outputCost
      totalCost
      sampleCount
      isUsingFallback
    }
    isUsingFallback
  }
}
```

---

## Testing User Story 2: View Total Run Cost Estimate Before Starting

**Goal**: Verify total cost is displayed before run confirmation

### Via Web UI

**Steps**:
1. Open the start run dialog for any definition
2. Select multiple models
3. Look for the total cost summary

**Expected**:
- Total cost displayed prominently (e.g., "Estimated Total: $4.52")
- Total equals sum of per-model costs
- Total updates immediately when models are added/removed

### Via MCP Tool

**Steps**:
1. Use the `start_run` MCP tool
2. Check the response

**Expected Response**:
```json
{
  "success": true,
  "run_id": "clx...",
  "estimated_cost": {
    "total": 4.52,
    "per_model": {
      "openai:gpt-4o": {
        "input_tokens": 5000,
        "output_tokens": 45000,
        "cost": 2.10,
        "sample_count": 150
      },
      "anthropic:claude-3-5-sonnet": {
        "input_tokens": 4800,
        "output_tokens": 44000,
        "cost": 2.42,
        "sample_count": 200
      }
    },
    "using_fallback": false
  }
}
```

---

## Testing User Story 3: View Actual Cost After Run Completion

**Goal**: Verify actual cost is displayed in run results

### Steps

1. Start a run with 1-2 models (small scenario count for speed)
2. Wait for run to complete
3. Navigate to run results page
4. Check the cost summary section

**Expected**:
- "Est. Cost" stat card shows actual cost (green background)
- Per-model breakdown shows cost next to transcript count
- Cost is calculated from real token usage, not predictions

**Verification**:
```graphql
# Query completed run with cost data
query {
  run(id: "<RUN_ID>") {
    id
    status
    analysis {
      actualCost
    }
    transcripts {
      modelId
      tokenCount
      estimatedCost
    }
  }
}
```

---

## Testing User Story 4: Automatic Token Statistics Collection

**Goal**: Verify statistics are updated after run completion

### Steps

1. Note current statistics for a model:
   ```graphql
   query {
     modelTokenStats(modelIds: ["openai:gpt-4o"]) {
       modelId
       avgInputTokens
       avgOutputTokens
       sampleCount
       lastUpdatedAt
     }
   }
   ```

2. Start and complete a run with that model

3. Wait ~30 seconds after run completion

4. Query statistics again

**Expected**:
- `sampleCount` increased by number of probes in run
- `avgInputTokens` and `avgOutputTokens` updated (may change slightly)
- `lastUpdatedAt` is recent (within last minute)

**Database Verification**:
```sql
SELECT * FROM model_token_statistics
WHERE model_id = (SELECT id FROM llm_models WHERE model_id = 'gpt-4o')
ORDER BY last_updated_at DESC;
```

---

## Testing Fallback Behavior

**Goal**: Verify fallback logic when model has no statistics

### Scenario A: New Model (No History)

1. Add a new model to the system (or use one never run before)
2. Try to estimate cost including this model
3. Verify it uses all-model average if other models have data
4. Verify it uses system default (100 in / 900 out) if DB is empty

**Verification**:
```graphql
query {
  estimateCost(
    definitionId: "<DEFINITION_ID>",
    models: ["new-provider:new-model"],
    samplePercentage: 100
  ) {
    perModel {
      modelId
      avgInputPerProbe    # Should be 100 or all-model avg
      avgOutputPerProbe   # Should be 900 or all-model avg
      isUsingFallback     # Should be true
    }
    isUsingFallback       # Should be true
    fallbackReason        # Should explain why
  }
}
```

### Scenario B: Empty Database

1. Reset test database or use fresh environment
2. Estimate cost for any model
3. Verify system defaults are used

**Expected**:
- `avgInputPerProbe`: 100
- `avgOutputPerProbe`: 900
- `isUsingFallback`: true
- `fallbackReason`: "No historical data available"

---

## Testing Cost Calculation Accuracy

**Goal**: Verify cost math is correct

### Manual Calculation

1. Get model pricing:
   ```graphql
   query {
     llmModel(providerName: "openai", modelId: "gpt-4o") {
       costInputPerMillion
       costOutputPerMillion
     }
   }
   ```

2. Get estimated cost for a run

3. Calculate manually:
   ```
   inputCost = scenarios × avgInputTokens × costInputPerMillion / 1,000,000
   outputCost = scenarios × avgOutputTokens × costOutputPerMillion / 1,000,000
   totalCost = inputCost + outputCost
   ```

4. Verify API result matches manual calculation

---

## Troubleshooting

### Issue: Cost estimate returns $0.00

**Possible Causes**:
- Model has no `costInputPerMillion` or `costOutputPerMillion` set
- Definition has no scenarios

**Fix**:
```sql
-- Check model pricing is set
SELECT model_id, cost_input_per_million, cost_output_per_million
FROM llm_models
WHERE model_id = 'gpt-4o';

-- Check definition has scenarios
SELECT COUNT(*) FROM scenarios
WHERE definition_id = '<DEFINITION_ID>' AND deleted_at IS NULL;
```

### Issue: Statistics not updating after run

**Possible Causes**:
- `compute_token_stats` job failed
- Run didn't complete (still RUNNING or FAILED)

**Fix**:
```sql
-- Check job status
SELECT * FROM pgboss.job
WHERE name = 'compute_token_stats'
ORDER BY created_on DESC LIMIT 5;

-- Check run status
SELECT id, status, completed_at FROM runs
WHERE id = '<RUN_ID>';
```

### Issue: isUsingFallback always true

**Possible Causes**:
- No completed runs with token data
- ProbeResult table missing input/output token columns

**Fix**:
```sql
-- Check if any statistics exist
SELECT COUNT(*) FROM model_token_statistics WHERE sample_count > 0;

-- Check probe results have token data
SELECT model_id, COUNT(*), AVG(input_tokens), AVG(output_tokens)
FROM probe_results
WHERE status = 'SUCCESS' AND input_tokens IS NOT NULL
GROUP BY model_id;
```
