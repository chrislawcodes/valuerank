# Plan
# Plan: Transcript Summarization Cache

## Approach

Keep the cache transcript-local and additive. The summarize handler will look for a
`decisionMetadata.summaryCache` record, compare it against the current transcript content
hash, parser version, and model, and reuse the stored summary when the key matches.

If the cache does not match, is missing, or is malformed, the handler falls through to the
existing Python worker path with no change in behavior.
The parser version comes from a shared env/config value that both the API handler and the
worker read, and `forceSummarize` bypasses both the cache and any legacy `summarizedAt`
short-circuit for emergency reruns.

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Cache storage | `Transcript.decisionMetadata.summaryCache` | Stays with the transcript, survives retries and restart flows, and keeps the change additive |
| Cache key | `responseSha256 + parserVersion + modelId` | Matches the user request and keeps invalidation explicit |
| Cache lookup point | `cloud/apps/api/src/queue/handlers/summarize-transcript.ts` | That is the single place that already orchestrates worker execution and transcript persistence |
| Parser version source | Shared `SUMMARIZE_PARSER_VERSION` env/config value | Keeps the handler and worker aligned without a new service or table |
| Bypass switch | `forceSummarize` on the queue job payload | Gives us an explicit escape hatch for emergency invalidation and forced reruns |
| Cache miss behavior | Fall through to the existing worker path | Preserves V1 behavior and correctness |
| Recovery and restart handling | No new queue plumbing | Those paths already enqueue summarize jobs; the handler cache makes them faster without changing their control flow |
| Failure mode | Fail closed to a worker rerun | Correctness is more important than speed if cache data is malformed or incomplete |
| Cache payload | Worker summary fields plus worker metadata only | Avoids self-referential transcript JSON and lets the handler rebuild persisted metadata on hit |
| Persistence shape | One transcript update after successful worker output | Keeps the summary fields and cache entry in sync without a separate migration or table |

## Implementation Outline

1. Add a shared parser-version config value in both the API and worker process.
2. Add a `forceSummarize` job flag so emergency reruns can bypass the cache.
3. Extend the shared `DecisionMetadata` type with an optional `summaryCache` payload.
4. Add small helpers in the summarize handler to:
   - compute the current transcript response hash
   - read and validate a stored cache record
   - bypass cache lookup when `forceSummarize` is true
   - restore cached summary fields on a hit
   - persist a fresh cache record only after a successful worker run
5. Keep `summarizedAt` as a legacy fallback only after cache lookup fails, so already-
   complete transcripts still short-circuit when there is no usable cache record.
6. Keep the worker output path unchanged for cache misses.
7. Add focused tests for cache reuse, the bypass switch, and the required invalidation cases.

## Risk Notes

- The parser version must stay synchronized between the Python worker and the API handler.
  That is acceptable for this near-term cache because both services read the same env/config
  value and the bypass switch gives us a deliberate escape hatch. Any summarizer prompt or
  parsing change must bump the shared version value.
- The transcript hash is computed from the transcript content only, before any summary
  fields or cache fields are written back, so `summaryCache` never feeds back into its own key.
- The cache should never guess. If any part of the stored record is missing or malformed,
  the handler must rerun summarization instead of attempting a partial reuse.
- We are not introducing a separate invalidation service. The key match is the only gate.
- Prompt or post-processing changes that need an invalidation can use the parser-version bump
  or `forceSummarize`, not an implicit extra cache key.
- Summary fields and the cache record are written together in one transcript update after the
  worker succeeds, so the persisted transcript and cache stay aligned.
- Duplicate summarize jobs for the same transcript can still do redundant work in this near-
  term slice; we are not adding queue locking in this change.
- Cache invalidation is per transcript row only; this near-term slice does not add a
  transcript-level cache index or multi-entry history.

## Slice Boundary

This feature stays in one bounded slice unless implementation or review finds a hidden
schema or rollout dependency. If that happens, split only the smallest necessary follow-up
slice rather than broadening the first one.

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Added an explicit `SummaryCache` schema, SHA-256 hashing language, shared env/config parser-version source, and `forceSummarize` bypass. The cache keeps the previous good entry until a forced rerun succeeds, so a failed emergency rerun does not destroy the last known-good summary.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Clarified cache payload shape, hash strategy, and `summarizedAt` precedence. The one-entry transcript-local cache is intentional for this near-term slice; bulk invalidation stays out of scope and uses parser-version bumps or `forceSummarize`.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Clarified that `forceSummarize` bypasses cache and leaves the previous cache in place until a successful replacement is written, and that the transcript cache is a single latest-successful-summary slot by design.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Added explicit hash scope, one-update persistence, and a transcript-only cache record so `summaryCache` never feeds back into its own key. Duplicate summarize jobs remain a near-term limitation without queue locking.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Added explicit malformed-cache handling and cache-hit restore shape, and kept the shared parser-version contract as the near-term invalidation gate.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Clarified that the transcript hash excludes summary-only fields, that summary plus cache are persisted together, and that duplicate summarize jobs are a known near-term tradeoff rather than a hidden lock.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Kept duplicate-work protection out of scope for this near-term slice, expanded `parserVersion` to mean any summarization behavior change, and made the split between service-level flag wiring and handler-level consumption explicit.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Added an explicit parser-version default, explicit cache-hit hydration parity checks, and a note that bulk invalidation and concurrent-job locking remain out of scope for this slice.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Clarified the cache-hit restore contract, the parser-version default, and the known near-term tradeoffs around duplicate jobs and shared version discipline.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: rejected | note: `spawnPython` already inherits `process.env`, so the shared parser-version env is available to the worker; the cache key intentionally hashes the joined transcript target responses per the spec, and the spec keeps `responseSha256 + parserVersion + modelId` as the near-term contract.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: Fixed the stale-cache regression by rerunning when a transcript has cache metadata but the key no longer matches, even if `summarizedAt` is already set.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: Reused the same transcript-response hash as the worker, and cleaned up the worker parser-version test layout so the parser-version coverage imports cleanly.
