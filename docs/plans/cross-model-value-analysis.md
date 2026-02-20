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
| Per-value outcome (raw) | `Transcript.content.summary.values` | `{ "Value_A": "prioritized", "Value_B": "deprioritized" }` |
| **Pre-aggregated per run** | `AnalysisResult.output.perModel[modelId].values[valueName]` | `{ winRate, confidenceInterval: {lower, upper}, count: {prioritized, deprioritized, neutral} }` |

### Key Insight: AnalysisResult Already Has What We Need

Each completed run stores a full `AnalysisResult` (type `basic`, status `CURRENT`) with this structure:

```json
{
  "perModel": {
    "gpt-4o": {
      "sampleSize": 25,
      "values": {
        "Benevolence_Caring": {
          "winRate": 0.764,
          "confidenceInterval": { "lower": 0.624, "upper": 0.874, "level": 0.95, "method": "wilson_score" },
          "count": { "prioritized": 13, "deprioritized": 4, "neutral": 8 }
        },
        "Universalism_Tolerance": { ... }
      },
      "overall": { "mean": 3.42, "stdDev": 1.203, "min": 1.0, "max": 5.0 }
    }
  },
  "modelAgreement": { ... },
  "mostContestedScenarios": [ ... ],
  "computedAt": "2026-02-19T..."
}
```

**This means we do NOT need to pull individual transcripts.** The aggregated counts per model per value are pre-computed and stored in the analysis output.

## MCP Tool Inventory & Token Budgets

| Tool | Budget | Use Case |
|------|--------|----------|
| `list_definitions` | 2KB | Get all 45 job-domain vignette IDs (1 call) |
| `list_runs` | 2KB | Get completed run IDs per definition (per-definition or batched) |
| `get_run_summary` | 5KB | Quick check of a run's analysis state (truncates per-value detail) |
| `get_dimension_analysis` | 2KB | Per-run dimension divergence (not needed for cross-model) |
| `get_run_results` | 8KB | Per-transcript decision codes (fallback if analysis incomplete) |
| `get_transcript` | 10KB | Full conversation (NOT needed for this analysis) |
| `graphql_query` | 10KB | **Primary extraction tool** — batch-query runs + raw AnalysisResult.output |

### Token Efficiency Strategy

**Problem:** Pulling all data via MCP in conversation requires ~90+ tool calls with per-call token overhead.

**Solution:** Two-phase approach:
1. **MCP for discovery & verification** (3-5 calls) — confirm data availability and structure
2. **Local Python script** for bulk extraction via direct GraphQL API calls — no MCP token budgets, full JSON responses

## Phase 1: Discovery & Verification (MCP, ~5 calls)

### Step 1a: List all job-domain vignettes
```
MCP: list_definitions(folder: "jobs", limit: 50)
→ Returns: [{id, name, ...}, ...] for all 45 definitions
```
**Purpose:** Confirm we have all 45, get their IDs and names.

### Step 1b: Verify run coverage
```
MCP: list_runs(status: "completed", has_analysis: true, limit: 100)
→ Returns: [{id, status, models, scenarioCount, ...}, ...]
```
**Purpose:** Confirm runs exist for all definitions. Cross-reference with Step 1a.

### Step 1c: Spot-check one analysis result
```
MCP: graphql_query(query: """
  query { run(id: "<first-run-id>") {
    analysisResults { output status analysisType }
    definition { name content }
  }}
""")
```
**Purpose:** Verify the AnalysisResult.output structure matches expectations. Confirm `perModel.*.values.*` contains win rates and counts. Check that `definition.content.dimensions` has the value pair names.

### Step 1d: Identify any gaps
Compare definitions vs runs to flag:
- Vignettes with no completed run
- Runs with no analysis (status != CURRENT)
- Runs with fewer than 10 models

## Phase 2: Bulk Data Extraction (Local Script)

### Why a local script?

MCP tool calls have token budgets (2-10KB per response) and each call costs conversation tokens. For 45 definitions × their runs, a Python script hitting the GraphQL API directly is:
- **~20x more token-efficient** — no per-call overhead
- **Faster** — parallel HTTP requests
- **Reliable** — no truncation risk

### Step 2a: Write extraction script

`scripts/analysis/extract_cross_model_data.py`:

