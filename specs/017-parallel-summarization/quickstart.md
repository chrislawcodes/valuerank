# Quickstart: Parallel Summarization

Manual testing guide for the Parallel Summarization feature.

## Prerequisites

- [ ] Local development environment running (`npm run dev` in `cloud/`)
- [ ] PostgreSQL running on port 5433 (`docker-compose up -d postgres`)
- [ ] Test database seeded (`npm run db:seed`)
- [ ] At least one definition with scenarios available
- [ ] Valid LLM API keys configured (for actual summarization)

---

## Testing User Story 1: Configure Summarization Parallelism

**Goal**: Verify administrators can configure max parallel summarizations

### Via MCP

1. Use the `list_system_settings` tool to see current settings
2. Use the `set_summarization_parallelism` tool with `max_parallel: 4`
3. Use `list_system_settings` again to verify the change

**Expected**:
- Setting `infra_max_parallel_summarizations` appears with value 4
- No errors returned

### Verification

```bash
# Check database directly
PGPASSWORD=valuerank psql -h localhost -p 5433 -U valuerank -d valuerank -c \
  "SELECT * FROM system_settings WHERE key = 'infra_max_parallel_summarizations';"
```

---

## Testing User Story 2: Parallel Summarization Execution

**Goal**: Verify summarization runs in parallel with configured limit

### Steps

1. Set `max_parallel_summarizations` to 4 via MCP
2. Start a run with a definition that produces 20+ transcripts
3. Wait for probing to complete
4. Observe summarization starting

**Verification**:

```bash
# Check active summarization jobs
PGPASSWORD=valuerank psql -h localhost -p 5433 -U valuerank -d valuerank -c \
  "SELECT state, COUNT(*) FROM pgboss.job WHERE name = 'summarize_transcript' GROUP BY state;"
```

**Expected**:
- At most 4 jobs in 'active' state at any time
- Jobs complete successfully

---

## Testing User Story 3: Summarization Job Queueing

**Goal**: Verify individual jobs per transcript with proper retry behavior

### Steps

1. Start a run that produces 10 transcripts
2. Query PgBoss to see individual jobs queued

**Verification**:

```bash
# Check individual jobs
PGPASSWORD=valuerank psql -h localhost -p 5433 -U valuerank -d valuerank -c \
  "SELECT id, data->>'transcriptId' as transcript_id, state
   FROM pgboss.job
   WHERE name = 'summarize_transcript'
   AND data->>'runId' = '<RUN_ID>';"
```

**Expected**:
- 10 separate jobs, one per transcript
- Each job has unique transcriptId

---

## Testing User Story 4: Cancel Summarization

**Goal**: Verify pending jobs can be cancelled while preserving completed summaries

### Steps

1. Start a run with 50+ transcripts
2. Wait for probing to complete and summarization to begin
3. After some summaries complete, call `cancelSummarization(runId)` via GraphQL:

```graphql
mutation {
  cancelSummarization(runId: "<RUN_ID>") {
    run { id status summarizeProgress { total completed failed } }
    cancelledCount
  }
}
```

**Expected**:
- `cancelledCount` > 0 (pending jobs cancelled)
- Completed summaries are preserved
- In-flight jobs complete (not aborted)

### Verification

```bash
# Check transcripts
PGPASSWORD=valuerank psql -h localhost -p 5433 -U valuerank -d valuerank -c \
  "SELECT COUNT(*) as summarized FROM transcripts WHERE run_id = '<RUN_ID>' AND summarized_at IS NOT NULL;"
```

---

## Testing User Story 5: Restart Summarization

**Goal**: Verify failed/missing summaries can be restarted without re-running probing

### Default Mode (Failed Only)

1. Complete a run where some summaries failed (decisionCode = 'error')
2. Call `restartSummarization(runId)` via GraphQL:

```graphql
mutation {
  restartSummarization(runId: "<RUN_ID>") {
    run { id status summarizeProgress { total completed failed } }
    queuedCount
  }
}
```

**Expected**:
- Only failed/unsummarized transcripts get new jobs
- Run status changes to SUMMARIZING
- `queuedCount` matches number of failed transcripts

### Force Mode (Re-summarize All)

1. Complete a run successfully (all transcripts summarized)
2. Call `restartSummarization(runId, force: true)`:

```graphql
mutation {
  restartSummarization(runId: "<RUN_ID>", force: true) {
    run { id status }
    queuedCount
  }
}
```

**Expected**:
- All transcripts get new summarization jobs
- `queuedCount` equals total transcript count
- Previous summaries will be overwritten

---

## Testing User Story 6: MCP Tools

**Goal**: Verify MCP tools work correctly

### set_summarization_parallelism

```json
{
  "tool": "set_summarization_parallelism",
  "params": { "max_parallel": 12 }
}
```

**Expected**: Success response with new value

### cancel_summarization

```json
{
  "tool": "cancel_summarization",
  "params": { "run_id": "<RUN_ID>" }
}
```

**Expected**: Success response with cancelled count

### restart_summarization

```json
{
  "tool": "restart_summarization",
  "params": { "run_id": "<RUN_ID>", "force": false }
}
```

**Expected**: Success response with queued count

---

## Testing User Story 7: UI Buttons

**Goal**: Verify cancel/restart buttons appear and function correctly

### Cancel Button

1. Navigate to a run detail page where summarization is in progress
2. Verify "Cancel Summarization" button is visible
3. Click button, confirm in dialog
4. Verify toast shows cancelled count
5. Verify summarization stops (pending jobs cancelled)

### Restart Button

1. Navigate to a run with failed summaries
2. Verify "Restart Summarization" button is visible
3. Click button
4. Verify toast shows queued count
5. Verify summarization resumes

### Re-summarize All Button

1. Navigate to a fully completed run
2. Verify "Re-summarize All" button is visible
3. Click button
4. Verify all transcripts are re-queued

---

## Testing User Story 8: Graceful Setting Changes

**Goal**: Verify parallelism changes apply gracefully

### Steps

1. Start a run with many transcripts
2. While summarization is running (8 active jobs), reduce to 4
3. Observe behavior

**Expected**:
- 8 in-flight jobs complete normally
- New jobs start at rate of 4
- No errors or lost jobs

---

## Troubleshooting

### Issue: Setting not persisting

**Fix**: Check database connection and SystemSetting table:
```sql
SELECT * FROM system_settings WHERE key LIKE 'infra%';
```

### Issue: Parallelism not respecting limit

**Fix**: Ensure handler was re-registered after setting change:
- Check API logs for "Re-registering summarize handler"
- Restart API if needed

### Issue: Cancel not working

**Fix**: Check PgBoss job states:
```sql
SELECT state, COUNT(*) FROM pgboss.job
WHERE name = 'summarize_transcript'
GROUP BY state;
```

### Issue: Restart on running run

**Expected Error**: "Cannot restart summarization for run in RUNNING state"
**Fix**: Wait for probing to complete or cancel the run first

### Issue: UI buttons not appearing

**Fix**:
- Check run status and summarizeProgress in GraphQL response
- Verify polling is updating the run state
- Check browser console for errors
