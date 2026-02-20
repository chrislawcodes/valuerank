# Cross-Model Value Bias Analysis: Bradley-Terry & Win-Rate Rankings

## Goal

Generate a global stack ranking of the 10 Schwartz values that each AI model prioritizes, using data from all 45 completed job-domain vignettes across 10 models. Produce CSV/Excel output for manual review before implementing in the ValueRank UI.

## Context

- **45 job-domain vignettes**, each pitting 2 of 10 Schwartz values against each other
- **10 models** evaluated on each vignette
- **10 values** with complete pairwise coverage (10 choose 2 = 45 pairs)
- Each vignette produces a `decisionCode` (1-5) and per-value `prioritized`/`deprioritized`/`neutral` outcomes per model

## Data Model Reference

| Field | Location | Contains |
|-------|----------|----------|
| Value pair tested | `Definition.content.dimensions[].name` | The 2 Schwartz values in tension |
| Scenario intensity | `Scenario.content.dimension_values` | `{ "Value_A": "3", "Value_B": "4" }` |
| Per-value outcome | `Transcript.content.summary.values` | `{ "Value_A": "prioritized", "Value_B": "deprioritized" }` |
| Aggregated win rates | `AnalysisResult.output.perModel[modelId].values` | Win rate + Wilson CI per value |

## Phase 1: Extract Production Data

### Step 1a: List all job-domain vignettes
Use MCP `list_definitions` with `folder: "jobs"` to get all 45 definition IDs.

### Step 1b: List completed runs
Use MCP `list_runs` with `status: "completed"` and filter to job-domain definitions.

### Step 1c: Pull per-run analysis results
For each completed run, use MCP `get_run_summary` to get:
- Per-model win rates for each value
- Confidence intervals
- Model agreement scores

### Step 1d: Pull raw transcript-level outcomes
Use MCP `graphql_query` to fetch all transcripts for job-domain runs:
```graphql
query {
  run(id: "...") {
    transcripts {
      modelId
      scenarioId
      decisionCode
      # Need summary.values for pairwise outcomes
    }
    definition {
      name
      content  # Contains dimensions (the value pair)
    }
  }
}
```

### Step 1e: Export to CSV
Create a master CSV with columns:
```
vignette_name, value_a, value_b, model_id, decision_code, value_a_outcome, value_b_outcome
```

Where outcome is `prioritized`, `deprioritized`, or `neutral`.

This gives us ~450 rows (45 vignettes x 10 models), each representing one pairwise value comparison.

## Phase 2: Win-Rate Analysis

### Per-model value win rates
For each model, for each of the 10 values:
```
win_rate = times_prioritized / (times_prioritized + times_deprioritized)
```

**Output: `win-rate-rankings.csv`**
```
model_id, value_name, win_rate, prioritized_count, deprioritized_count, neutral_count, wilson_ci_lower, wilson_ci_upper, rank
```

This already exists in the `AnalysisResult` data per-run, but we need to aggregate across ALL runs for a given model (not just per-vignette).

### Cross-model comparison table
Pivot table: models as rows, values as columns, win rates as cells. Sort each model's values by win rate to produce the stack ranking.

## Phase 3: Bradley-Terry Analysis

### Input data format
For Bradley-Terry, each observation is a "match" between two values:
```
value_winner, value_loser, model_id
```

Derived from the transcript outcomes: the `prioritized` value wins, the `deprioritized` value loses.

### Fitting the model
For each of the 10 models independently, fit a Bradley-Terry model:

```python
# Using Python (choix library or custom MLE)
import choix
import numpy as np

# For each model:
# matchups = [(winner_idx, loser_idx), ...] across all 45 vignettes
params = choix.ilsr_pairwise(n_values, matchups)
# params are log-strength scores; exponentiate for strength ratios
strengths = np.exp(params)
```

Alternative: use R's `BradleyTerry2` package or implement MLE directly.

### Output: `bradley-terry-rankings.csv`
```
model_id, value_name, bt_strength, bt_log_strength, bt_rank, bt_ci_lower, bt_ci_upper
```

### Interpretation
- Strength scores are on a ratio scale: if Value A has strength 2.0 and Value B has 1.0, the model prioritizes A over B ~67% of the time
- Confidence intervals from bootstrap resampling (resample the 45 vignette outcomes, refit BT, take 2.5th/97.5th percentiles)

## Phase 4: Output Files

### File 1: `raw-data.csv`
All transcript-level pairwise outcomes. One row per model-vignette.

### File 2: `win-rate-rankings.csv`
Win rates per model per value, with Wilson CIs and rank.

### File 3: `bradley-terry-rankings.csv`
BT strength scores per model per value, with bootstrap CIs and rank.

### File 4: `model-comparison-matrix.csv`
Pivot table showing side-by-side value rankings for all 10 models.

### File 5: `pairwise-divergence.csv`
For each of the 45 model pairs (10 choose 2):
- Kendall's tau rank correlation on their value rankings
- Top values where they diverge most

## Phase 5: Visualizations (optional, for review)

- Heatmap: models (rows) x values (columns), colored by BT strength
- Bump chart: value rank position across models
- Schwartz circumplex: each model plotted by its 2D motivational center

## Implementation Notes

### Tools needed
- **Python** with `numpy`, `scipy`, `pandas`, `choix` (or custom BT implementation)
- Or **R** with `BradleyTerry2` package
- Could also implement BT fitting in TypeScript if we want to keep it in-repo

### Statistical considerations
- With 45 vignettes and 10 values, each value appears in ~9 vignettes (complete round-robin). That's decent but not huge — CIs will be meaningful.
- Neutral outcomes should be excluded from BT fitting (only include clear prioritized/deprioritized outcomes).
- Multi-sample runs: if a vignette was run multiple times (e.g., 3 samples), each sample is an independent observation for BT.

### Data access
- Use ValueRank MCP tools (`list_definitions`, `list_runs`, `get_run_summary`, `graphql_query`) to pull all data from production
- Alternative: direct GraphQL curl against the production API with a JWT token

## Future: UI Integration

Once the CSV analysis is validated, implement in the ValueRank web UI as:
- A new "Cross-Model Analysis" view for folders/tags containing multiple vignettes
- BT strength chart with CIs per model
- Interactive model-vs-model comparison
- Value stack ranking table sortable by any model