```python
"""
Extract cross-model value analysis data from ValueRank GraphQL API.
Outputs raw-data.csv with per-model per-value outcomes for all job-domain vignettes.
"""
import requests
import json
import csv
import os

API_URL = os.getenv("VALUERANK_API_URL", "https://api.valuerank.ai/graphql")
API_KEY = os.getenv("VALUERANK_API_KEY")  # or JWT token

def graphql(query: str, variables: dict = None) -> dict:
    """Execute a GraphQL query against the ValueRank API."""
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"
    resp = requests.post(API_URL, json={"query": query, "variables": variables or {}}, headers=headers)
    resp.raise_for_status()
    return resp.json()["data"]

def get_definitions(folder: str = "jobs") -> list:
    """Get all definitions in a folder."""
    data = graphql("""
        query($folder: String) {
            definitions(folder: $folder, limit: 100) {
                id name content
            }
        }
    """, {"folder": folder})
    return data["definitions"]

def get_runs_with_analysis(definition_ids: list) -> list:
    """Get completed runs with CURRENT analysis for given definitions."""
    # Query in batches to avoid response size limits
    all_runs = []
    for def_id in definition_ids:
        data = graphql("""
            query($defId: ID!) {
                runs(definitionId: $defId, status: completed, limit: 10) {
                    id status createdAt
                    definition { id name content }
                    analysisResults(status: CURRENT) {
                        output analysisType status
                    }
                }
            }
        """, {"defId": def_id})
        all_runs.extend(data["runs"])
    return all_runs

def extract_value_pair(definition_content: dict) -> tuple:
    """Extract the two Schwartz values from definition dimensions."""
    dimensions = definition_content.get("dimensions", [])
    return tuple(d["name"] for d in dimensions[:2])

def extract_pairwise_outcomes(run: dict) -> list:
    """Extract per-model per-value outcomes from a run's analysis result."""
    rows = []
    definition = run["definition"]
    value_a, value_b = extract_value_pair(json.loads(definition["content"]))

    for analysis in run["analysisResults"]:
        output = json.loads(analysis["output"]) if isinstance(analysis["output"], str) else analysis["output"]
        per_model = output.get("perModel", {})

        for model_id, model_stats in per_model.items():
            values = model_stats.get("values", {})
            va_data = values.get(value_a, {})
            vb_data = values.get(value_b, {})

            rows.append({
                "vignette_name": definition["name"],
                "vignette_id": definition["id"],
                "value_a": value_a,
                "value_b": value_b,
                "model_id": model_id,
                "value_a_win_rate": va_data.get("winRate"),
                "value_b_win_rate": vb_data.get("winRate"),
                "value_a_prioritized": va_data.get("count", {}).get("prioritized", 0),
                "value_a_deprioritized": va_data.get("count", {}).get("deprioritized", 0),
                "value_a_neutral": va_data.get("count", {}).get("neutral", 0),
                "value_b_prioritized": vb_data.get("count", {}).get("prioritized", 0),
                "value_b_deprioritized": vb_data.get("count", {}).get("deprioritized", 0),
                "value_b_neutral": vb_data.get("count", {}).get("neutral", 0),
                "value_a_ci_lower": va_data.get("confidenceInterval", {}).get("lower"),
                "value_a_ci_upper": va_data.get("confidenceInterval", {}).get("upper"),
                "value_b_ci_lower": vb_data.get("confidenceInterval", {}).get("lower"),
                "value_b_ci_upper": vb_data.get("confidenceInterval", {}).get("upper"),
                "model_sample_size": model_stats.get("sampleSize"),
                "model_mean_score": model_stats.get("overall", {}).get("mean"),
            })
    return rows
```

### Step 2b: Output `raw-data.csv`

```
vignette_name, vignette_id, value_a, value_b, model_id,
value_a_win_rate, value_b_win_rate,
value_a_prioritized, value_a_deprioritized, value_a_neutral,
value_b_prioritized, value_b_deprioritized, value_b_neutral,
value_a_ci_lower, value_a_ci_upper, value_b_ci_lower, value_b_ci_upper,
model_sample_size, model_mean_score
```

Expected: ~450 rows (45 vignettes × 10 models). Each row has pre-computed win rates AND raw counts.

## Phase 3: Win-Rate Analysis (Local Script)

### Step 3a: Aggregate win rates across all vignettes

For each model, for each of the 10 values, sum counts across all vignettes where that value appeared:

```python
# For each model:
#   For each value (appears in ~9 vignettes as value_a or value_b):
#     total_prioritized = sum of prioritized counts across all vignettes
#     total_deprioritized = sum of deprioritized counts
#     aggregate_win_rate = total_prioritized / (total_prioritized + total_deprioritized)
```

**Important:** The per-run win rates are per-vignette. The cross-model analysis needs to aggregate the raw counts across vignettes, then compute the global win rate. Don't average win rates — sum the underlying counts.

### Step 3b: Output `win-rate-rankings.csv`

```
model_id, value_name, global_win_rate, total_prioritized, total_deprioritized, total_neutral,
wilson_ci_lower, wilson_ci_upper, rank_within_model
```

### Step 3c: Output `model-comparison-matrix.csv`

Pivot table: models as rows, values as columns, global win rates as cells. Include rank for each cell.

## Phase 4: Bradley-Terry Analysis (Local Script)

### Input transformation

From `raw-data.csv`, derive pairwise "matches" for Bradley-Terry:

```python
# For each row in raw-data.csv:
#   If value_a_prioritized > value_a_deprioritized → value_a wins
#   If value_b_prioritized > value_b_deprioritized → value_b wins
#   If counts are equal or both neutral → exclude from BT

# Multi-sample: each transcript is an independent match observation.
# Use raw counts: if value_a was prioritized 8 times and deprioritized 2 times
# in a vignette, that's 8 wins for value_a and 2 wins for value_b.
```

### Fitting per-model BT models

