# Tasks
# Tasks: Transcript Summarization Cache

## Slice 1 [CHECKPOINT] Shared parser version source + bypass plumbing

Estimated diff: 180-240 lines

### Scope

- add `SUMMARIZE_PARSER_VERSION` to the API config and summarize worker
- add a `forceSummarize` job flag that can bypass the cache
- make the restart path pass `forceSummarize` when force reruns are requested
- add tests proving both services read the shared parser version and the bypass works

### Work

1. Update `cloud/apps/api/src/config.ts` with `SUMMARIZE_PARSER_VERSION`, defaulting to the
   current parser version value (`job-choice-v2`).
2. Update `cloud/workers/summarize.py` so the emitted `parserVersion` uses the same env var
   with the same default (`job-choice-v2`).
3. Update `cloud/apps/api/src/queue/types.ts` to add an optional `forceSummarize` job flag.
4. Update `cloud/apps/api/src/services/run/summarization.ts` so `restartSummarization(..., true)`
   sets `forceSummarize: true` on queued jobs.
5. Update `cloud/apps/api/tests/config.test.ts`, `cloud/workers/tests/test_summarize.py`, and
   `cloud/apps/api/tests/services/run/summarization.test.ts` with focused assertions for the
   shared parser version, the bypass flag, and the normal-job path that leaves
   `forceSummarize` unset.

### Verification

- `npm run typecheck --workspace=@valuerank/api`
- `npm run test --workspace=@valuerank/api -- tests/config.test.ts tests/services/run/summarization.test.ts`
- `python3 -m pytest workers/tests/test_summarize.py`

## Slice 2 [CHECKPOINT] Transcript cache reuse and persistence

Estimated diff: 220-300 lines

### Scope

- extend `DecisionMetadata` with an optional cache payload
- add cache-key helpers in `cloud/apps/api/src/queue/handlers/summarize-transcript.ts`
- reuse cached summaries before spawning the Python worker
- reconstruct persisted decision metadata and raw decision evidence on cache hits
- persist a fresh cache record only after a successful worker run
- keep the current fallback worker path intact on cache miss
- add tests for cache hit, content miss, parser miss, model miss, bypass, and miss fallback
- add tests for malformed or incomplete cache payloads falling back to the worker

### Work

1. Update `cloud/packages/db/src/types.ts` with a small additive cache type on
   `DecisionMetadata`.
2. Update `cloud/apps/api/src/queue/handlers/summarize-transcript.ts` to:
   - compute the current transcript response hash from transcript content
   - compare hash, parser version, and model against the stored cache record
   - bypass cache lookup when `forceSummarize` is true
   - restore `decisionCode`, `decisionCodeSource`, `decisionText`, and `decisionMetadata`
     by rehydrating the worker summary and transcript persistence metadata when the key matches
   - store a fresh `summaryCache` record after a successful worker run
   - ignore malformed cache data and fall back to the worker
3. Update `cloud/apps/api/tests/queue/handlers/summarize-transcript.test.ts` with a compact
   table of cases:
   - unchanged transcript reuses the cached summary
   - cache hit rehydrates the same persisted transcript fields as a fresh worker result
   - changed transcript content forces a worker run
   - changed parser version forces a worker run
   - changed model forces a worker run
   - `forceSummarize` bypasses the cache
   - malformed or incomplete cache data falls back to the worker path
   - missing cache falls back to the worker path
4. Keep restart and recovery services unchanged unless a review finds they need a direct
   adjustment. Their existing queue paths already benefit from handler-level reuse.

### Verification

- `npm run typecheck --workspace=@valuerank/api`
- `npm run test --workspace=@valuerank/api -- tests/config.test.ts tests/queue/handlers/summarize-transcript.test.ts tests/services/run/summarization.test.ts`
- `python3 -m pytest workers/tests/test_summarize.py`

### Notes

- This slice is intentionally additive. No schema migration, queue type change, or UI work.
- If the cache shape turns out to need broader storage than `decisionMetadata.summaryCache`,
  stop and escalate instead of guessing.
- `forceSummarize` bypasses both the cache and the normal `summarizedAt` short-circuit for
  that job, but it does not delete the previous good cache entry up front.
- The handler should check cache before any legacy `summarizedAt` fallback so cache-aware
  reruns can work on already-summarized transcripts.
- Cache-hit assertions should compare the persisted transcript fields against a fresh worker
  result field by field, not just check that the worker was skipped.
- Duplicate summarize jobs are still a known near-term limitation; this slice does not add
  queue locking or in-progress cache records.
