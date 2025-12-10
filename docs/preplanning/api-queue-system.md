# API & Queue System

> Part of [Cloud ValueRank Architecture](./architecture-overview.md)
>
> See also: [Product Specification](./product-spec.md) for context on these decisions

## Overview

Since the primary workload is **long-running AI tasks** (minutes to hours), we need:

1. **Task Queue**: Durable, persistent queue for AI operations
2. **Workers**: Processes that execute tasks (call LLMs, process responses)
3. **Progress Tracking**: Polling-based updates to clients (5-second intervals)
4. **Queue Management**: Pause, resume, cancel, retry capabilities

## Recommended Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **API** | GraphQL (Yoga or Apollo) | Flexible queries for MCP, schema introspection for LLMs |
| **Queue** | PgBoss (PostgreSQL) | Same DB as app data, no Redis needed, transactional |
| **Workers** | Python workers (separate container) | Reuse existing pipeline code, AI tooling flexibility |
| **Progress** | HTTP polling (5s intervals) | Simpler than WebSockets, sufficient for UX |

### Why GraphQL over REST

1. **MCP/LLM integration** - LLMs can introspect the schema and construct precise queries
2. **Flexible data fetching** - Get exactly what's needed, no over-fetching (critical for token budgets)
3. **Nested relationships** - Definition → runs → transcripts → analysis in one query
4. **Single endpoint** - Simpler auth, simpler MCP integration
5. **Schema as contract** - Strong typing, auto-generated TypeScript types

## Architecture

```
┌─────────────┐     ┌─────────────────────────────────┐
│   Frontend  │────▶│   GraphQL API (Yoga/Apollo)     │
│   (React)   │◀────│   POST /graphql                 │
└─────────────┘     └──────────────┬──────────────────┘
                                   │
┌─────────────┐                    │
│  Local LLM  │────────────────────┤  (same endpoint)
│  via MCP    │                    │
└─────────────┘                    │
                                   │
            ┌──────────────────────┼──────────────┐
            ▼                      ▼              ▼
      ┌───────────┐  ┌─────────────────┐  ┌───────────────────────┐
      │ PostgreSQL│  │   DataLoaders   │  │   Python Workers      │
      │ + PgBoss  │◀─│   (N+1 prevention)│ │   (separate container)│
      └───────────┘  └─────────────────┘  └──────────┬────────────┘
                                                      │
                                                      ▼
                                          ┌─────────────────────┐
                                          │   LLM Providers     │
                                          │ (OpenAI, Anthropic) │
                                          └─────────────────────┘
```

## Job Types

```
- probe:scenario      # Send single scenario to single model
- summarize:run       # Generate natural language summary
- analyze:basic       # Fast aggregation (~500ms)
- analyze:deep        # Heavy statistical analysis (10-30s)
- analyze:compare     # Cross-run comparison
```

## GraphQL Schema (Core Types)

```graphql
type Query {
  # Definitions
  definition(id: ID!): Definition
  definitions(folder: String, includeChildren: Boolean): [Definition!]!

  # Runs
  run(id: ID!): Run
  runs(definitionId: ID, experimentId: ID, status: RunStatus, limit: Int): [Run!]!

  # Experiments
  experiment(id: ID!): Experiment
  experiments(limit: Int): [Experiment!]!

  # Queue status
  queueStatus: QueueStatus!
}

type Mutation {
  # Definitions
  createDefinition(input: CreateDefinitionInput!): Definition!
  forkDefinition(parentId: ID!, name: String!, changes: JSON): Definition!

  # Runs
  startRun(input: StartRunInput!): Run!
  pauseRun(id: ID!): Run!
  resumeRun(id: ID!): Run!
  cancelRun(id: ID!): Run!

  # Experiments
  createExperiment(input: CreateExperimentInput!): Experiment!

  # Queue
  pauseQueue: QueueStatus!
  resumeQueue: QueueStatus!
}

type Definition {
  id: ID!
  name: String!
  versionLabel: String
  parentId: ID
  parent: Definition
  children: [Definition!]!
  content: JSON!
  createdAt: DateTime!
  runs: [Run!]!
}

type Run {
  id: ID!
  status: RunStatus!
  definition: Definition!
  experiment: Experiment
  config: JSON!
  progress: RunProgress!
  transcripts(model: String, limit: Int): [Transcript!]!
  analysis: Analysis
  createdAt: DateTime!
}

type RunProgress {
  total: Int!
  completed: Int!
  failed: Int!
}

type Analysis {
  basicStats: JSON!
  modelAgreement: JSON!
  dimensionAnalysis: JSON
  mostContestedScenarios(limit: Int): [ContestedScenario!]!
}
```