```python
import numpy as np
# choix or custom MLE implementation

VALUE_NAMES = [...]  # 10 Schwartz values
value_idx = {name: i for i, name in enumerate(VALUE_NAMES)}

for model_id in models:
    matchups = []  # [(winner_idx, loser_idx), ...]

    for row in model_rows:
        va_idx = value_idx[row["value_a"]]
        vb_idx = value_idx[row["value_b"]]
        # Each prioritized count = one "win" for that value
        matchups.extend([(va_idx, vb_idx)] * row["value_a_prioritized"])
        matchups.extend([(vb_idx, va_idx)] * row["value_b_prioritized"])

    params = choix.ilsr_pairwise(10, matchups)
    strengths = np.exp(params - params.mean())  # Normalize
```

### Bootstrap confidence intervals

```python
N_BOOTSTRAP = 1000
for b in range(N_BOOTSTRAP):
    # Resample matchups with replacement
    boot_matchups = resample(matchups)
    boot_params = choix.ilsr_pairwise(10, boot_matchups)
    # Store normalized strengths
```

### Output: `bradley-terry-rankings.csv`

```
model_id, value_name, bt_strength, bt_log_strength, bt_rank,
bt_ci_lower, bt_ci_upper, bt_prob_vs_avg
```

Where `bt_prob_vs_avg` = probability this value beats an "average" value (useful for interpretation).

## Phase 5: Divergence Analysis (Local Script)

### Output: `pairwise-divergence.csv`

For each of the 45 model pairs (10 choose 2):

```python
from scipy.stats import kendalltau

for model_a, model_b in combinations(models, 2):
    ranks_a = [rank_of_value[model_a][v] for v in VALUE_NAMES]
    ranks_b = [rank_of_value[model_b][v] for v in VALUE_NAMES]
    tau, p_value = kendalltau(ranks_a, ranks_b)

    # Identify top-diverging values
    rank_diffs = [(abs(ra - rb), v) for v, ra, rb in zip(VALUE_NAMES, ranks_a, ranks_b)]
    top_diverging = sorted(rank_diffs, reverse=True)[:3]
```

```
model_a, model_b, kendall_tau, tau_p_value, top_diverging_value_1, rank_diff_1, ...
```

## Phase 6: Output Files Summary

| File | Rows | Description |
|------|------|-------------|
| `raw-data.csv` | ~450 | Per-model per-vignette outcomes from AnalysisResult |
| `win-rate-rankings.csv` | ~100 | 10 models × 10 values, aggregated win rates |
| `model-comparison-matrix.csv` | 10 | Pivot: models × values with win rates |
| `bradley-terry-rankings.csv` | ~100 | 10 models × 10 values, BT strength scores |
| `pairwise-divergence.csv` | 45 | All model-pair rank correlations |

All files go to `output/cross-model-analysis/`.

## Phase 7: Visualizations (optional, for review)

- Heatmap: models (rows) × values (columns), colored by BT strength
- Bump chart: value rank position across models
- Schwartz circumplex: each model plotted by its 2D motivational center

## Implementation Notes

### Dependencies

```
pip install numpy scipy pandas choix requests
```

No R needed — `choix` handles Bradley-Terry fitting in Python.

### Execution order

```bash
# 1. Verify data via MCP (interactive, ~5 calls)
#    → Confirm 45 definitions, completed runs, analysis structure

# 2. Run extraction script
python scripts/analysis/extract_cross_model_data.py
#    → Outputs raw-data.csv

# 3. Run analysis script
python scripts/analysis/compute_rankings.py
#    → Outputs all other CSVs

# 4. Manual review of CSVs before any UI work
```

### Statistical considerations

- With 45 vignettes and 10 values, each value appears in exactly 9 vignettes (complete round-robin: 10 choose 2 = 45). That's solid for BT fitting.
- **Sum counts, don't average rates.** A vignette with 25 samples contributes more evidence than one with 5.
- Neutral outcomes excluded from BT fitting (only prioritized/deprioritized).
- Multi-sample runs: each sample contributes independently to the count totals already stored in AnalysisResult.
- Bootstrap resampling at the vignette level (not individual sample level) to respect clustering.

### Data access

- **Phase 1 (discovery):** ValueRank MCP tools — `list_definitions`, `list_runs`, `graphql_query`
- **Phase 2+ (bulk extraction):** Direct GraphQL API via Python `requests` — bypasses MCP token budgets, enables full JSON responses, parallelizable

### MCP vs Direct API tradeoffs

| Approach | Pros | Cons |
|----------|------|------|
| MCP tools in conversation | Interactive, immediate feedback | Token budgets (2-10KB/call), ~90+ calls needed |
| Direct GraphQL via script | No truncation, parallelizable, repeatable | Needs API key/JWT, runs outside conversation |
| **Hybrid (recommended)** | Best of both — verify interactively, extract in bulk | Slight setup overhead |

## Future: UI Integration

Once the CSV analysis is validated, implement in the ValueRank web UI as:
- A new "Cross-Model Analysis" view for folders/tags containing multiple vignettes
- BT strength chart with CIs per model
- Interactive model-vs-model comparison
- Value stack ranking table sortable by any model
- Heatmap visualization of model × value strengths
