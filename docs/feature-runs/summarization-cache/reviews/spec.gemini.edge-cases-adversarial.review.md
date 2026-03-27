---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/summarization-cache/spec.md"
artifact_sha256: "e4656926d8881dc9974417202be02c00321f38483cf06f271ee3d4a8982e576b"
repo_root: "."
git_head_sha: "dd55b9051c188c024ef0cfbb215d93aaaceba09c"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "57b19139456a975e3209c989974fca1fc83ea75a"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted as the near-term cache design: cache lookup happens before any legacy summarizedAt fallback, force reruns bypass old cache entries without deleting the last good one up front, and the transcript summary plus cache record are written together in one update after success."
raw_output_path: "docs/feature-runs/summarization-cache/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1.  **Race Conditions During Concurrent Writes.** The spec does not address the scenario where multiple summarization jobs for the same transcript execute concurrently. If two jobs both have a cache miss, they will both spawn a worker. The last worker to finish will overwrite the other's cache entry. In a non-deterministic process like LLM summarization, this means the final cached state is subject to a race condition. A more severe race occurs if a normal job and a `forceSummarize` job run concurrently; the forced result could be overwritten by the normal job depending on completion timing.

2.  **Ambiguous Hashing Contract.** The cache key `responseSha256` relies on a "normalization" process that must be identical in two different services (the API handler and the Python worker). The spec fails to define this normalization process, creating a critical, unstated dependency. Any subtle drift in implementation (e.g., whitespace, key ordering) between the services will lead to persistent cache misses, silently defeating the feature.

3.  **Deployment Desynchronization Risk.** The `parserVersion` is read from a shared configuration value, but the spec assumes the API service and worker fleet are always running identical versions. During a rolling deployment, a new API handler may find a cache miss and create a job that is picked up by an old worker. That worker would then (re)write a cache entry with the *old* version, causing the new API to miss again on the next attempt, leading to redundant work until the entire worker fleet is updated.

4.  **Incomplete Handling of Malformed Data.** The spec correctly identifies that malformed cache data should trigger a fallback to the worker. However, it does not explicitly state that a successful result from that fallback must overwrite the malformed entry. This omission could allow a corrupted cache record to persist, forcing every subsequent job for that transcript to re-run indefinitely.

## Residual Risks

1.  **Cache Poisoning without Detection.** A bug in the summarizer worker could produce a *structurally valid* but *semantically incorrect* summary. This incorrect data would be written to the cache and served to all subsequent requests. The only remediation path is a manual `forceSummarize` job, but there is no mechanism specified for detecting such "poisoned" entries at scale. This creates a risk of silently propagating flawed data.

2.  **Weak `parserVersion` Contract.** The entire safety of the cache against logic and schema changes rests on developers diligently bumping the `parserVersion`. This dependency on discipline is a weak assumption. A change to the worker's output data structure (e.g., `decisionMetadata`) without a corresponding version bump could cause downstream consumers to receive cached data with an unexpected schema, leading to runtime errors.

3.  **Stale Reads During Forced Reruns.** The decision to leave the old cache record in place until a forced rerun succeeds is a safe default against failures. However, it creates a period where the system is knowingly stale. Any other requests for that transcript while the (potentially long-running) forced job is in flight will continue to be served the old, explicitly invalidated data from the cache. This is an acceptable trade-off for safety, but it remains a risk for use cases that expect immediate invalidation.

## Token Stats

- total_input=1667
- total_output=698
- total_tokens=16212
- `gemini-2.5-pro`: input=1667, output=698, total=16212

## Resolution
- status: accepted
- note: Accepted as the near-term cache design: cache lookup happens before any legacy summarizedAt fallback, force reruns bypass old cache entries without deleting the last good one up front, and the transcript summary plus cache record are written together in one update after success.
