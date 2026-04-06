---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/transcript-summarization-speedup/spec.md"
artifact_sha256: "22e940acd9360f3a08934acb478f1b6d1ae9f786695dd524c1981cd67064795f"
repo_root: "."
git_head_sha: "b3095605580880e5884d3d66c6b47cfaa3c8d9e8"
git_base_ref: "origin/main"
git_base_sha: "445c9ab175a57ca54a0094c51078af66a1f61bd0"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted after defining batch failure semantics, transcript-keyed batch output, and the maximum batch size as the existing PgBoss summarize batchSize."
raw_output_path: "docs/workflow/feature-runs/transcript-summarization-speedup/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- **High:** The batch failure contract is missing. The spec says error handling must stay deterministic, but it never defines whether one bad transcript fails the whole PgBoss batch or can be isolated to that item. In a mixed batch, that omission can make successful transcripts retry unnecessarily, duplicate work, and let a non-retryable failure poison unrelated transcripts.
- **High:** The wire format compatibility story is underspecified. Supporting both the existing single-transcript payload and the new `transcripts[]` payload without a schema version or explicit discriminator forces brittle shape-detection in the worker. That is easy to break as transcript fields evolve and makes the compatibility promise hard to verify.
- **Medium:** Result mapping is not fully defined. The spec says results must map back to originating transcript IDs deterministically, but it does not require the response to echo IDs, preserve input order, or guarantee exactly one result per input item. Without that, dropped, reordered, or duplicated items can attach the wrong summary to the wrong transcript.

## Residual Risks

- Cache checks still happen before the Python call, so concurrent cache writes or invalidations can still produce redundant spawns in mixed batches. The spec reduces startup overhead; it does not eliminate it.
- The phrase “practical batch-size limit” leaves payload size, memory use, and timeout limits implicit. If PgBoss batches are larger than the Python invocation can safely serialize and parse, this design may still need a split policy later.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted after defining batch failure semantics, transcript-keyed batch output, and the maximum batch size as the existing PgBoss summarize batchSize.
