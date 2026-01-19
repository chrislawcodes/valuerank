# Quickstart: Multi-Sample Runs with Variance Analysis

## Prerequisites

- [ ] Development environment running (`npm run dev` in cloud/)
- [ ] PostgreSQL database running (Docker)
- [ ] Database migrated with `sampleIndex` columns
- [ ] At least one definition with scenarios exists
- [ ] API keys configured for at least one LLM provider

---

## Testing User Story 1: Configure Sample Count When Starting Run (P1)

**Goal**: Verify users can configure samples per scenario when starting a run

**Steps**:
1. Navigate to a definition detail page
2. Click "Start Run" button
3. Look for "Samples per scenario" input field
4. Verify default value is 1
5. Set samples to 3
6. Select 2 models and observe estimated job count

**Expected**:
- "Samples per scenario" field visible with default value of 1
- Estimated job count = (scenarios × models × samples)
- Example: 10 scenarios × 2 models × 3 samples = 60 jobs
- Cost estimate multiplied by sample count

**Verification**:
```bash
# After starting run, check job count
TOKEN=$(node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'cmixy5vz90000l8tv2t6ar0vc',email:'dev@valuerank.ai'},'dev-secret-key-for-local-development-only-32chars',{expiresIn:'1h'}))")

curl -s -X POST http://localhost:3031/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "query { runs(limit: 1) { id config progress { total completed failed } } }"}' | jq
```

---

## Testing User Story 2: View Variance in Analysis Results (P1)

**Goal**: Verify error bars and variance stats appear for multi-sample runs

**Steps**:
1. Wait for a multi-sample run (samples > 1) to complete
2. Navigate to Run Detail page
3. Click "Analysis" tab
4. View the Overview tab with model comparison chart
5. Hover over a model's score bar

**Expected**:
- Error bars visible on model comparison chart (vertical lines extending from bars)
- Tooltip on hover shows:
  - Mean score
  - Standard deviation
  - Min and max values
  - Sample count
- No error bars when samples = 1

**Verification**:
```bash
# Check analysis output has variance fields
curl -s -X POST http://localhost:3031/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "query { run(id: \"YOUR_RUN_ID\") { analysisResults { output } } }"}' | jq '.data.run.analysisResults[0].output.perModel | to_entries[0].value | {mean, stdDev, sampleCount}'
```

---

## Testing User Story 3: Track Progress for Multi-Sample Runs (P1)

**Goal**: Verify progress reflects total job count including all samples

**Steps**:
1. Start a run with 5 scenarios, 2 models, and 3 samples
2. Navigate to Run Detail page while run is in progress
3. Observe progress bar and job count display

**Expected**:
- Total job count shows 30 (5 × 2 × 3), not 10
- Progress shows "X of 30 probes completed"
- Per-model progress shows samples (e.g., "Model A: 15/15")

**Verification**:
```bash
# Check progress during run
curl -s -X POST http://localhost:3031/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "query { run(id: \"YOUR_RUN_ID\") { status progress { total completed failed } } }"}' | jq
```

---

## Testing User Story 4: View Per-Scenario Variance (P2)

**Goal**: Verify scenarios can be ranked by response variance

**Steps**:
1. Navigate to Analysis tab for a completed multi-sample run
2. Click "Scenarios" tab
3. Look for "Most Variable Scenarios" section

**Expected**:
- Scenarios listed with variance scores
- Sorted by variance descending (most variable first)
- Click to expand shows per-model score distribution

**Verification**:
```bash
# Check scenario variance in analysis output
curl -s -X POST http://localhost:3031/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query": "query { run(id: \"YOUR_RUN_ID\") { analysisResults { output } } }"}' | jq '.data.run.analysisResults[0].output.scenarioVariance | sort_by(-.overallVariance) | .[0:3]'
```

---

## Testing User Story 5: Compare Variance Across Models (P2)

**Goal**: Verify variance comparison between models

**Steps**:
1. Navigate to Analysis tab for a completed multi-sample run
2. View model comparison table
3. Look for "Consistency" or "Variance" column
4. Try sorting by variance

**Expected**:
- Variance/consistency column visible in model table
- Models sortable by variance (ascending = most consistent first)
- Visual difference in error bar width reflects variance

**Verification**:
Visual inspection of model comparison chart - models with higher variance should have wider error bars.

---

## Testing User Story 6: Export Multi-Sample Data (P2)

**Goal**: Verify exports include sample index data

**Steps**:
1. Navigate to a completed multi-sample run
2. Export transcripts as CSV
3. Open CSV in spreadsheet application
4. Verify sample_index column exists

**Expected**:
- CSV has `sample_index` column
- Each scenario-model pair has N rows (one per sample)
- Sample indices are 0, 1, 2, ... (N-1)

**Verification**:
```bash
# Count rows per scenario-model combination
head -50 exported_transcripts.csv | cut -d',' -f2,3,4 | sort | uniq -c
# Should show N rows per combination where N = samplesPerScenario
```

---

## Testing Edge Cases

### Edge Case: Sample Count of 1 (Default Behavior)

**Steps**:
1. Start a run with default samples (1)
2. Wait for completion
3. View Analysis tab

**Expected**:
- No error bars displayed (no variance data)
- Display matches current behavior exactly
- No variance fields in analysis output

---

### Edge Case: Partial Sample Completion

**Steps**:
1. Start a multi-sample run
2. Manually fail some probe jobs (or simulate network errors)
3. Wait for run to complete
4. View Analysis tab

**Expected**:
- Variance computed on available samples
- Warning displayed: "Some samples failed - variance based on N of M samples"
- Analysis still usable

---

### Edge Case: All Samples Identical

**Steps**:
1. Run with temperature = 0 (deterministic responses)
2. Use 3+ samples
3. View Analysis tab

**Expected**:
- Variance shows 0 or near-zero
- Error bars collapse to points
- No visual distortion

---

## Troubleshooting

**Issue**: Jobs not creating with sample index
**Fix**: Check probe-scenario handler is passing sampleIndex from job data

**Issue**: Error bars not appearing
**Fix**: Verify analysis output has `sampleCount > 1` for the model

**Issue**: Progress shows wrong total
**Fix**: Check startRun is multiplying by samplesPerScenario when calculating total

**Issue**: Variance NaN or undefined
**Fix**: Check analyze_basic worker handles edge cases (single sample, identical scores)

---

## MCP Testing

Test via MCP start_run tool:

```json
{
  "definition_id": "YOUR_DEFINITION_ID",
  "models": ["openai:gpt-4o-mini", "anthropic:claude-3-5-haiku"],
  "sample_percentage": 100,
  "samples_per_scenario": 3
}
```

Expected response should include:
- `queued_task_count` = scenarios × 2 models × 3 samples
- `config.samples_per_scenario` = 3
