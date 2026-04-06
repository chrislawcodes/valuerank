---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/summarization-cache/plan.md"
artifact_sha256: "afb6af9c84989c5a125abce3fbdca143e737e28c235f8129e06a04df71feee46"
repo_root: "."
git_head_sha: "dd55b9051c188c024ef0cfbb215d93aaaceba09c"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "57b19139456a975e3209c989974fca1fc83ea75a"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted after tightening the hash scope, moving cache lookup ahead of any legacy summarizedAt fallback, writing summary plus cache together in one transcript update, and keeping duplicate summarize jobs as a documented near-term tradeoff."
raw_output_path: "docs/workflow/feature-runs/summarization-cache/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

1.  **Untestable Observability:** The plan lacks a clear mechanism to assert a cache hit versus a cache miss. Tests cannot reliably verify the core caching logic without being able to distinguish between "worker was not called because the cache was used" and "worker was not called because of a bug." The implementation must expose a way for tests to observe which path was taken (e.g., via mockable service calls, structured logging, or a debug response header).

2.  **Weak Testing for "Fail-Closed" Principle:** The plan states the system will "fail closed to a worker rerun" if the cache is malformed. This is the most critical failure mode to test. The test strategy must include intentionally seeding the database with multiple forms of corrupt `summaryCache` data (e.g., missing `responseSha256`, null `parserVersion`, invalid JSON structure, extra unexpected fields) and asserting that a full worker rerun is triggered in every case.

3.  **Implicit Dependency on `summarizedAt`:** The plan introduces a subtle interaction with the legacy `summarizedAt` field. It states this field is a fallback "after cache lookup fails." This creates a complex logical path that is prone to error. The test plan must explicitly cover these scenarios:
    *   **Cache Miss, `summarizedAt` Present**: Assert the handler short-circuits and does *not* call the worker.
    *   **`forceSummarize` True, `summarizedAt` Present**: Assert the handler bypasses the `summarizedAt` check and *does* call the worker.
    *   **Cache Hit, `summarizedAt` Present**: Assert the cache takes precedence and the handler does *not* fall back to the `summarizedAt` check.

4.  **Assumed Environmental Synchronization:** The plan relies on a shared `SUMMARIZE_PARSER_VERSION` environment variable between two distinct services (API and Python worker). This is a point of operational fragility. The test plan must include a scenario that simulates a version mismatch. For example, a test could use a mocking framework to make the API handler read version `N` while the cache record was written with version `N-1`, and assert that this causes a mandatory cache invalidation and worker rerun.

5.  **Incomplete Cache Key Invalidation Logic:** The cache key is `responseSha256 + parserVersion + modelId`. The test plan needs to systematically validate each component of this key independently.
    *   Assert a cache miss when *only* `responseSha256` changes.
    *   Assert a cache miss when *only* `parserVersion` changes.
    *   Assert a cache miss when *only* `modelId` changes.
    *   Assert a cache hit when *none* of them change.
    This proves that the key logic is sound and not subject to short-circuit evaluation bugs.

## Residual Risks

1.  **Concurrent Execution Race Condition:** The plan explicitly defers locking, acknowledging that duplicate jobs can perform redundant work. This remains a significant risk. Two jobs running concurrently for the same transcript could both experience a cache miss, execute the worker, and then race to write the `summaryCache` back to the database. The last writer wins, potentially overwriting a valid cache entry from a slightly faster, identical process. This could lead to wasted compute and unpredictable cache state.

2.  **Non-Atomic Update Failure:** The plan proposes a single transcript update to persist both the summary fields and the cache record. While this reduces risk, it is not a true atomic transaction. A failure during the database write operation could theoretically leave the transcript in a partially updated state (e.g., summary fields written but `summaryCache` fails, or vice-versa). This edge case is difficult to test and could lead to inconsistent data that subverts the caching logic on subsequent runs.

3.  **Operational Desynchronization:** While the effect of a `SUMMARIZE_PARSER_VERSION` mismatch can be tested, the operational risk of it occurring in production remains. A deployment error or manual configuration mistake could cause the API and worker to go out of sync, leading to mass cache invalidations and a sudden, unexpected load spike on the summarization workers. The `forceSummarize` flag is a manual mitigation, not a preventative measure.

## Token Stats

- total_input=1579
- total_output=917
- total_tokens=15778
- `gemini-2.5-pro`: input=1579, output=917, total=15778

## Resolution
- status: accepted
- note: Accepted after tightening the hash scope, moving cache lookup ahead of any legacy summarizedAt fallback, writing summary plus cache together in one transcript update, and keeping duplicate summarize jobs as a documented near-term tradeoff.