## Example Queries

**Get run with nested data (single request):**
```graphql
query GetRunDetails($id: ID!) {
  run(id: $id) {
    status
    progress { total completed failed }
    definition { name versionLabel }
    experiment { name hypothesis }
    analysis {
      modelAgreement
      mostContestedScenarios(limit: 5) {
        scenarioId
        variance
      }
    }
  }
}
```

**MCP-style flexible query:**
```graphql
query MCPAnalysis($runId: ID!, $model: String!) {
  run(id: $runId) {
    transcripts(model: $model, limit: 10) {
      scenarioId
      turnCount
      wordCount
    }
    analysis {
      basicStats
      dimensionAnalysis
    }
  }
}
```

## Queue Operations (Mutations)

```graphql
# Start a new run
mutation StartRun($input: StartRunInput!) {
  startRun(input: $input) {
    id
    status
    progress { total }
  }
}

# Pause/resume/cancel
mutation PauseRun($id: ID!) {
  pauseRun(id: $id) { id status }
}
```

## Progress Polling

Frontend polls for updates every 5 seconds using GraphQL:

```graphql
query PollRunProgress($id: ID!) {
  run(id: $id) {
    id
    status
    progress { total completed failed }
    recentTasks(limit: 5) {
      scenarioId
      model
      status
      error
    }
    updatedAt
  }
}
```

**Why polling over subscriptions:**
- Simpler implementation (no WebSocket connection management)
- Easier debugging (standard HTTP POST)
- Sufficient for progress updates (5s latency acceptable)
- Can add GraphQL subscriptions later if UX demands real-time

## PgBoss Implementation

PgBoss provides:
- **PostgreSQL-backed**: Uses same database as application data
- **Transactional**: Job creation can be part of a transaction with other data
- **Pause/Resume**: Built-in queue pause without losing jobs
- **Priority**: Run urgent jobs first
- **Retry**: Configurable retry with exponential backoff
- **Scheduling**: Delayed jobs, cron-like scheduling
- **Events**: Job lifecycle events via polling or pub/sub

**Why PgBoss over Redis/BullMQ?**
- One less service to manage (no Redis)
- Job data is transactionally consistent with application data
- Easier to query job history with SQL
- For hundreds to low thousands of jobs, PostgreSQL handles it easily

---

## Worker Architecture: TypeScript Orchestrator + Python

TypeScript manages the queue (native PgBoss), spawns Python for heavy computation.

```
┌─────────────────────────────────────────────────────────────────┐
│                    TypeScript Orchestrator                       │
│                    (runs in API process or separate)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│   │ PgBoss       │     │ Job Handler  │     │ Job Handler  │   │
│   │ .work()      │────▶│ probe:scenario────▶│ analyze:run  │   │
│   └──────────────┘     └──────┬───────┘     └──────┬───────┘   │
│                               │                     │           │
│                               ▼                     ▼           │
│                        ┌─────────────────────────────────┐      │
│                        │     spawnPython(script, input)  │      │
│                        │     - JSON via stdin            │      │
│                        │     - JSON result via stdout    │      │
│                        └─────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Python Worker Scripts                         │
│                    (stateless, fast startup)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   workers/                                                       │
│   ├── probe.py          # Send scenario to LLM, return response │
│   ├── analyze_basic.py  # Tier 1: win rates, basic stats        │
│   ├── analyze_deep.py   # Tier 2+: correlations, PCA            │
│   └── common/                                                    │
│       ├── llm_adapters.py   # Shared LLM provider logic         │
│       └── config.py         # Read shared provider config       │
└─────────────────────────────────────────────────────────────────┘
```

