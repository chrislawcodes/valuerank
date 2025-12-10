# Quickstart: Stage 9 - Run Execution & Basic Export

## Prerequisites

- [ ] Docker running with PostgreSQL (`docker-compose up -d`)
- [ ] Database seeded with test data (`npm run db:seed`)
- [ ] API running (`npm run dev` from cloud/)
- [ ] Web running (Vite on port 3030)
- [ ] At least one definition exists (from Stage 8)
- [ ] User logged in with valid session

---

## Testing User Story 1: Create and Start a Run

**Goal**: Verify users can create an evaluation run by selecting a definition and models

### Steps

1. Navigate to Definitions page
2. Click on an existing definition to open detail view
3. Click "Start Run" button
4. Verify run configuration form/modal appears
5. Select one or more models from the available models list
6. (Optional) Expand a model and select a specific version
7. Click "Start Run" to submit
8. Verify redirect to run detail page
9. Verify run shows "Pending" or "Running" status

### Expected Results

- [ ] Run configuration shows available models
- [ ] Can select multiple models
- [ ] Can optionally select model versions
- [ ] Run is created after submission
- [ ] Redirected to run detail page
- [ ] Run status is "Pending" or "Running"

### Verification

```graphql
# Check run was created
query {
  runs(limit: 1) {
    id
    status
    config
    progress
    definition { name }
  }
}
```

---

## Testing User Story 2: Monitor Run Progress

**Goal**: Verify real-time progress updates appear during run execution

### Steps

1. Have an active run (from Story 1) or start a new one
2. Observe the run detail page
3. Wait 5+ seconds
4. Verify progress counter/bar updates
5. Verify per-model progress breakdown appears
6. Wait for run to complete
7. Verify status changes to "Completed"

### Expected Results

- [ ] Progress bar shows completed/total tasks
- [ ] Progress updates automatically every ~5 seconds
- [ ] Failed tasks (if any) shown distinctly
- [ ] Per-model progress visible
- [ ] Status changes to "Completed" when done
- [ ] Polling stops after completion

### Verification

```graphql
# Poll run progress
query {
  run(id: "<run-id>") {
    status
    runProgress {
      total
      completed
      failed
      percentComplete
    }
  }
}
```

---

## Testing User Story 3: View Run Results

**Goal**: Verify completed run results are displayed correctly

### Steps

1. Navigate to a completed run (or wait for one to complete)
2. View the results summary section
3. Verify per-model scores/counts are displayed
4. Click to expand a model row (if available)
5. Click on a transcript to view detail
6. Verify model version is shown

### Expected Results

- [ ] Results summary shows total transcripts
- [ ] Per-model breakdown visible
- [ ] Can view individual transcript content
- [ ] Model version displayed
- [ ] Definition name shown

### Verification

```graphql
# Get run results
query {
  run(id: "<run-id>") {
    status
    transcriptCount
    transcripts {
      scenarioId
      modelId
      modelVersion
      turnCount
    }
  }
}
```

---

## Testing User Story 4: Export Results as CSV

**Goal**: Verify CSV export works correctly

### Steps

1. Navigate to a completed run
2. Find "Export CSV" button
3. Click to download
4. Open downloaded file
5. Verify columns and data

### Expected Results

- [ ] CSV file downloads with proper filename
- [ ] File opens in Excel/spreadsheet correctly (UTF-8 with BOM)
- [ ] Contains columns: scenario_id, model_id, model_version, decision, timestamp
- [ ] All transcripts included
- [ ] Numbers and dates formatted correctly

### Verification

```bash
# Direct API test
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/export/runs/<run-id>/csv \
  -o test_export.csv

# Check file
head test_export.csv
wc -l test_export.csv
```

---

## Testing User Story 5: Browse Run Dashboard

**Goal**: Verify run dashboard shows all runs

### Steps

1. Navigate to Runs page
2. Verify list of runs appears
3. Filter by status (Running, Completed, etc.)
4. Click on a run to view detail

### Expected Results

- [ ] Runs listed newest first
- [ ] Each run shows: definition name, status, progress, date
- [ ] Status filter works
- [ ] Click navigates to run detail
- [ ] Empty state shown if no runs

### Verification

```graphql
query {
  runs(limit: 10) {
    id
    status
    createdAt
    definition { name }
    runProgress {
      completed
      total
    }
  }
}
```

---

## Testing User Story 6: Pause and Resume Runs

**Goal**: Verify pause/resume functionality

### Steps

1. Start a new run with many scenarios
2. While running, click "Pause"
3. Verify status changes to "Paused"
4. Wait to confirm no new jobs process
5. Click "Resume"
6. Verify status changes to "Running"
7. Verify jobs continue processing

### Expected Results

- [ ] Pause button visible when running
- [ ] Status changes to "Paused" after pause
- [ ] No new jobs start while paused
- [ ] Resume button visible when paused
- [ ] Status changes to "Running" after resume
- [ ] Progress continues from where it stopped

### Verification

```graphql
# Pause
mutation { pauseRun(runId: "<id>") { status } }

# Resume
mutation { resumeRun(runId: "<id>") { status } }
```

---

## Testing User Story 7: Cancel Runs

**Goal**: Verify cancel functionality with confirmation

### Steps

1. Start a new run or use a paused run
2. Click "Cancel" button
3. Verify confirmation prompt appears
4. Confirm cancellation
5. Verify status changes to "Cancelled"
6. Verify partial results are preserved

### Expected Results

- [ ] Cancel button visible for active runs
- [ ] Confirmation required before cancel
- [ ] Status changes to "Cancelled"
- [ ] Completed transcripts preserved
- [ ] Cannot pause/resume/cancel again

### Verification

```graphql
# Cancel
mutation { cancelRun(runId: "<id>") { status } }

# Check partial results preserved
query {
  run(id: "<id>") {
    status
    transcriptCount
  }
}
```

---

## Testing User Story 8: Re-run Against Different Model Version

**Goal**: Verify re-run capability (P3, stretch goal)

### Steps

1. Navigate to a completed run
2. Find "Re-run" button
3. Click to open configuration
4. Select a different model version
5. Start the re-run
6. Verify new run references original

### Expected Results

- [ ] Re-run button visible on completed runs
- [ ] Can select different model versions
- [ ] New run created with parent reference
- [ ] Related runs visible on detail page

### Verification

```graphql
query {
  run(id: "<new-run-id>") {
    parentRunId
    config
  }
}
```

---

## Troubleshooting

### Issue: No models appear in selector
**Fix**: Check that API keys are configured in environment variables

### Issue: Progress doesn't update
**Fix**: Check browser network tab for polling requests; verify run status is not terminal

### Issue: CSV export fails
**Fix**: Check JWT token is valid; check API logs for errors

### Issue: Run stays in "Pending" forever
**Fix**: Check that worker is running; check PgBoss queue status

### Issue: Pause doesn't work
**Fix**: In-progress jobs will complete; wait and verify no NEW jobs start

---

## Environment Variables Required

```bash
# In .env file
DATABASE_URL=postgresql://valuerank:valuerank@localhost:5433/valuerank
JWT_SECRET=<32+ character secret>

# LLM Provider keys (for actual probing)
OPENAI_API_KEY=<key>
ANTHROPIC_API_KEY=<key>
GOOGLE_API_KEY=<key>
# etc.
```
