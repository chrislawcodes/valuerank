---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/summarization-cache/plan.md"
artifact_sha256: "afb6af9c84989c5a125abce3fbdca143e737e28c235f8129e06a04df71feee46"
repo_root: "."
git_head_sha: "dd55b9051c188c024ef0cfbb215d93aaaceba09c"
git_base_ref: "origin/chore/agents-md-single-source-of-truth"
git_base_sha: "57b19139456a975e3209c989974fca1fc83ea75a"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted after tightening the hash scope, moving cache lookup ahead of any legacy summarizedAt fallback, writing summary plus cache together in one transcript update, and keeping duplicate summarize jobs as a documented near-term tradeoff."
raw_output_path: "docs/feature-runs/summarization-cache/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1.  **High Risk: Synchronization Brittleness.** The plan's reliance on a "shared `SUMMARIZE_PARSER_VERSION` env/config value" is a critical single point of failure. A partial or failed deployment where the API and Python worker have different versions will lead to a persistent state of cache invalidation and redundant worker execution. The plan acknowledges the need for synchronization but presents no mechanism to enforce it, making the system fragile during deployments.
2.  **High Risk: Thundering Herd on Cache Miss.** The "fall through to the existing worker path" approach on a cache miss or invalidation creates a significant risk of system overload. If a popular transcript's cache is invalidated, multiple concurrent requests will trigger identical, resource-intensive summarization jobs. The plan notes this as "redundant work" but understates the risk of cascading failures, queue backpressure, and significant cost overruns. The architecture lacks locking or in-flight request deduplication at the handler level to mitigate this.
3.  **Medium Risk: Incomplete Cache Key.** The proposed cache key (`responseSha256 + parserVersion + modelId`) is insufficient and vulnerable:
    *   **Ambiguity:** The definition of `responseSha256` as a "transcript content hash" is dangerously vague. It's unclear if this includes only raw text or the full object structure. If it's only the text, changes to transcript metadata or schema will not invalidate the cache, potentially leading to the reuse of summaries against incompatible data structures.
    *   **External Dependency:** The key cannot account for silent, underlying updates to a model by the provider (e.g., if `gpt-4-turbo` is updated without changing the model ID string). This could lead to serving summaries that are inconsistent with the behavior of the current model version.
4.  **Medium Risk: Data Bloat and Performance Degradation.** Storing the cache payload directly within the `Transcript` object (`decisionMetadata.summaryCache`) will increase the document/row size for every transcript. This can degrade the performance of all read operations, even those that do not require the summary cache, and makes bulk analysis or management of the cache itself inefficient as it cannot be easily queried.

## Residual Risks

1.  **Manual Invalidation is Operationally Undefined.** The plan specifies a `forceSummarize` flag as an escape hatch but fails to define the tooling or process for using it. In a scenario requiring mass invalidation (e.g., discovery of a critical summarization flaw), the lack of a defined, scriptable interface will necessitate slow, error-prone, ad-hoc manual intervention.
2.  **No Mechanism for Cache Rollback.** The proposed design is purely additive. If a bug leads to a wave of incorrect summaries being cached, there is no mechanism to revert to a previous "known good" version. The only recourse is a costly, full-system rerun, which may not be feasible under time constraints.
3.  **No Defense Against Qualitative Staleness.** The cache key validates the inputs (`transcript`, `parserVersion`, `modelId`) but not the age of the output. A summary generated today might be qualitatively insufficient in a year due to evolving standards or understanding, but it will still be served as long as the key matches. The lack of a simple `createdAt` timestamp and a TTL (Time-To-Live) policy creates a risk of serving perpetually stale data.
4.  **Centralized Failure Point.** While centralizing logic in the `summarize-transcript.ts` handler is logical, it also becomes a critical failure point. Any unhandled exception in the cache-handling logic (e.g., from parsing a malformed cache object) could prevent the handler from falling back to the worker path, thus breaking all summarization workflows, not just those with cache hits.

## Token Stats

- total_input=1578
- total_output=806
- total_tokens=16067
- `gemini-2.5-pro`: input=1578, output=806, total=16067

## Resolution
- status: accepted
- note: Accepted after tightening the hash scope, moving cache lookup ahead of any legacy summarizedAt fallback, writing summary plus cache together in one transcript update, and keeping duplicate summarize jobs as a documented near-term tradeoff.