### TypeScript Orchestrator Code

```typescript
import PgBoss from 'pg-boss';
import { spawnPython } from './spawn';

const boss = new PgBoss(process.env.DATABASE_URL);
await boss.start();

// Register job handlers
await boss.work('probe:scenario', async (job) => {
  const result = await spawnPython('workers/probe.py', job.data);

  // Save transcript to database with model versioning
  await db.transcripts.create({
    run_id: job.data.run_id,
    scenario_id: job.data.scenario_id,
    model_id: job.data.model_id,           // e.g., "gemini-1.5-pro"
    model_version: job.data.model_version, // e.g., "gemini-1.5-pro-002"
    definition_snapshot: job.data.definition_snapshot, // Exact definition at run time
    content: result.transcript,
    turns: result.turns,
    turn_count: result.turn_count,
  });

  // Update run progress
  await db.runs.incrementProgress(job.data.run_id);
});

await boss.work('analyze:basic', async (job) => {
  const result = await spawnPython('workers/analyze_basic.py', job.data);
  await db.analysis_results.upsert({
    run_id: job.data.run_id,
    analysis_type: 'basic',
    basic_stats: result.basic_stats,
    // ...
  });
});
```

### Python Script Contract

```python
# workers/probe.py
import json
import sys
from common.llm_adapters import get_adapter

def main():
    # Read input from stdin
    input_data = json.load(sys.stdin)

    # Do the work
    adapter = get_adapter(input_data['model'])
    response = adapter.send_scenario(
        scenario=input_data['scenario'],
        config=input_data['config']
    )

    # Write result to stdout
    result = {
        'transcript': response.transcript,
        'turns': response.turns,
        'turn_count': len(response.turns),
    }
    json.dump(result, sys.stdout)

if __name__ == '__main__':
    main()
```

### spawnPython Utility

