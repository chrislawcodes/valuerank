# Spec: Transcript Summarization Speedup

## Problem

The summarize-transcript path currently launches `python3` once per transcript job.
That repeats process startup cost during large summarization runs and retries, even
though jobs already arrive in PgBoss batches and the transcript summary cache can skip
unchanged transcripts.

## Goal

Reduce Python startup overhead by moving the spawn boundary from one transcript to one
PgBoss summarize batch, while keeping summary results, cache behavior, and error handling
stable.

## Requirements

- The Python worker must accept a batch payload with multiple transcripts and keep the
  existing single-transcript payload compatible.
- The batch payload must be a JSON object with a `transcripts[]` array. Each item keeps
  the existing transcript fields needed for summarization, plus the transcript ID so the
  result can be mapped back deterministically.
- `forceSummarize` stays a job-level flag and is resolved before batching, so only
  transcripts that actually need a worker call are included in the batch payload.
- The API handler must batch transcripts that still need work into one Python invocation
  per PgBoss summarize batch.
- Existing summary cache short-circuits must remain the first skip path for unchanged
  transcripts.
- `forceSummarize` must still bypass cache and re-run summarization.
- Summary semantics must not change for the same transcript content.
- Decision metadata and V1 compatibility behavior must remain intact.
- Error handling must stay deterministic and safe for retryable and non-retryable worker
  failures.
- The existing PgBoss summarize batch size remains the practical batch-size limit; phase 1
  does not add any unbounded secondary batching.

## Non-goals

- A long-lived Python worker process or process pool in phase 1.
- New queue types or queue schema changes.
- Changing transcript content, summary meaning, or user-visible text.
- Cross-run deduplication beyond the existing transcript summary cache.

## Acceptance Criteria

- Multiple uncached transcripts in one summarize batch use fewer Python process spawns
  than the current per-transcript path.
- Existing single-transcript behavior still works through the same worker script.
- Cache hits avoid Python spawn even in mixed batches.
- `forceSummarize` still triggers a new summarization path.
- The same input still produces the same summary semantics.
- Batch results are keyed back to the originating transcript IDs in a deterministic way.
- Retryable and non-retryable error paths still behave as expected.
