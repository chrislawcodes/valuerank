# Quickstart: Stage 11 - Analysis System & Visualizations

## Prerequisites

- [ ] Development environment running (`npm run dev` in cloud/)
- [ ] PostgreSQL running (docker-compose up -d)
- [ ] Python environment with scipy, numpy, pandas installed
- [ ] At least one completed run with multiple models and transcripts
- [ ] Logged in to web UI (http://localhost:3030)

## Setup

```bash
# Install new Python dependencies
cd workers
pip install scipy numpy pandas

# Install new web dependencies
cd ../apps/web
npm install recharts

# Start development
cd ../..
npm run dev
```

---

## Testing User Story 1: View Automated Analysis on Run Completion

**Goal**: Verify analysis is automatically computed when a run completes

**Steps**:
1. Navigate to Definitions tab
2. Select a definition with scenarios
3. Click "Start Run" and select at least 2 models
4. Wait for run to complete (watch progress)
5. Once status shows "Completed", view the run detail page

**Expected**:
- Analysis section appears below run progress
- Per-model win rates are displayed
- Confidence intervals (95%) shown for each statistic
- If some transcripts failed, a note indicates excluded failures

**Verification**:
```sql
-- Check analysis was created
SELECT id, analysis_type, status, code_version, created_at
FROM analysis_results
WHERE run_id = '[RUN_ID]';

-- Should show one row with status='CURRENT'
```

---

## Testing User Story 2: View Score Distribution Visualization

**Goal**: Verify histogram chart shows how models respond

**Steps**:
1. View a completed run with analysis
2. Look for "Score Distribution" chart section
3. Hover over histogram bars
4. Use the value filter to select a specific value (e.g., "Physical_Safety")

**Expected**:
- Histogram displays distribution of scores
- Each model shown as different color
- Tooltip shows exact counts and percentages on hover
- Filtering by value updates the chart

**Verification**:
- Chart should have clear axis labels
- Legend identifies each model
- At least 2 models visible if run had 2+ models

---

## Testing User Story 3: View Variable Impact Analysis

**Goal**: Verify dimension impact ranking is displayed

**Steps**:
1. View a completed run with analysis
2. Find "Variable Impact" or "Dimension Analysis" section
3. Examine the ranking of dimensions
4. Look for R-squared or variance explained value

**Expected**:
- Dimensions listed in order of impact
- Effect sizes (beta coefficients) shown
- High-impact dimensions visually highlighted
- Percentage of variance explained displayed

**Verification**:
- Dimensions with highest effect size should be at top
- If definition has no dimensions, section should indicate this

---

## Testing User Story 4: Compare Models

**Goal**: Verify model comparison matrix/chart is displayed

**Steps**:
1. View a completed run with 3+ models
2. Find "Model Comparison" section
3. Examine pairwise agreement scores
4. Look for outlier model highlighting

**Expected**:
- Inter-model agreement scores displayed (Spearman's rho)
- Pairwise comparisons show which models agree/disagree
- Effect sizes (Cohen's d) shown for comparisons
- p-values with Holm-Bonferroni correction indicated
- Outlier models (if any) highlighted

**Verification**:
```graphql
# Query in GraphQL playground (localhost:3031/graphql)
query {
  run(id: "[RUN_ID]") {
    analysis {
      modelAgreement
    }
  }
}
```

---

## Testing User Story 5: View Statistical Method Documentation

**Goal**: Verify methods used are documented

**Steps**:
1. View analysis results
2. Find "Methods" or "Methodology" section (may be expandable)
3. Click to expand if collapsed
4. Review documented methods

**Expected**:
- Specific tests listed (e.g., "Mann-Whitney U", "Spearman's rho")
- Confidence interval method shown (e.g., "Wilson score")
- p-value correction method shown (e.g., "Holm-Bonferroni")
- Alpha level shown (0.05)
- Code version displayed

**Verification**:
- If warnings exist (small sample, non-normal), they should be visible

---

## Testing User Story 6: View Analysis with Caching

**Goal**: Verify cached analysis loads instantly

**Steps**:
1. View a completed run's analysis
2. Note the "computed at" timestamp
3. Navigate away (to Runs list)
4. Return to the same run detail page
5. Observe load time

**Expected**:
- Second view loads instantly (from cache)
- "Computed at" timestamp remains the same
- No "Computing..." indicator on reload

**Verification**:
```sql
-- Verify single analysis result (no duplicates)
SELECT COUNT(*) FROM analysis_results
WHERE run_id = '[RUN_ID]' AND analysis_type = 'basic';
-- Should return 1
```

**Test Cache Invalidation**:
1. If possible, add a new transcript to the run (via direct DB or re-run scenario)
2. View run detail page
3. Analysis should show "Computing..." then update

---

## Testing User Story 7: Filter Analysis by Model or Value

**Goal**: Verify filters work correctly

**Steps**:
1. View analysis for a run with multiple models
2. Find filter controls (model dropdown, value dropdown)
3. Select a single model filter
4. Observe charts and statistics update
5. Add a value filter
6. Click "Clear filters" or remove filters

**Expected**:
- Charts update to show only selected model(s)
- Statistics recalculate for filtered subset
- Multiple filters can be combined
- Clear filters button resets to all data

**Verification**:
- Model comparison section should hide when only 1 model selected
- Filtered data should match visual presentation

---

## Testing User Story 8: View Most Contested Scenarios

**Goal**: Verify contested scenarios list works

**Steps**:
1. View analysis for a run with varied responses
2. Find "Most Contested Scenarios" section
3. Examine the list (should show top 5 by default)
4. Click on a scenario ID/name

**Expected**:
- Scenarios ranked by cross-model disagreement
- Variance or disagreement score shown for each
- Clicking scenario navigates to transcript view
- List shows methodology (how "contested" is defined)

**Verification**:
- Scenarios at top should have highest variance values
- Each scenario should have model breakdown visible

---

## Troubleshooting

### Issue: Analysis never appears
**Possible Causes**:
- analyze_basic job not running
- Python worker error

**Fix**:
```bash
# Check queue for pending jobs
SELECT * FROM pgboss.job WHERE name = 'analyze_basic' AND state = 'created';

# Check logs
tail -f logs/api.log | grep analyze
```

### Issue: "Analysis failed" error
**Possible Causes**:
- Python dependency missing
- Invalid transcript data

**Fix**:
```bash
# Test Python worker directly
echo '{"runId": "test", "transcriptIds": []}' | python workers/analyze_basic.py

# Should return valid JSON
```

### Issue: Charts not rendering
**Possible Causes**:
- Recharts not installed
- Data format mismatch

**Fix**:
```bash
cd apps/web && npm list recharts
# Should show recharts@2.x.x

# Check browser console for errors
```

### Issue: Cache not invalidating
**Possible Causes**:
- Input hash not including new transcripts

**Fix**:
```sql
-- Check input hash
SELECT input_hash FROM analysis_results WHERE run_id = '[RUN_ID]';

-- Compare to expected hash of current transcripts
```

---

## API Testing

### Query Analysis via GraphQL

```graphql
# Get full analysis
query GetAnalysis($runId: ID!) {
  run(id: $runId) {
    id
    status
    analysisStatus
    analysis {
      id
      computedAt
      codeVersion
      perModel
      modelAgreement
      dimensionAnalysis
      mostContestedScenarios {
        scenarioId
        scenarioName
        variance
      }
      methodsUsed
      warnings {
        code
        message
        recommendation
      }
    }
  }
}
```

### Trigger Recompute

```graphql
mutation RecomputeAnalysis($runId: ID!) {
  recomputeAnalysis(runId: $runId) {
    id
    computedAt
    codeVersion
  }
}
```
