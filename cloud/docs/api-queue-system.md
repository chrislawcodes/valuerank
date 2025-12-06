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

```javascript
import PgBoss from 'pg-boss';

const boss = new PgBoss(process.env.DATABASE_URL);
await boss.start();

// Example: Creating a run
async function startRun(runConfig) {
  const run = await db.runs.insert(runConfig);

  for (const scenario of scenarios) {
    for (const model of runConfig.target_models) {
      await boss.send('probe:scenario', {
        run_id: run.id,
        scenario_id: scenario.id,
        model: model
      }, {
        priority: 1,
        retryLimit: 3,
        retryBackoff: true,
        retryDelay: 2
      });
    }
  }

  return run;
}

// Worker subscribes to job type
await boss.work('probe:scenario', async (job) => {
  const { run_id, scenario_id, model } = job.data;
  // ... call LLM, save transcript
});
```

**Why PgBoss over Redis/BullMQ?**
- One less service to manage (no Redis)
- Job data is transactionally consistent with application data
- Easier to query job history with SQL
- For hundreds to low thousands of jobs, PostgreSQL handles it easily

---

## Analysis Processing

The deep analysis is computationally heavy (10-30s) and includes:
- PCA for model positioning
- Outlier detection (Mahalanobis, Isolation Forest, Jackknife)
- Pearson correlations across dimensions
- Inter-model agreement matrices
- LLM-generated narrative summaries

### Analysis Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                      Analysis Pipeline                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────┐    ┌──────────┐    ┌──────────────────────┐ │
│   │ Basic    │───▶│ Cache    │───▶│ Return cached result │ │
│   │ Analysis │    │ Check    │    └──────────────────────┘ │
│   │ Request  │    └────┬─────┘                              │
│   └──────────┘         │ miss                               │
│                        ▼                                     │
│   ┌──────────┐    ┌──────────┐    ┌──────────────────────┐ │
│   │ Deep     │───▶│ Queue    │───▶│ Python Worker        │ │
│   │ Analysis │    │ Job      │    │ (dedicated compute)  │ │
│   │ Request  │    └──────────┘    └──────────┬───────────┘ │
│   └──────────┘                               │              │
│                                              ▼              │
│                                    ┌──────────────────────┐ │
│                                    │ Store in analysis    │ │
│                                    │ results table        │ │
│                                    └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Caching Strategy

- Hash transcript content to detect changes
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
