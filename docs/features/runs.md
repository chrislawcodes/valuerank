# Runs

Runs are the execution unit in Cloud ValueRank. A run evaluates one or more AI models against the scenarios generated from a definition.

> **Original Design:** See [specs/007-stage-9-run-execution/spec.md](../../specs/007-stage-9-run-execution/spec.md) for the full feature specification.

---

## Overview

A run consists of:

- **Definition** - The scenario definition being evaluated
- **Models** - One or more LLM models to test
- **Scenarios** - Selected scenarios (optionally sampled)
- **Transcripts** - The recorded conversations with each model

When a run is started, Cloud ValueRank queues probe jobs for each model-scenario combination. As jobs complete, transcripts are stored and progress is updated.

---

## Run Lifecycle

Runs follow a state machine with these statuses:

```
┌─────────┐
│ PENDING │──────────────────────────────────────────┐
└────┬────┘                                          │
     │ first job starts                              │
     ▼                                               │
┌─────────┐     pause      ┌────────┐               │
│ RUNNING │───────────────▶│ PAUSED │               │
└────┬────┘◀───────────────└────┬───┘               │
     │       resume              │                   │
     │                           │                   │
     │ all jobs complete         │ cancel            │ cancel
     ▼                           ▼                   ▼
┌────────────┐              ┌───────────┐      ┌───────────┐
│ SUMMARIZING│──────────────│ CANCELLED │      │ CANCELLED │
└─────┬──────┘              └───────────┘      └───────────┘
      │ summaries complete
      ▼                                   ┌────────┐
┌───────────┐                             │ FAILED │
│ COMPLETED │                             └────────┘
└───────────┘                                  ▲
                                               │ all jobs fail
                                               │
```

### Status Definitions

| Status | Description |
|--------|-------------|
| `PENDING` | Run created, jobs queued but not yet started |
| `RUNNING` | Jobs are actively being processed |
| `PAUSED` | Jobs paused - in-progress jobs complete but no new jobs start |
| `SUMMARIZING` | All probe jobs complete, generating transcript summaries |
| `COMPLETED` | All jobs and summaries finished successfully |
| `FAILED` | All jobs failed (no successful transcripts) |
| `CANCELLED` | Run cancelled by user (partial results preserved) |

---

## Creating a Run

### Configuration Options

```typescript
type StartRunInput = {
  definitionId: string;        // Required: Definition to evaluate
  models: string[];            // Required: Model IDs to test (at least one)
  samplePercentage?: number;   // Optional: 1-100, default 100 (all scenarios)
  sampleSeed?: number;         // Optional: Seed for reproducible sampling
  priority?: 'LOW' | 'NORMAL' | 'HIGH';  // Optional: Job priority
  experimentId?: string;       // Optional: Link to experiment
};
```

### Scenario Sampling

When `samplePercentage` is less than 100, scenarios are randomly sampled:

- A Fisher-Yates shuffle with the provided seed ensures reproducibility
- Minimum 1 scenario is always selected
- Selected scenarios are recorded in `RunScenarioSelection` table

### Job Queuing

For each model-scenario pair, a `probe_scenario` job is queued:

1. Jobs are routed to provider-specific queues (e.g., `probe_scenario_openai`)
2. Queue routing enables per-provider parallelism limits
3. Job data includes:
   - `runId` - Parent run reference
   - `scenarioId` - Scenario to present
   - `modelId` - Model to probe
   - `config` - Temperature, max turns

---

## GraphQL Operations

### Queries

```graphql
# Get a single run
query GetRun($id: ID!) {
  run(id: $id) {
    id
    status
    definition {
      id
      name
    }
    config
    progress {
      total
      completed
      failed
    }
    transcripts {
      id
      modelId
      decisionCode
      decisionText
    }
    createdAt
    startedAt
    completedAt
  }
}

# List runs with filtering
query ListRuns(
  $definitionId: String
  $status: String
  $limit: Int
  $offset: Int
) {
  runs(
    definitionId: $definitionId
    status: $status
    limit: $limit
    offset: $offset
  ) {
    id
    status
    definition { id name }
    progress { total completed failed }
    createdAt
  }
}
```

### Mutations

```graphql
# Start a new run
mutation StartRun($input: StartRunInput!) {
  startRun(input: $input) {
    run {
      id
      status
      progress { total }
    }
    jobCount
  }
}

# Pause a running run
mutation PauseRun($runId: ID!) {
  pauseRun(runId: $runId) {
    id
    status
  }
}

# Resume a paused run
mutation ResumeRun($runId: ID!) {
  resumeRun(runId: $runId) {
    id
    status
  }
}

# Cancel a run
mutation CancelRun($runId: ID!) {
  cancelRun(runId: $runId) {
    id
    status
  }
}

# Soft delete a run
mutation DeleteRun($runId: ID!) {
  deleteRun(runId: $runId)
}
```

---

## Run Controls

### Pause

Pausing a run:
- Changes status to `PAUSED`
- Jobs currently executing will complete
- No new jobs are dispatched while paused
- Valid from: `PENDING`, `RUNNING`

### Resume

Resuming a paused run:
- Changes status to `RUNNING`
- Job processing continues from where it left off
- Valid from: `PAUSED`

### Cancel

Cancelling a run:
- Changes status to `CANCELLED`
- Sets `completedAt` timestamp
- Pending jobs in PgBoss are marked cancelled
- Completed transcripts are preserved
- Valid from: `PENDING`, `RUNNING`, `PAUSED`

---

## Progress Tracking

Runs maintain real-time progress in a JSONB field:

