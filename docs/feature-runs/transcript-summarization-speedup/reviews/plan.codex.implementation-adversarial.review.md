---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/transcript-summarization-speedup/plan.md"
artifact_sha256: "6aff1465978c906f09c70b6caa915e7566062a6143f0070746b55296b52f2817"
repo_root: "."
git_head_sha: "b3095605580880e5884d3d66c6b47cfaa3c8d9e8"
git_base_ref: "origin/main"
git_base_sha: "445c9ab175a57ca54a0094c51078af66a1f61bd0"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted after clarifying that forceSummarize is resolved before batching and the worker only sees uncached transcripts, which keeps the implementation additive and backward compatible."
raw_output_path: "docs/feature-runs/transcript-summarization-speedup/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

1. **High** The plan makes one Python spawn equal one PgBoss batch, but it never defines a batch cap, split strategy, or fallback for oversized batches. That creates a hard hidden assumption that queue batch size is always safe for one process invocation. If a batch is large or skewed, one slow transcript can hold the whole batch open, and the worker can hit payload, memory, or timeout limits.
2. **High** The batch response contract is underspecified for failure and duplication cases. Keying results only by transcript ID assumes every ID is unique in the batch and that every item has exactly one outcome. If the same transcript appears twice, or if the worker returns mixed success/error states, results can be overwritten or misrouted with no clear recovery path.
3. **Medium** The cache short-circuit and `maybeCompleteRun()` flow is not fully defined for mixed batches. The plan says cached hits are handled first and per-transcript updates stay the same, but it does not spell out what happens when one batch contains cached transcripts, fresh successes, and one retryable failure. That leaves room for double-counted progress, stale retry behavior, or a run being marked complete before all uncached work is actually persisted.
4. **Medium** The validation plan is too happy-path heavy for the new contract. It calls for batch-worker tests and handler tests, but it does not explicitly cover the failure modes this change introduces: mixed cached/uncached batches, duplicate transcript IDs, and partial batch failures. Those are the cases most likely to break the new mapping logic while still letting the “batch works” path pass.

## Residual Risks

- Batch-level provider metrics will still be coarser than transcript-level metrics, so attribution and debugging will be less precise.
- Throughput will still depend on how PgBoss groups jobs in practice, so one slow item can delay visibility for other items in the same batch even if the implementation is correct.
- Backward compatibility depends on reliable response-shape detection between single and batch worker outputs; if the schemas overlap too much, malformed output could be accepted too late.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted after clarifying that forceSummarize is resolved before batching and the worker only sees uncached transcripts, which keeps the implementation additive and backward compatible.
