# Queue System

> Part of [Cloud ValueRank Architecture](../architecture/overview.md)
>
> See also: [preplanning/api-queue-system.md](../preplanning/api-queue-system.md) for original design

## Overview

Cloud ValueRank uses **PgBoss** for durable job queue management, handling long-running AI tasks like model probing, transcript summarization, and analysis. The queue system follows an **orchestrator pattern** where TypeScript manages the queue and spawns Python workers for computation-heavy tasks.

### Why PgBoss?

| Benefit | Description |
|---------|-------------|
| PostgreSQL-backed | Uses same database as application data - no Redis needed |
| Transactional | Job creation can be part of a transaction with other data |
| Pause/Resume | Built-in queue pause without losing jobs |
| Retry with backoff | Configurable retry with exponential backoff |
| Monitoring | Query job history with SQL |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TypeScript Orchestrator                           │
│                    (runs in API process)                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐     ┌────────────────────────────────────────┐   │
│   │   PgBoss     │     │          Job Handlers                   │   │
│   │   .work()    │────▶│  probe_scenario, analyze_basic,        │   │
│   └──────────────┘     │  summarize_transcript, analyze_deep,   │   │
│                        │  expand_scenarios                       │   │
│                        └───────────────┬────────────────────────┘   │
│                                        │                             │
│                                        ▼                             │
│                        ┌────────────────────────────────────────┐   │
│                        │     spawnPython(script, input)         │   │
│                        │     - JSON via stdin                   │   │
│                        │     - JSON result via stdout           │   │
│                        └────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Python Worker Scripts                             │
│                    (stateless, fast startup)                         │
├─────────────────────────────────────────────────────────────────────┤
│   workers/                                                           │
│   ├── probe.py          # Send scenario to LLM, return transcript   │
│   ├── analyze_basic.py  # Tier 1: win rates, basic stats           │
│   ├── summarize.py      # Extract decision code from transcript     │
│   └── health_check.py   # Verify Python environment                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Job Types

The system defines five job types, each with specific purposes and configurations:

| Job Type | Purpose | Timeout | Retries |
|----------|---------|---------|---------|
| `probe_scenario` | Send scenario to LLM, record response | 5 min | 3 |
| `summarize_transcript` | Extract decision code from transcript | 2 min | 3 |
| `analyze_basic` | Compute win rates, model agreement | 10 min | 3 |
| `analyze_deep` | PCA, correlations, outlier detection | 30 min | 2 |
| `expand_scenarios` | Generate scenarios from definition template | 5 min | 2 |

### Job Data Interfaces

```typescript
// apps/api/src/queue/types.ts

type ProbeScenarioJobData = {
  runId: string;
  scenarioId: string;
  modelId: string;
  modelVersion?: string;
  config: {
    temperature: number;
    maxTurns: number;
  };
};

type SummarizeTranscriptJobData = {
  runId: string;
  transcriptId: string;
  summaryModelId?: string;  // Defaults to claude-sonnet-4
};

type AnalyzeBasicJobData = {
  runId: string;
  transcriptIds?: string[];  // Fetched from DB if not provided
  force?: boolean;           // Force recomputation even if cached
};

type AnalyzeDeepJobData = {
  runId: string;
  analysisType: 'correlations' | 'pca' | 'outliers';
};

type ExpandScenariosJobData = {
  definitionId: string;
  triggeredBy: 'create' | 'update' | 'fork';
};
```

## Core Components

### PgBoss Instance (`boss.ts`)

Location: `apps/api/src/queue/boss.ts`

Singleton pattern for PgBoss instance management:

```typescript
// Create and start PgBoss
await startBoss();

// Get the running instance
const boss = getBoss();

// Graceful shutdown
await stopBoss();
```

Key configuration:
- **Schema**: `pgboss` (dedicated schema in PostgreSQL)
- **Maintenance interval**: Configurable cleanup frequency
- **Monitor interval**: How often to check queue state

### Orchestrator (`orchestrator.ts`)