```typescript
// spawn.ts
import { spawn } from 'child_process';

export async function spawnPython<T>(
  script: string,
  input: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [script]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => stdout += data);
    proc.stderr.on('data', (data) => stderr += data);

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python exited ${code}: ${stderr}`));
      } else {
        resolve(JSON.parse(stdout));
      }
    });

    // Send input
    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
}
```

### Benefits of This Pattern

| Benefit | Explanation |
|---------|-------------|
| Native PgBoss | TypeScript gets full PgBoss API (retries, backoff, events) |
| Python ecosystem | Keep numpy, pandas, scipy for analysis |
| Flexible | Can add TypeScript-only workers for lightweight tasks |
| Debuggable | JSON in/out is easy to inspect and test |
| Stateless Python | Scripts are simple, no daemon management |
| Single queue impl | No duplicate queue logic in Python |

---

## Analysis Processing

Analysis is split into tiers with different trigger strategies:

| Tier | Contents | Trigger | Latency |
|------|----------|---------|---------|
| **Tier 1 (Basic)** | Win rates, per-model scores, basic stats | Auto on run complete | ~1s |
| **Tier 2 (Correlations)** | Inter-model agreement, dimension impact | On-demand when viewed | ~5s |
| **Tier 3 (Deep)** | PCA, outlier detection, LLM summaries | On-demand, queued job | ~30s |

### Analysis Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                      Analysis Pipeline                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   RUN COMPLETES                                              │
│        │                                                     │
│        ▼                                                     │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ Tier 1: Auto-triggered                                │  │
│   │ - analyze:basic job queued immediately               │  │
│   │ - Results ready within seconds                       │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                              │
│   USER VIEWS ANALYSIS                                        │
│        │                                                     │
│        ▼                                                     │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ Tier 2: On-demand                                     │  │
│   │ - Check cache (input_hash)                           │  │
│   │ - If miss: compute inline or queue analyze:deep      │  │
│   │ - Return loading state, poll for completion          │  │
│   └──────────────────────────────────────────────────────┘  │
│                                                              │
│   USER REQUESTS DEEP ANALYSIS                                │
│        │                                                     │
│        ▼                                                     │
│   ┌──────────────────────────────────────────────────────┐  │
│   │ Tier 3: Queued job                                    │  │
│   │ - analyze:deep job with lower priority               │  │
│   │ - PCA, outliers, LLM summary                         │  │
│   │ - User sees "Analysis in progress..."                │  │
│   └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Why Hybrid Triggers?

- **Sets user expectations**: Some results are instant, some require waiting
- **Controls compute costs**: Heavy analysis only runs when needed
- **Prepares for future**: As we add more expensive analysis, the pattern scales

### Caching Strategy

- Hash transcript content to detect changes (`input_hash`)
- Return cached results if hash matches
- Auto-invalidate when new transcripts added to run
- Allow manual re-analysis trigger

---

## Run Comparison & Experimentation

A key workflow is running experiments where you change one variable and compare results:

```
Experiment: "How does model selection affect safety scores?"

  run_A (baseline)           run_B (experiment)
  ├── definition: v1.2       ├── definition: v1.2      ← same
  ├── models: [gpt-4, claude]├── models: [gpt-4, gemini] ← changed
  ├── scenarios: 100%        ├── scenarios: 100%       ← same
  └── results: {...}         └── results: {...}
                    ↓
            comparison_result:
            - gemini vs claude delta
            - which scenarios diverged most
            - statistical significance
```

### Comparison API (GraphQL)

```graphql
type Query {
  comparison(id: ID!): RunComparison
  comparisons(runId: ID): [RunComparison!]!
}

type Mutation {
  compareRuns(baselineRunId: ID!, comparisonRunId: ID!): RunComparison!
}

type RunComparison {
  id: ID!
  baselineRun: Run!
  comparisonRun: Run!
  deltaByModel: JSON!
  mostChangedScenarios(limit: Int): [ScenarioDelta!]!
  statisticalSignificance: JSON
  whatChanged: ComparisonDiff!
}

