# Spec
# Spec: Transcript Summarization Cache

## Problem

Transcript summarization is still re-run even when a transcript has already been summarized
for the same transcript content, parser context, and summarizer model. That makes force
reruns, retries, and recovery paths slower than they need to be.

## Goal

Add a safe, additive near-term cache so summarization can reuse a prior successful summary
when all of these match:

- transcript content hash
- parser version
- summarizer model

If any of those change, the worker must fall back to the current summarization path.
An explicit bypass path must also exist for emergency invalidation and force reruns.

## Scope

- cache storage lives on the transcript itself, inside `decisionMetadata.summaryCache`
- cache lookup happens in the summarize queue handler before the Python worker is spawned
- a cache hit restores the prior summary fields and skips the worker
- a cache miss keeps current behavior unchanged
- the handler checks cache before any `summarizedAt` short-circuit, and `summarizedAt`
  remains only a legacy fallback when no usable cache record exists
- `forceSummarize` takes precedence over `summarizedAt` and cache hits for that job
- the parser version comes from a shared env/config value that both services read
- `forceSummarize` bypasses the cache for emergency reruns
- no transcript text is changed
- no new table, queue type, or schema migration is introduced

## Assumptions

- The current parser version is treated as a stable worker contract and is read from the
  same env/config value in both the API handler and the worker. Any change to summarizer
  prompt text, parsing logic, or post-processing must bump that shared value.
- The cache is intentionally narrow: key mismatch means "rerun", not "try to infer a
  partial reuse."
- Existing restart and recovery flows do not need new queue plumbing; they benefit from the
  cache because they already route work back through the summarize handler.
- Once cache metadata exists for a transcript, cache lookup happens before any legacy
  `summarizedAt` skip.
- If stored cache data is malformed or incomplete, the handler ignores it and falls back to
  the worker path.
- `forceSummarize` is the escape hatch when a cached summary needs to be ignored.
- A forced rerun leaves the previous cache record in place until a successful replacement
  is written.

## Cache Schema

`decisionMetadata.summaryCache` stores one latest successful summary per transcript:

```ts
type SummaryCache = {
  responseSha256: string;
  parserVersion: string;
  modelId: string;
  summary: {
    decisionCode: string;
    decisionCodeSource: string;
    decisionText: string | null;
    decisionMetadata: Record<string, unknown> | null;
  };
};
```

- `responseSha256` is the SHA-256 hash of the joined transcript target responses, using the
  same normalization as the summarize worker.
- `parserVersion` is the shared parser-version value read by both services.
- `modelId` is the summarizer model identity from the job payload or configured default.
- `summary.decisionMetadata` stores the worker-output metadata only, not the final persisted
  transcript `decisionMetadata` wrapper.
- `summary` is the full successful summary payload to restore on a cache hit.
- Missing or non-string key fields, a missing summary payload, or a stored summary with
  `decisionCode === 'error'` counts as malformed cache data and must fall back to the worker.

## Requirements

- Reuse a previous successful summary when the transcript content hash, parser version, and
  model all match the stored cache record.
- Force a fresh summary when transcript content changes.
- Force a fresh summary when parser version changes.
- Force a fresh summary when model changes.
- Preserve current behavior when the cache is missing or does not match.
- Bypass the cache when `forceSummarize` is set.
- Keep the previous cache record until a forced rerun succeeds.
- Keep the change additive and safe for local dev and production rollout.
- Do not guess at broader invalidation rules.
- Use SHA-256 for the transcript content hash, matching the worker's normalization.

## Non-goals

- Changing transcript text
- Adding a cache table or external cache service
- Reworking the recovery or restart job flow
- UI or analysis changes

## Acceptance Criteria

- An unchanged transcript with a matching cache record restores the prior summary without
  spawning the Python worker.
- A transcript with changed content hash re-runs summarization.
- A transcript with changed parser version re-runs summarization.
- A transcript with changed model re-runs summarization.
- `forceSummarize` bypasses the cache and re-runs summarization.
- A forced rerun leaves the prior cache record in place until a successful replacement is
  written.
- A cache miss still falls back to the worker and persists a fresh summary.
- Existing non-cached summarization behavior remains unchanged.
- The cache is safe to use in local development and production without a schema migration.