Location: `apps/api/src/queue/orchestrator.ts`

Manages worker lifecycle and queue control:

```typescript
// Start processing jobs
await startOrchestrator();

// Pause/resume queue (in-flight jobs complete)
await pauseQueue();
await resumeQueue();

// Check state
const { isRunning, isPaused } = getOrchestratorState();

// Graceful shutdown
await stopOrchestrator();
```

The orchestrator:
1. Starts PgBoss
2. Creates all queues (required by PgBoss v10+)
3. Registers all job handlers
4. Manages pause/resume by subscribing/unsubscribing from job types

### Python Spawner (`spawn.ts`)

Location: `apps/api/src/queue/spawn.ts`

Typed interface for JSON-based Python process communication:

```typescript
const result = await spawnPython<InputType, OutputType>(
  'workers/probe.py',
  { runId, scenarioId, modelId, ... },
  { timeout: 300000, cwd: '/path/to/cloud' }
);

if (result.success) {
  // result.data contains parsed JSON output
} else {
  // result.error contains error message
  // result.stderr contains Python stderr
}
```

Features:
- Timeout handling with SIGTERM
- Structured error responses
- stderr capture for debugging

## Handler Implementations

### Probe Scenario Handler

Location: `apps/api/src/queue/handlers/probe-scenario.ts`

The probe handler:
1. **Health check** (first job only): Verifies Python environment
2. **Run state check**: Skips if run is cancelled/completed, defers if paused
3. **Fetch scenario**: Gets scenario and definition content from database
4. **Resolve model version**: Maps friendly model ID to API version
5. **Execute Python worker**: Calls `probe.py` with scenario data
6. **Save transcript**: Creates transcript record with response
7. **Update progress**: Increments completed/failed counters

Error handling:
- **Retryable errors**: Network issues, rate limits, 5xx responses
- **Non-retryable errors**: Auth failures, validation errors, 4xx responses
- Progress only updated on final failure (after retries exhausted)

### Summarize Transcript Handler

Location: `apps/api/src/queue/handlers/summarize-transcript.ts`

Extracts structured decision from transcript:
1. Fetches transcript content from database
2. Calls `summarize.py` with Claude Sonnet as judge
3. Updates transcript with `decisionCode` (1-5) and `decisionText`
4. Checks if all transcripts summarized → triggers run completion
5. Triggers basic analysis on completion

### Analyze Basic Handler

Location: `apps/api/src/queue/handlers/analyze-basic.ts`

Computes Tier 1 analysis:
1. Checks for cached result using `inputHash`
2. Fetches transcripts with scenario dimensions
3. Transforms to format matching CSV export
4. Calls `analyze_basic.py`
5. Invalidates previous analyses
6. Stores result with version tracking

## Provider-Specific Queues

To enforce per-provider parallelism limits, probe jobs are routed to provider-specific queues.

Location: `apps/api/src/services/parallelism/index.ts`

### How It Works

```
Instead of one queue:     With provider queues:

probe_scenario           probe_openai (batchSize: 10)
  ├── job 1              probe_anthropic (batchSize: 5)
  ├── job 2              probe_google (batchSize: 8)
  └── ...                probe_xai (batchSize: 3)
```

Each provider queue:
- Has its own `batchSize` based on `maxParallelRequests` from database
- Only processes that many jobs concurrently
- Prevents overwhelming any single provider

### Queue Routing

```typescript
// Get the correct queue for a model
const queueName = await getQueueNameForModel('claude-3-5-sonnet');
// Returns: 'probe_anthropic'

// Route job to provider queue
await boss.send(queueName, jobData, jobOptions);
```

### Provider Limits

Limits are loaded from the `llm_providers` table:

| Provider | Max Parallel | Queue Name |
|----------|-------------|------------|
| openai | 10 | probe_openai |
| anthropic | 5 | probe_anthropic |
| google | 8 | probe_google |
| xai | 3 | probe_xai |
| deepseek | 5 | probe_deepseek |
| mistral | 5 | probe_mistral |

