# Quickstart: Stage 5 - Queue System & Job Infrastructure

## Prerequisites

- [ ] Docker running (`docker-compose up -d` for PostgreSQL)
- [ ] API server running (`npm run dev` in `apps/api`)
- [ ] Valid JWT token (from Stage 4 auth)
- [ ] At least one definition with scenarios in database
- [ ] GraphQL Playground accessible at `http://localhost:3030/graphql`

### Setup Test Data

If you don't have a definition with scenarios, create one:

```graphql
mutation CreateTestDefinition {
  createDefinition(input: {
    name: "Queue Test Definition"
    content: {
      schemaVersion: 1
      preamble: "Test scenario for queue"
      template: "Should {action} the {object}?"
      dimensions: [
        { name: "action", values: ["help", "ignore", "report"] }
        { name: "object", values: ["person", "animal"] }
      ]
    }
  }) {
    id
    name
  }
}
```

---

## Testing User Story 1: Start a Run via GraphQL

**Goal**: Verify that starting a run creates the correct number of jobs in the queue.

### Steps

1. **Get your definition ID** (with scenarios):

```graphql
query GetDefinitions {
  definitions {
    id
    name
    scenarios {
      id
      name
    }
  }
}
```

2. **Start a run**:

```graphql
mutation StartRun {
  startRun(input: {
    definitionId: "YOUR_DEFINITION_ID"
    models: ["test-model-1", "test-model-2"]
  }) {
    id
    status
    progress {
      total
      completed
      failed
      percentComplete
    }
  }
}
```

3. **Check queue status**:

```graphql
query CheckQueue {
  queueStatus {
    isPaused
    totalPending
    totalActive
    jobs {
      type
      pending
      active
      completed
      failed
    }
  }
}
```

### Expected Results

- Run created with status `PENDING` or `RUNNING`
- `progress.total` = (number of scenarios) × (number of models)
- `progress.completed` = 0, `progress.failed` = 0
- `queueStatus.totalPending` shows jobs waiting
- `queueStatus.jobs` shows `probe:scenario` jobs

### Verification Query

```graphql
query VerifyRun($runId: ID!) {
  run(id: $runId) {
    id
    status
    progress {
      total
      completed
      failed
      percentComplete
    }
  }
}
```

---

## Testing User Story 2: View Run Progress via Polling

**Goal**: Verify that progress updates are visible when jobs complete.

### Steps

1. **Start a run** (from User Story 1)

2. **Poll for progress** (every 5 seconds):

```graphql
query PollProgress($runId: ID!) {
  run(id: $runId) {
    id
    status
    progress {
      total
      completed
      failed
      percentComplete
    }
    recentTasks(limit: 5) {
      scenarioId
      modelId
      status
      error
      completedAt
    }
  }
}
```

3. **Watch for status transitions**:
   - `PENDING` → `RUNNING` (first job starts)
   - `RUNNING` → `COMPLETED` (all jobs finish)

### Expected Results

- `progress.completed` increases as jobs finish
- `progress.percentComplete` reflects completion ratio
- `recentTasks` shows last completed/failed tasks
- Status transitions correctly

### Manual Job Completion (For Testing)

Since Stage 5 uses stub handlers, jobs will complete automatically with mock results. To verify progress tracking:

```sql
-- Check PgBoss job table (connect to PostgreSQL)
SELECT name, state, createdon, completedon
FROM pgboss.job
WHERE data->>'runId' = 'YOUR_RUN_ID'
ORDER BY createdon DESC
LIMIT 10;
```

---

## Testing User Story 3: Pause and Resume a Run

**Goal**: Verify that pausing stops new job dispatch and resuming continues.

### Steps

1. **Start a run with many jobs**:

```graphql
mutation StartLargeRun {
  startRun(input: {
    definitionId: "YOUR_DEFINITION_ID"
    models: ["model-1", "model-2", "model-3"]
    samplePercentage: 100
  }) {
    id
    status
    progress { total }
  }
}
```

2. **Pause the run quickly** (before all jobs complete):

```graphql
mutation PauseRun($runId: ID!) {
  pauseRun(id: $runId) {
    id
    status
    progress {
      total
      completed
      failed
    }
  }
}
```

3. **Verify paused state**:

```graphql
query CheckPaused($runId: ID!) {
  run(id: $runId) {
    id
    status
    progress {
      completed
      failed
    }
  }
}
```

4. **Resume the run**:

```graphql
mutation ResumeRun($runId: ID!) {
  resumeRun(id: $runId) {
    id
    status
  }
}
```

5. **Poll until completion**

### Expected Results

- After pause: `status` = `PAUSED`
- While paused: `progress.completed` may increase (in-flight jobs finish)
- No new jobs dispatched while paused
- After resume: `status` = `RUNNING`
- Eventually: `status` = `COMPLETED`

### Error Cases

```graphql
# Trying to pause a completed run should fail
mutation PauseCompleted($runId: ID!) {
  pauseRun(id: $runId) {
    id
    status
  }
}
# Expected: ValidationError - "Cannot pause run in COMPLETED state"
```

