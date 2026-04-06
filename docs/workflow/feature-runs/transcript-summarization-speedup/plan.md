# Plan: Transcript Summarization Speedup

## Approach

Use the existing PgBoss batch boundary as the new spawn boundary.

Phase 1 is intentionally additive:

- teach `cloud/workers/summarize.py` to accept a batch of transcript payloads and emit a
  batch response
- refactor `cloud/apps/api/src/queue/handlers/summarize-transcript.ts` so it keeps the
  current cache short-circuit path, then sends only the uncached transcripts through one
  Python invocation per PgBoss batch
- keep the single-transcript worker payload compatible so older callers and existing
  tests do not break
- keep the batch response keyed by transcript ID so the API can deterministically map
  each result back to the correct transcript

## Why this shape

- It removes repeated process startup without introducing a daemon, queue change, or
  background pool.
- It preserves correctness because each transcript still gets the same summary logic.
- It stays additive because the worker script keeps the old single-item entrypoint.
- It keeps the existing transcript summary cache useful, so repeated runs still avoid
  Python entirely when nothing changed.

## Implementation Notes

- The Python worker should keep `run_summarize()` as the single-transcript primitive and
  add a thin batch wrapper around it.
- The API handler should prepare jobs first, so it can separate cache hits from jobs that
  still need the worker.
- The batched worker call should still be rate-limited, but as one batch work unit rather
  than one transcript at a time.
- The handler should accept either a single summary response or a batch response from the
  worker so the change remains backward compatible.
- Per-transcript DB updates, progress accounting, and `maybeCompleteRun()` calls should
  stay the same.
- `forceSummarize` is resolved before the worker call, so the worker never has to infer
  job-level force behavior from a mixed batch payload.

## Risk Notes

- Batch-level scheduling slightly changes the granularity of provider metrics, because one
  Python spawn now represents several transcripts. That is acceptable for phase 1 and can
  be revisited later if we need finer accounting.
- The batch response shape must stay deterministic so transcript updates still map back to
  the correct transcript IDs.
- A top-level Python failure should still be treated as a worker failure for the whole
  current PgBoss batch, just as a single-transcript worker failure is today.
- Batch responses are processed transcript by transcript. A retryable failure inside an
  otherwise successful batch remains a failure for that transcript, but it does not
  change the already-committed summaries in the same batch.

## Slice Boundaries

1. Add batch support to the Python summarize worker and tests.
2. Refactor the API summarize-transcript handler to batch uncached transcripts into one
   Python invocation and add handler tests for the new path.

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Accepted after defining the transcript-scoped batch payload, preserving single-item compatibility, and constraining phase 1 to the existing PgBoss batch boundary with no new pool.
- review: reviews/spec.gemini.ambiguity-adversarial.review.md | status: accepted | note: Accepted after defining the batch payload schema, keeping forceSummarize job-scoped and pre-resolved before batching, and making batch results transcript-scoped.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Accepted after defining batch failure semantics, transcript-keyed batch output, and the maximum batch size as the existing PgBoss summarize batchSize.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Accepted after specifying a transcript-scoped batch payload, keeping the worker backward compatible, and preserving existing cache short-circuits before batching.
- review: reviews/plan.gemini.risk-boundary-adversarial.review.md | status: accepted | note: Accepted after bounding batch size to the current PgBoss worker batchSize, using stdin JSON rather than argv, and keeping payload handling transcript-scoped.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Accepted after resolving forceSummarize before batching, keeping the worker additive, and ensuring the handler can map batch results back to transcript IDs deterministically.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Accepted after keeping the Python batch protocol as slice 1, the handler batch-spawn refactor as slice 2, and the cache prefilter before the worker call.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Accepted after keeping the worker batch protocol and handler batching in separate slices, preserving the cache prefilter, and ensuring the batch response is keyed back to transcript IDs.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: Accepted after preserving single-item worker compatibility, adding a mixed-envelope guard, and keeping batch retries bounded by per-transcript retry counts.
- review: reviews/diff.gemini.operational-risk-adversarial.review.md | status: accepted | note: Accepted after batching at the PgBoss boundary, processing cached hits first, and letting retryable batch failures roll forward without re-spawning Python for already-completed transcripts.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: Accepted after rejecting mixed envelopes, preserving single-item compatibility, and keeping batch failure handling transcript-scoped so successful summaries still commit safely.