# Example query
query GetComparison($id: ID!) {
  comparison(id: $id) {
    baselineRun { id definition { name } }
    comparisonRun { id definition { name } }
    deltaByModel
    mostChangedScenarios(limit: 5) {
      scenarioId
      baselineScore
      comparisonScore
      delta
    }
  }
}
```

---

## Partial / Sampled Runs

For cost control and rapid iteration, support running only a percentage of scenarios.

### Use Cases

- **10% test run**: Quick sanity check before full run (~$5 vs ~$50)
- **Progressive rollout**: Start with 10%, expand to 50%, then 100%
- **A/B sampling**: Same scenarios, different models

### Sampling Logic

```python
def select_scenarios(all_scenarios: list, percentage: int, seed: int) -> list:
    """Deterministic sampling for reproducibility."""
    import random
    random.seed(seed)

    n = max(1, len(all_scenarios) * percentage // 100)
    return random.sample(all_scenarios, n)

# Same seed + same percentage = same scenarios selected
# Allows apples-to-apples comparison across sampled runs
```

### Run Creation with Sampling

```
POST /api/queue/runs
  body: {
    definition_id: "...",
    models: ["gpt-4", "claude-3"],
    sample_percentage: 10,        # Optional: default 100
    sample_seed: 42               # Optional: random if not provided
  }
```

### Extrapolation Warning

When viewing results from sampled runs, UI should clearly indicate:
- "Based on 10% sample (12 of 120 scenarios)"
- Statistical confidence intervals for extrapolated metrics
- Option to "Expand to full run" (queues remaining 90%)

---

## Data Export API

Enable data scientists to export raw data for analysis in external tools (Jupyter, R, pandas, etc.).

### Export Endpoints

```graphql
type Query {
  # Bulk data export
  exportRun(
    id: ID!
    format: ExportFormat!
    includeTranscripts: Boolean = false  # Only if not expired
  ): ExportResult!

  exportRuns(
    ids: [ID!]!
    format: ExportFormat!
  ): ExportResult!

  # Schema for external tools
  exportSchema: SchemaDefinition!
}

enum ExportFormat {
  CSV          # Flat tables, one file per entity type
  PARQUET      # Columnar format for large datasets
  JSON_LINES   # Streaming-friendly JSON
  ARROW        # In-memory format for direct pandas/pyarrow load
}

type ExportResult {
  downloadUrl: String!       # Signed URL, expires in 1 hour
  format: ExportFormat!
  fileCount: Int!            # Number of files in archive
  totalRows: Int!
  sizeBytes: Int!
  expiresAt: DateTime!
  manifest: ExportManifest!  # Describes contents
}

type ExportManifest {
  files: [ExportFile!]!
  schemaVersion: String!
  generatedAt: DateTime!
}

type ExportFile {
  filename: String!
  entityType: String!        # 'transcripts', 'analysis', 'scenarios'
  rowCount: Int!
  columns: [ColumnInfo!]!
}
```

### Export Contents

**Parquet/CSV export includes:**

| File | Contents |
|------|----------|
| `runs.parquet` | Run metadata, timing, config |
| `transcripts.parquet` | Per-transcript metrics (even after content expires) |
| `transcript_content.parquet` | Full text (only if not expired, separate file) |
| `analysis.parquet` | All analysis results with method metadata |
| `scenarios.parquet` | Scenario definitions and dimension values |

### CLI Export (Backwards Compatibility)

```graphql
type Query {
  # Export in CLI-compatible format for fallback
  exportCLI(runId: ID!): CLIExportResult!
}

type CLIExportResult {
  downloadUrl: String!
  format: String!  # Always "cli_bundle"
  # Contains: transcripts/*.md, manifest.yaml, scenarios.yaml
}
```

### Python Client Example

```python
import requests
import pyarrow.parquet as pq

# Export run data
response = client.query('''
  query { exportRun(id: "run_xyz", format: PARQUET) { downloadUrl } }
''')

# Download and load into pandas
import pandas as pd
df = pd.read_parquet(response['exportRun']['downloadUrl'])
```

---

## Flexible Aggregation API

Enable custom aggregations beyond the pre-computed Tier 1/2/3 analysis.

### Aggregate Query

```graphql
type Query {
  aggregate(input: AggregateInput!): AggregateResult!
}

input AggregateInput {
  # Data source
  runIds: [ID!]!

  # Grouping (SQL GROUP BY equivalent)
  groupBy: [GroupByField!]!

  # Metrics to compute
  metrics: [MetricSpec!]!

  # Filtering
  filters: AggregateFilters

  # Limits
  limit: Int = 100
  orderBy: OrderBySpec
}

enum GroupByField {
  MODEL
  SCENARIO_ID
  DEFINITION_ID
  RUN_ID
  # Dimension access via dot notation in dimensionPath
}

input GroupByDimension {
  field: GroupByField!
  dimensionPath: String  # e.g., "dimensions.severity" for nested JSONB
}

input MetricSpec {
  field: String!         # Field to aggregate (e.g., "win_rate", "duration_ms")
  aggregation: AggregationType!
  alias: String          # Output field name
}

enum AggregationType {
  COUNT
  SUM
  MEAN
  MEDIAN
  STDDEV
  VARIANCE
  MIN
  MAX
  PERCENTILE_25
  PERCENTILE_50
  PERCENTILE_75
  PERCENTILE_95
  PERCENTILE_99
}

input AggregateFilters {
  models: [String!]
  scenarioIds: [String!]
  definitionIds: [ID!]
  dimensionFilters: [DimensionFilter!]  # e.g., { path: "severity", operator: GTE, value: 3 }
  dateRange: DateRange
}

input DimensionFilter {
  path: String!
  operator: FilterOperator!
  value: JSON!
}

enum FilterOperator {
  EQ
  NEQ
  GT
  GTE
  LT
  LTE
  IN
  CONTAINS
}

type AggregateResult {
  rows: [JSON!]!         # Array of { groupKey: value, metric1: value, ... }
  totalGroups: Int!
  query: AggregateInput! # Echo back for reproducibility
  computedAt: DateTime!
}
```

### Example Queries

**Win rate by model and severity level:**
```graphql
query {
  aggregate(input: {
    runIds: ["run_xyz"]
    groupBy: [{ field: MODEL }, { field: SCENARIO_ID, dimensionPath: "dimensions.severity" }]
    metrics: [
      { field: "win_rate", aggregation: MEAN, alias: "avg_win_rate" }
      { field: "win_rate", aggregation: STDDEV, alias: "win_rate_std" }
    ]
  }) {
    rows
    totalGroups
  }
}
```

**Response latency percentiles by model:**
```graphql
query {
  aggregate(input: {
    runIds: ["run_xyz", "run_abc"]
    groupBy: [{ field: MODEL }]
    metrics: [
      { field: "duration_ms", aggregation: PERCENTILE_50, alias: "p50_latency" }
      { field: "duration_ms", aggregation: PERCENTILE_95, alias: "p95_latency" }
      { field: "duration_ms", aggregation: PERCENTILE_99, alias: "p99_latency" }
    ]
  }) {
    rows
  }
}
```

**Conditional aggregation (only high-severity scenarios):**
```graphql
query {
  aggregate(input: {
    runIds: ["run_xyz"]
    groupBy: [{ field: MODEL }]
    metrics: [{ field: "Physical_Safety_win_rate", aggregation: MEAN }]
    filters: {
      dimensionFilters: [{ path: "severity", operator: GTE, value: 4 }]
    }
  }) {
    rows
  }
}
```

---

## Statistical Methods

Standardized statistical tests used across all analysis. This ensures consistent, reproducible results.

### Test Selection Matrix

| Comparison Type | Distribution | Sample Size | Test Used |
|-----------------|--------------|-------------|-----------|
| Two groups, continuous | Normal | n > 30 | Welch's t-test |
| Two groups, continuous | Non-normal | Any | Mann-Whitney U |
| Two groups, categorical | Any | Any | Chi-squared / Fisher's exact |
| Multiple groups, continuous | Normal | n > 30 | ANOVA + Tukey HSD |
| Multiple groups, continuous | Non-normal | Any | Kruskal-Wallis + Dunn's |
| Correlation | Any | Any | Spearman's rho (rank-based) |
| Agreement | Any | Any | Cohen's Kappa / Krippendorff's alpha |

### Multiple Comparison Corrections

When comparing multiple models or scenarios, p-values are adjusted:

| Method | When Used | Description |
|--------|-----------|-------------|
| Bonferroni | Conservative, few comparisons | α / n |
| Holm-Bonferroni | Default | Step-down Bonferroni |
| Benjamini-Hochberg | Many comparisons | FDR control at 0.05 |

**Default:** Holm-Bonferroni for pairwise model comparisons.

### Effect Size Measures

All comparisons include effect sizes, not just p-values:

| Comparison Type | Effect Size | Interpretation |
|-----------------|-------------|----------------|
| Two groups | Cohen's d | 0.2 small, 0.5 medium, 0.8 large |
| Multiple groups | η² (eta-squared) | 0.01 small, 0.06 medium, 0.14 large |
| Correlation | r or ρ | 0.1 small, 0.3 medium, 0.5 large |

### Confidence Intervals

All point estimates include 95% confidence intervals:

```json
{
  "win_rate": 0.72,
  "confidence_interval": {
    "lower": 0.68,
    "upper": 0.76,
    "level": 0.95,
    "method": "wilson"  // Wilson score interval for proportions
  }
}
```

### Analysis Result Schema

Every analysis result includes method documentation:

```json
{
  "basic_stats": { ... },
  "methods_used": {
    "win_rate_ci": "wilson_score",
    "model_comparison": "mann_whitney_u",
    "p_value_correction": "holm_bonferroni",
    "effect_size": "cohens_d",
    "correlation": "spearman_rho",
    "outlier_detection": "isolation_forest",
    "alpha": 0.05
  },
  "code_version": "1.2.3",
  "computed_at": "2024-12-05T10:30:00Z"
}
```

### Reproducibility Guarantees

1. **Deterministic random seeds**: All randomized methods (bootstrap, permutation tests) use reproducible seeds stored with results
2. **Version tracking**: Analysis code version stored with every result
3. **Input hashing**: Hash of input data stored to detect changes
4. **Method documentation**: Every result includes the exact methods used

### Statistical Warnings

Analysis results include warnings when assumptions are violated:

```json
{
  "warnings": [
    {
      "code": "SMALL_SAMPLE",
      "message": "Sample size (n=8) may be insufficient for reliable inference",
      "recommendation": "Consider running more scenarios or using bootstrap methods"
    },
    {
      "code": "NON_NORMAL",
      "message": "Data does not pass Shapiro-Wilk normality test (p=0.02)",
      "recommendation": "Using non-parametric Mann-Whitney U instead of t-test"
    }
  ]
}
```

---

## Cohort Analysis API

Query and compare across user-defined cohorts (model families, scenario categories, etc.).

### Cohort Operations

```graphql
type Query {
  cohort(id: ID!): Cohort
  cohorts(type: CohortType): [Cohort!]!

  # Aggregate across cohort members
  cohortAggregate(
    cohortId: ID!
    runIds: [ID!]!
    metrics: [MetricSpec!]!
  ): AggregateResult!

  # Compare two cohorts
  compareCohorts(
    cohortA: ID!
    cohortB: ID!
    runIds: [ID!]!
  ): CohortComparison!
}

type Mutation {
  createCohort(input: CreateCohortInput!): Cohort!
  updateCohort(id: ID!, input: UpdateCohortInput!): Cohort!
  deleteCohort(id: ID!): Boolean!
}

type Cohort {
  id: ID!
  name: String!
  description: String
  type: CohortType!
  members: [String!]!           # Resolved member IDs
  filterCriteria: JSON          # Dynamic filter if applicable
  memberCount: Int!
  createdAt: DateTime!
}

enum CohortType {
  MODELS        # Group of model identifiers
  SCENARIOS     # Group of scenario IDs
  DEFINITIONS   # Group of definition IDs
  RUNS          # Group of run IDs
}

type CohortComparison {
  cohortA: Cohort!
  cohortB: Cohort!
  delta: JSON!
  statisticalTest: StatisticalTestResult!
}

type StatisticalTestResult {
  testName: String!
  statistic: Float!
  pValue: Float!
  pValueCorrected: Float
  effectSize: Float!
  effectSizeInterpretation: String!  # "small", "medium", "large"
  confidenceInterval: JSON
  significant: Boolean!              # At alpha = 0.05
}
```

### Example: Compare Model Families

```graphql
# Create cohorts
mutation {
  gpt4: createCohort(input: {
    name: "GPT-4 Family"
    type: MODELS
    members: ["gpt-4", "gpt-4-turbo", "gpt-4o"]
  }) { id }

  claude: createCohort(input: {
    name: "Claude Family"
    type: MODELS
    members: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"]
  }) { id }
}

# Compare cohorts
query {
  compareCohorts(
    cohortA: "cohort_gpt4"
    cohortB: "cohort_claude"
    runIds: ["run_xyz"]
  ) {
    delta
    statisticalTest {
      testName
      pValue
      effectSize
      effectSizeInterpretation
      significant
    }
  }
}
```
