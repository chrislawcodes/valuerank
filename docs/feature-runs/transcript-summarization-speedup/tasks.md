# Tasks: Transcript Summarization Speedup

Each slice is independently reviewable. Keep each one under roughly 300 lines of diff.

## Slice 1 [CHECKPOINT] - Python batch protocol

**Intent:** internal

### Scope

- add batch-input support to `cloud/workers/summarize.py`
- keep the existing single-transcript payload working
- emit per-transcript batch results without changing summary semantics
- add Python tests for batch mode and backward compatibility

### Verification

- `python3 -m py_compile cloud/workers/summarize.py`
- `python3 -m pytest cloud/workers/tests/test_summarize.py`

### Estimated Diff

140-200 lines

## Slice 2 [CHECKPOINT] - API batch spawn

**Intent:** internal

### Scope

- refactor `cloud/apps/api/src/queue/handlers/summarize-transcript.ts` so it collects
  uncached transcripts first and sends them through one batch Python invocation
- keep the existing cache short-circuit path and force re-summarize behavior intact
- accept both single and batch worker responses for compatibility
- add handler tests proving multiple uncached transcripts use one spawn and cached
  transcripts still skip the worker

### Verification

- `cd cloud/apps/api && npm run test -- tests/queue/handlers/summarize-transcript.test.ts`
- `cd cloud/apps/api && npm run build`

### Estimated Diff

180-260 lines

