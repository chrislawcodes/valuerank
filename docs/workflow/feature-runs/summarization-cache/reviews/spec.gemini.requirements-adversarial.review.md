---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/summarization-cache/spec.md"
artifact_sha256: "e4656926d8881dc9974417202be02c00321f38483cf06f271ee3d4a8982e576b"
repo_root: "."
git_head_sha: "dd55b9051c188c024ef0cfbb215d93aaaceba09c"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "57b19139456a975e3209c989974fca1fc83ea75a"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted as the near-term cache design: cache lookup happens before any legacy summarizedAt fallback, force reruns bypass old cache entries without deleting the last good one up front, and the transcript summary plus cache record are written together in one update after success."
raw_output_path: "docs/workflow/feature-runs/summarization-cache/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

1.  **High: Failed `forceSummarize` leads to stale cache hits.** The spec mandates that a forced rerun leaves the prior cache record in place until a successful replacement is written. This creates a critical flaw:
    1.  A valid summary exists in the cache.
    2.  A user triggers `forceSummarize` to update it, perhaps due to a known issue in the cached version.
    3.  The new summarization job runs but fails (e.g., LLM timeout, transient bug).
    4.  Because the job failed, the old cache entry is not replaced.
    5.  The next *normal* (non-forced) job for this transcript runs. It will find the old, stale cache entry, register a cache hit, and restore the very data that the user explicitly tried to replace. The user's intent is violated, and the failure of the forced-rerun is silently ignored by subsequent workflows.

2.  **Medium: `parserVersion` update is not atomic.** The spec assumes the API handler and the Python worker will read the same `parserVersion` from a "shared env/config value." During a rolling deployment, the API service might be updated to a new version while workers from the old version are still running (or vice-versa). This desynchronization can lead to two failure modes:
    *   **Cache Poisoning:** A new API handler sees `parserVersion: 2`, but an old worker (expecting `1`) processes the job. The resulting summary, generated with version 1 logic, is incorrectly saved to the cache with the `parserVersion: 2` key.
    *   **Perpetual Cache Misses:** An old API handler sees `parserVersion: 1` and looks for a matching cache entry. A new worker runs, produces a summary, and the handler saves it with `parserVersion: 1`. However, the *next* time the new API handler runs, it will look for `parserVersion: 2` and miss, triggering another unnecessary rerun. The contract between services is brittle.

3.  **Medium: Silent failure on malformed cache data.** The spec states that if stored cache data is "malformed or incomplete, the handler ignores it and falls back to the worker path." This behavior is dangerous because it provides no observability. A systemic bug could be writing corrupted cache entries across thousands of transcripts, but because the system "safely" falls back, the issue would go completely undetected. There is no specified logging or alerting for cache read failures, creating a hidden source of technical debt and performance degradation.

4.  **Low: Hashing algorithm is ambiguous.** The cache key relies on a `responseSha256` hash using the "same normalization as the summarize worker." This normalization process (e.g., handling of whitespace, line endings, field order) is not defined in the spec. If the API handler's implementation of this normalization diverges even slightly from the Python worker's, the hashes will never match, silently disabling the cache entirely. The algorithm for normalization should be explicitly defined and shared, not just referenced.

## Residual Risks

1.  **No Bulk Invalidation Strategy.** The only cache invalidation mechanism is a manual, per-transcript `forceSummarize` flag. This poses a significant operational risk. If a systemic, non-obvious bug is discovered in the logic for a given `parserVersion` (e.g., it produces plausible but subtly incorrect summaries), there is no mechanism to invalidate all summaries associated with that version. This would necessitate a slow, manual, and error-prone database script to find and purge all affected cache entries.

2.  **No Circuit Breaker for Persistent Failures.** The design intentionally avoids caching error states to ensure failed transcripts are retried. While reasonable, this means a transcript that will *always* fail to summarize (e.g., due to content that triggers a deterministic bug in the worker) will be re-submitted for summarization on every run. This creates a resource drain, incurs repeated LLM costs for no benefit, and clogs job queues with doomed work.

3.  **Race Conditions Cause Wasted Work.** The spec does not prevent race conditions where two identical, uncached summarization jobs are dispatched simultaneously. Both will result in a cache miss, and both will spawn a Python worker to perform the exact same expensive task. The last worker to complete will overwrite the cache entry of the first, wasting the resources of the first run. While not leading to data corruption, this is an accepted inefficiency that could become costly at scale.

## Token Stats

- total_input=1665
- total_output=966
- total_tokens=16280
- `gemini-2.5-pro`: input=1665, output=966, total=16280

## Resolution
- status: accepted
- note: Accepted as the near-term cache design: cache lookup happens before any legacy summarizedAt fallback, force reruns bypass old cache entries without deleting the last good one up front, and the transcript summary plus cache record are written together in one update after success.