```typescript
type RunProgress = {
  total: number;      // Total jobs queued (models × scenarios)
  completed: number;  // Successfully completed jobs
  failed: number;     // Failed jobs
};
```

### Progress Updates

Progress is updated:
1. **On job start** - Status changes from `PENDING` to `RUNNING`
2. **On job completion** - `completed` increments
3. **On job failure** - `failed` increments
4. **On run completion** - Status changes to `COMPLETED` or `FAILED`

### Polling

The frontend polls for progress updates every 5 seconds while a run is active. Polling stops when the run reaches a terminal state.

---

## Transcripts

Each completed probe job creates a transcript record:

```typescript
type Transcript = {
  id: string;
  runId: string;
  scenarioId: string;

  // Model information
  modelId: string;              // e.g., "gpt-4"
  modelVersion?: string;        // e.g., "gpt-4-0613"

  // Definition snapshot (exact state at run time)
  definitionSnapshot: object;

  // Conversation content
  content: {
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;
  };

  // Metrics
  turnCount: number;
  tokenCount: number;
  durationMs: number;

  // Summary (populated after summarization phase)
  decisionCode?: string;        // 1-5 rating or "other"
  decisionText?: string;        // LLM-generated summary
  summarizedAt?: Date;

  // Timestamps
  createdAt: Date;
  lastAccessedAt?: Date;
};
```

### Definition Snapshot

Each transcript stores a snapshot of the definition content at the time of the run. This ensures:
- Results are reproducible even if the definition is later edited
- Historical analysis reflects the actual prompts used

---

## Summarization Phase

After all probe jobs complete, runs enter the `SUMMARIZING` phase:

1. Status changes to `SUMMARIZING`
2. For each transcript, the summarize worker:
   - Analyzes the conversation
   - Extracts a decision code (1-5 scale)
   - Generates a decision summary text
3. Summaries are stored on the transcript record
4. Status changes to `COMPLETED`

---

## Run Configuration

The run stores its configuration in a JSONB field:

```typescript
type RunConfig = {
  models: string[];              // Selected model IDs
  samplePercentage: number;      // Scenario sample rate
  sampleSeed?: number;           // Reproducibility seed
  priority: string;              // Job priority level
  definitionSnapshot: object;    // Copy of definition content
};
```

This allows:
- Audit trail of exactly what was run
- Reproducible runs with same configuration
- Re-running with different models

---

## Access Tracking

Runs and transcripts track when they were last accessed:

- `lastAccessedAt` is updated when viewing a run or transcript
- Used for potential future cleanup/archival policies
- Non-blocking (doesn't slow down queries)

---

## Frontend Components

The web UI provides comprehensive run management:

| Component | Purpose |
|-----------|---------|
| `RunForm` | Model selection and run configuration |
| `RunProgress` | Real-time progress display with polling |
| `RunResults` | Results table with per-model scores |
| `RunControls` | Pause/Resume/Cancel buttons |
| `TranscriptViewer` | Full conversation display |
| `RunDashboard` | List all runs with filtering |

### Key Pages

- **Runs Dashboard** (`/runs`) - List all runs, filter by status
- **Run Detail** (`/runs/:id`) - Progress, results, transcripts

---

## Database Schema

```prisma
model Run {
  id             String     @id @default(cuid())
  definitionId   String
  experimentId   String?
  status         RunStatus  @default(PENDING)
  config         Json       @db.JsonB
  progress       Json?      @db.JsonB
  startedAt      DateTime?
  completedAt    DateTime?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  lastAccessedAt DateTime?
  deletedAt      DateTime?

  definition    Definition          @relation(...)
  experiment    Experiment?         @relation(...)
  transcripts   Transcript[]
  analysisResults AnalysisResult[]
  scenarioSelections RunScenarioSelection[]
}

enum RunStatus {
  PENDING
  RUNNING
  PAUSED
  SUMMARIZING
  COMPLETED
  FAILED
  CANCELLED
}

model Transcript {
  id                 String    @id @default(cuid())
  runId              String
  scenarioId         String?
  modelId            String
  modelVersion       String?
  definitionSnapshot Json?     @db.JsonB
  content            Json      @db.JsonB
  turnCount          Int
  tokenCount         Int
  durationMs         Int
  decisionCode       String?
  decisionText       String?
  summarizedAt       DateTime?
  createdAt          DateTime  @default(now())
  lastAccessedAt     DateTime?
  contentExpiresAt   DateTime?

  run      Run       @relation(...)
  scenario Scenario? @relation(...)
}

model RunScenarioSelection {
  id         String   @id @default(cuid())
  runId      String
  scenarioId String
  createdAt  DateTime @default(now())

  run      Run      @relation(...)
  scenario Scenario @relation(...)

  @@unique([runId, scenarioId])
}
```

---

## Key Source Files

- **Start run service:** `apps/api/src/services/run/start.ts`
- **Run control service:** `apps/api/src/services/run/control.ts`
- **Run progress service:** `apps/api/src/services/run/progress.ts`
- **GraphQL mutations:** `apps/api/src/graphql/mutations/run.ts`
- **GraphQL queries:** `apps/api/src/graphql/queries/run.ts`
- **Probe worker:** `workers/probe.py`
- **Summarize worker:** `workers/summarize.py`

---

## Best Practices

1. **Sample during development** - Use 10-25% sampling to iterate quickly
2. **Use seeds for reproducibility** - Same seed gives same scenarios
3. **Monitor progress** - Watch for early failures
4. **Pause expensive runs** - Use pause to manage API costs
5. **Review transcripts** - Check conversation quality before analyzing
6. **Use experiments** - Group related runs for comparison