Cache TTL: 1 minute (auto-refreshes from database)

## Job Lifecycle

```
                    ┌──────────┐
                    │  QUEUED  │
                    └────┬─────┘
                         │
                         ▼
                    ┌──────────┐
              ┌─────│  ACTIVE  │─────┐
              │     └────┬─────┘     │
              │          │           │
              ▼          ▼           ▼
         ┌────────┐ ┌─────────┐ ┌────────┐
         │ FAILED │ │COMPLETED│ │ RETRY  │
         └────────┘ └─────────┘ └───┬────┘
                                    │
                                    └──▶ QUEUED (with backoff)
```

### Retry Configuration

Each job type has default options:

```typescript
// apps/api/src/queue/types.ts

const DEFAULT_JOB_OPTIONS = {
  probe_scenario: {
    retryLimit: 3,
    retryDelay: 5,        // seconds
    retryBackoff: true,   // exponential
    expireInSeconds: 300,
  },
  analyze_basic: {
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: true,
    expireInSeconds: 600,
  },
  // ...
};
```

### Priority Levels

```typescript
const PRIORITY_VALUES = {
  LOW: 0,
  NORMAL: 5,
  HIGH: 10,
};
```

Higher priority jobs are processed first within a queue.

## Run State Integration

The queue system respects run states:

| Run Status | Probe Job Behavior |
|------------|-------------------|
| `PENDING` | Process normally |
| `RUNNING` | Process normally |
| `PAUSED` | Defer (throw error to retry later) |
| `SUMMARIZING` | Skip (run already transitioning) |
| `COMPLETED` | Skip (run already done) |
| `FAILED` | Skip |
| `CANCELLED` | Skip |

## Monitoring

### Queue Status Query

```graphql
query {
  queueStatus {
    isRunning
    isPaused
    pendingJobs
    activeJobs
    completedJobs
    failedJobs
  }
}
```

### Logging

All queue operations use structured logging:

```typescript
const log = createLogger('queue:probe-scenario');

log.info({ jobId, runId, scenarioId, modelId }, 'Processing probe_scenario job');
log.error({ jobId, runId, err }, 'Probe job permanently failed');
```

Log contexts:
- `queue:boss` - PgBoss lifecycle
- `queue:orchestrator` - Start/stop/pause/resume
- `queue:probe-scenario` - Probe job processing
- `queue:analyze-basic` - Analysis job processing
- `queue:summarize-transcript` - Summary job processing
- `services:parallelism` - Provider queue routing

## Source Files

| File | Purpose |
|------|---------|
| `apps/api/src/queue/boss.ts` | PgBoss singleton management |
| `apps/api/src/queue/orchestrator.ts` | Worker lifecycle, pause/resume |
| `apps/api/src/queue/spawn.ts` | Python process spawning |
| `apps/api/src/queue/types.ts` | Job type definitions |
| `apps/api/src/queue/handlers/index.ts` | Handler registration |
| `apps/api/src/queue/handlers/probe-scenario.ts` | Probe job handler |
| `apps/api/src/queue/handlers/analyze-basic.ts` | Analysis handler |
| `apps/api/src/queue/handlers/summarize-transcript.ts` | Summary handler |
| `apps/api/src/services/parallelism/index.ts` | Provider queue routing |

## Comparison to Original Design

The implementation closely follows [preplanning/api-queue-system.md](../preplanning/api-queue-system.md) with these notes:

| Aspect | Original Design | Implementation |
|--------|----------------|----------------|
| Queue technology | PgBoss | PgBoss (as designed) |
| Worker pattern | TypeScript orchestrator + Python | TypeScript orchestrator + Python (as designed) |
| Job types | probe, analyze, summarize | Added `expand_scenarios` for scenario generation |
| Progress tracking | Polling-based | Polling-based (as designed) |
| Provider parallelism | Not specified | Added provider-specific queues with database-driven limits |
| Analysis tiers | Tier 1/2/3 | Tier 1 (basic) implemented; Tier 2/3 deferred |