---

## Testing User Story 4: Cancel a Run

**Goal**: Verify that cancelling removes pending jobs but preserves results.

### Steps

1. **Start a run**

2. **Let some jobs complete** (wait a few seconds)

3. **Cancel the run**:

```graphql
mutation CancelRun($runId: ID!) {
  cancelRun(id: $runId) {
    id
    status
    progress {
      total
      completed
      failed
    }
  }
}
```

4. **Verify cancelled state**:

```graphql
query CheckCancelled($runId: ID!) {
  run(id: $runId) {
    id
    status
    progress {
      total
      completed
      failed
    }
    transcripts {
      id
      modelId
    }
  }
}
```

### Expected Results

- `status` = `CANCELLED`
- `progress.completed` > 0 (jobs that finished before cancel)
- `transcripts` contains results from completed jobs
- Queue shows no pending jobs for this run

### Verification

```sql
-- Verify pending jobs removed from PgBoss
SELECT COUNT(*)
FROM pgboss.job
WHERE state = 'created'
AND data->>'runId' = 'YOUR_RUN_ID';
-- Expected: 0
```

---

## Testing User Story 5: View Queue Status

**Goal**: Verify queue status shows accurate job counts.

### Steps

1. **Start multiple runs** to populate queue

2. **Query queue status**:

```graphql
query QueueStatus {
  queueStatus {
    isPaused
    totalPending
    totalActive
    jobs {
      type
      pending
      active
      completed
      failed
    }
  }
}
```

### Expected Results

- `isPaused` = false (unless you paused it)
- `totalPending` = sum of all job type pending counts
- `jobs` array shows breakdown by type (`probe:scenario`, etc.)
- Counts reflect actual job states in queue

---

## Testing User Story 6: Pause and Resume Global Queue

**Goal**: Verify global queue pause affects all job processing.

### Steps

1. **Pause the queue**:

```graphql
mutation PauseGlobalQueue {
  pauseQueue {
    isPaused
    totalPending
    totalActive
  }
}
```

2. **Start a new run** (while queue paused):

```graphql
mutation StartWhilePaused {
  startRun(input: {
    definitionId: "YOUR_DEFINITION_ID"
    models: ["test-model"]
  }) {
    id
    status
    progress { total }
  }
}
```

3. **Verify jobs queued but not processing**:

```graphql
query CheckQueuePaused {
  queueStatus {
    isPaused
    totalPending
    totalActive
  }
}
```

4. **Resume the queue**:

```graphql
mutation ResumeGlobalQueue {
  resumeQueue {
    isPaused
    totalPending
    totalActive
  }
}
```

5. **Verify processing resumes**

### Expected Results

- After pause: `isPaused` = true, `totalActive` = 0 (eventually)
- Jobs still queued (`totalPending` > 0)
- After resume: `isPaused` = false, processing continues

---

## Testing User Story 7: Job Retry on Failure

**Goal**: Verify failed jobs retry with exponential backoff.

### Triggering a Failure

The stub handler can be configured to fail intentionally for testing:

```graphql
# Start run that will have some failures
mutation StartWithFailures {
  startRun(input: {
    definitionId: "YOUR_DEFINITION_ID"
    models: ["fail-test-model"]  # Special model that triggers failures
  }) {
    id
    status
  }
}
```

### Verification

```sql
-- Check retry attempts in PgBoss
SELECT id, name, state, retrycount, createdon, startafter
FROM pgboss.job
WHERE data->>'runId' = 'YOUR_RUN_ID'
AND retrycount > 0;
```

### Expected Results

- Failed jobs retry up to 3 times
- `retrycount` increments with each attempt
- `startafter` shows exponential backoff
- After max retries: job marked as failed

---

## Troubleshooting

### Issue: "Cannot connect to database"
**Fix**: Ensure PostgreSQL is running: `docker-compose up -d`

### Issue: "PgBoss not initialized"
**Fix**: Check API startup logs for PgBoss initialization errors

### Issue: "Jobs not processing"
**Fix**:
1. Check if queue is paused: `queueStatus { isPaused }`
2. Check worker logs for errors
3. Verify PgBoss maintenance is running

### Issue: "Progress not updating"
**Fix**:
1. Check if jobs are completing in PgBoss
2. Verify atomic progress update in logs
3. Check for database transaction errors

### Issue: "Run stuck in PENDING"
**Fix**:
1. Verify worker is running and subscribed
2. Check for job validation errors in logs
3. Ensure definition has scenarios

---

## Performance Testing

### Large Run Test

```graphql
mutation StartLargeRun {
  startRun(input: {
    definitionId: "DEFINITION_WITH_MANY_SCENARIOS"
    models: ["model-1", "model-2", "model-3", "model-4", "model-5"]
    samplePercentage: 100
  }) {
    id
    progress { total }
  }
}
```

**Expected**: Job creation completes within 5 seconds for 1000+ jobs

### Progress Query Performance

Poll progress 10 times in quick succession:
- **Expected**: Each query responds within 100ms
