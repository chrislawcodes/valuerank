# Quickstart: MCP Operations Tools

## Prerequisites

- [ ] Development environment running (`npm run dev` in cloud/)
- [ ] PostgreSQL running on port 5433 (`docker-compose up -d postgres`)
- [ ] Test database set up (`npm run db:test:setup`)
- [ ] MCP server accessible (via Claude Code or test client)

## Testing User Story 1: Recover Stuck Run via MCP

**Goal**: Verify that `recover_run` re-queues missing jobs for a stuck run

**Setup**:
1. Create a test run that appears stuck:
```sql
-- In test database
INSERT INTO runs (id, status, progress, definition_id, config, created_at, updated_at)
VALUES (
  'test-stuck-run',
  'SUMMARIZING',
  '{"total": 100, "completed": 96, "failed": 0}',
  'some-definition-id',
  '{"models": ["gpt-4"]}',
  NOW() - INTERVAL '1 hour',
  NOW() - INTERVAL '30 minutes'
);

-- Create some transcripts without summarization
INSERT INTO transcripts (id, run_id, model_id, scenario_id, content, turn_count, token_count, duration_ms)
VALUES
  ('t1', 'test-stuck-run', 'gpt-4', 's1', '{}', 1, 100, 1000),
  ('t2', 'test-stuck-run', 'gpt-4', 's2', '{}', 1, 100, 1000),
  ('t3', 'test-stuck-run', 'gpt-4', 's3', '{}', 1, 100, 1000),
  ('t4', 'test-stuck-run', 'gpt-4', 's4', '{}', 1, 100, 1000);
```

**Steps**:
1. Call `recover_run` MCP tool with `run_id: "test-stuck-run"`
2. Observe response

**Expected**:
- Response shows `action: "recovered"`
- `requeued_count: 4` (the 4 unsummarized transcripts)
- Run status updated or jobs queued

**Verification**:
```sql
-- Check if jobs were queued
SELECT name, state, COUNT(*)
FROM pgboss.job
WHERE data->>'runId' = 'test-stuck-run'
GROUP BY name, state;
```

---

## Testing User Story 2: Trigger System-Wide Recovery

**Goal**: Verify that `trigger_recovery` finds and recovers all stuck runs

**Setup**:
1. Create multiple stuck runs (similar to US1 setup)
2. Ensure no active jobs in queue for these runs

**Steps**:
1. Call `trigger_recovery` MCP tool (no parameters)
2. Observe response

**Expected**:
- Response shows `detected_count` and `recovered_count`
- List of `recovered_runs` with IDs and requeued counts
- Any errors reported in `errors` array

**Verification**:
```sql
-- Check all runs recovered
SELECT id, status, progress
FROM runs
WHERE id IN ('test-stuck-run-1', 'test-stuck-run-2');
```

---

## Testing User Story 3: Query Job Queue Status

**Goal**: Verify that `get_job_queue_status` returns accurate job counts

**Setup**:
1. Create a run with jobs in various states:
```sql
-- Create jobs in different states
INSERT INTO pgboss.job (id, name, state, data, createdon)
VALUES
  ('j1', 'probe_scenario', 'created', '{"runId": "test-run"}', NOW()),
  ('j2', 'probe_scenario', 'active', '{"runId": "test-run"}', NOW()),
  ('j3', 'summarize_transcript', 'completed', '{"runId": "test-run"}', NOW()),
  ('j4', 'summarize_transcript', 'failed', '{"runId": "test-run", "error": "timeout"}', NOW());
```

**Steps**:
1. Call `get_job_queue_status` with `run_id: "test-run"`
2. Observe response

**Expected**:
- `by_job_type.probe_scenario` shows `pending: 1, running: 1`
- `by_job_type.summarize_transcript` shows `completed: 1, failed: 1`
- Totals match individual counts

**Steps with failures**:
1. Call with `include_recent_failures: true`
2. Observe `recent_failures` array

**Expected**:
- Failed job details include error message
- Limited to most recent N failures

---

## Testing User Story 4: Query Unsummarized Transcripts

**Goal**: Verify that `get_unsummarized_transcripts` identifies stuck transcripts

**Setup**:
1. Use the test run from US1 with 4 unsummarized transcripts

**Steps**:
1. Call `get_unsummarized_transcripts` with `run_id: "test-stuck-run"`
2. Observe response

**Expected**:
- `total_count: 4`
- `transcripts` array contains 4 items with id, model_id, scenario_id
- Each transcript has `summarized_at: null`

**Steps with failed transcripts**:
1. Update one transcript: `UPDATE transcripts SET decision_code = 'error' WHERE id = 't1'`
2. Call with `include_failed: true`
3. Observe `decision_code` in response

---

## Testing User Story 5: Per-Model Progress Breakdown

**Goal**: Verify that `summarizeProgress.byModel` returns accurate per-model counts

**Setup**:
1. Create a run with multiple models and varying progress:
```sql
-- Run with 2 models
INSERT INTO transcripts (id, run_id, model_id, scenario_id, summarized_at, content, turn_count, token_count, duration_ms)
VALUES
  ('tm1', 'test-multi-model', 'gpt-4', 's1', NOW(), '{}', 1, 100, 1000),
  ('tm2', 'test-multi-model', 'gpt-4', 's2', NOW(), '{}', 1, 100, 1000),
  ('tm3', 'test-multi-model', 'gpt-4', 's3', NULL, '{}', 1, 100, 1000),  -- not summarized
  ('tm4', 'test-multi-model', 'claude-3', 's1', NOW(), '{}', 1, 100, 1000),
  ('tm5', 'test-multi-model', 'claude-3', 's2', NULL, '{}', 1, 100, 1000); -- not summarized
```

**Steps**:
1. Query via GraphQL:
```graphql
query {
  run(id: "test-multi-model") {
    summarizeProgress {
      total
      completed
      byModel {
        modelId
        completed
        failed
      }
    }
  }
}
```

**Expected**:
- `byModel` array has 2 entries (gpt-4, claude-3)
- gpt-4: `completed: 2, failed: 0`
- claude-3: `completed: 1, failed: 0`
- Totals: `completed: 3, total: 5`

---

## Testing User Story 6: Recompute Analysis (P3)

**Goal**: Verify that `recompute_analysis` queues a new analysis job

**Setup**:
1. Have a completed run with existing analysis

**Steps**:
1. Call `recompute_analysis` with `run_id: "completed-run-id"`
2. Observe response

**Expected**:
- Response includes `job_id` for tracking
- Previous analysis marked SUPERSEDED
- New `analyze_basic` job in queue

---

## Troubleshooting

**Issue**: `recover_run` returns "no recovery needed"
**Cause**: Run has active jobs or progress is already complete
**Fix**: Check job queue status first with `get_job_queue_status`

**Issue**: `get_job_queue_status` returns empty results
**Cause**: PgBoss tables may not exist in test environment
**Fix**: Ensure PgBoss is initialized by starting the API server

**Issue**: `byModel` returns null
**Cause**: Feature not yet implemented
**Fix**: Wait for Phase 3 implementation

**Issue**: Tool not found in MCP
**Cause**: Tool not registered in index.ts
**Fix**: Ensure new tool is imported and exported in `mcp/tools/index.ts`
