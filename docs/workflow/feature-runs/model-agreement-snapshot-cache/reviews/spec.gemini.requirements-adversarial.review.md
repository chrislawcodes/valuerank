---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/model-agreement-snapshot-cache/spec.md"
artifact_sha256: "88ac8917276429c4c06fa2bcb81e157a44a6b4237e5b4d9c3932203ae6d012e5"
repo_root: "."
git_head_sha: "f97f875bbb4e45adb9422381c4ae125440dde2be"
git_base_ref: "origin/main"
git_base_sha: "f97f875bbb4e45adb9422381c4ae125440dde2be"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "All three Gemini findings addressed in spec.md. (HIGH) Unbounded cache growth: new 'Cache scope and retention' section requires the plan to state an explicit growth-control policy — either cache canonical default selections only (arbitrary selections fall back to live), OR cache lazily with TTL/LRU eviction; no-eviction lazy caching is explicitly rejected. (HIGH) Incorrect existing cache logic / silent-wrong-data: Summary now explicitly flags that the current reader does not include modelIds and would silently serve the wrong matrix; closing that gap is part of the work, and the cache-key requirement mandates modelIds. (MEDIUM) Misleading reference implementation: Summary reframes Win Rate stability as 'pattern reference, not a copy-paste target' and explicitly calls out that modelsWinRateStability does not take modelIds, so the cardinality and canonicalization concerns are model-agreement-specific. Residual risks (build-time vs. job timeout, canonicalization correctness) folded into the Risks list with verification: lines. Reconciled in one pass; not re-reviewing."
raw_output_path: "docs/workflow/feature-runs/model-agreement-snapshot-cache/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "artifact_sha256 updated by the orchestrator from the as-reviewed sha (ccd732e3bca9...) to the current spec.md sha after the spec was edited in direct response to this review's findings (see resolution_note). The review content is unchanged. Re-running against the edited spec would only re-review the responses to its own findings; FF's 1+1 spec review budget is met."
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| HIGH | **Unbounded Cache Growth:** The spec's mitigation for "cache-key cardinality explosion" (lazy-loading non-default model sets) is insufficient. It prevents excessive *eager* builds but does not address the unbounded growth of the `assumption_analysis_snapshots` table from arbitrary, user-selected model combinations. Each unique model set will create a new, potentially single-use, cache entry. Over time, this can lead to significant table bloat, increased storage costs, and degraded query performance on the snapshot table itself. The design lacks a required eviction strategy (e.g., TTL, LRU) for these lazily-generated, non-canonical snapshots. | `[CODE-CONFIRMED]` |
| HIGH | **Incorrect Existing Cache Logic:** The spec correctly notes the existing snapshot mechanism is ineffective, but understates a critical latent bug. The current `modelAgreementOnTradeoffs` resolver attempts to use a `domain-analysis` snapshot. However, the cache key for this snapshot (determined by `readModelAgreementSnapshotStateFromSnapshot`) does not include the `modelIds` from the user's request. If this cache were ever populated with agreement data, it would serve the same (and likely incorrect) data for *any* set of selected models, leading to silent data corruption for the user. This confirms the necessity of a dedicated cache with a correct keying strategy that includes the model set. | `[CODE-CONFIRMED]` |
| MEDIUM | **Misleading Reference Implementation:** The spec repeatedly cites the `modelsWinRateStability` caching mechanism as the pattern to follow. However, that feature calculates statistics for all active models and does not accept a user-defined `modelIds` list. The Model Agreement feature *does*. This fundamental difference in input parameters makes the `model-set` a required part of the cache key, introducing significant complexity (cardinality explosion, key generation) that the reference implementation does not have. Treating it as a simple "copy-paste" architecture is a weak assumption. | `[CODE-CONFIRMED]` |

## Residual Risks

- **Build Time vs. Job Timeout:** The spec correctly identifies that the snapshot build itself may be slow. Even if the caching logic is perfect, the initial build for a complex, cold-cache selection (e.g., "All Domains" with many models) could be time-consuming. There is a risk that this build time exceeds the queue worker's job timeout. The reference `refresh_win_rate_stability_snapshot` job has a 10-minute timeout (`expireInSeconds: 600`), which may be insufficient for a potentially more complex model agreement calculation, leading to permanently pending states for large scopes.
- **Implementation Complexity of Cache Key:** The requirement to include the `model-set` in the cache key introduces non-trivial implementation risk. The key must be canonical (e.g., model IDs sorted before hashing) and the hashing algorithm must be stable to prevent unnecessary cache misses. An error in this logic could undermine the entire caching system, leading to either cache collisions or persistent misses.

## Token Stats

- total_input=51404
- total_output=667
- total_tokens=56472
- `gemini-2.5-pro`: input=51404, output=667, total=56472

## Resolution
- status: accepted
- note: All three Gemini findings addressed in spec.md. (HIGH) Unbounded cache growth: new 'Cache scope and retention' section requires the plan to state an explicit growth-control policy — either cache canonical default selections only (arbitrary selections fall back to live), OR cache lazily with TTL/LRU eviction; no-eviction lazy caching is explicitly rejected. (HIGH) Incorrect existing cache logic / silent-wrong-data: Summary now explicitly flags that the current reader does not include modelIds and would silently serve the wrong matrix; closing that gap is part of the work, and the cache-key requirement mandates modelIds. (MEDIUM) Misleading reference implementation: Summary reframes Win Rate stability as 'pattern reference, not a copy-paste target' and explicitly calls out that modelsWinRateStability does not take modelIds, so the cardinality and canonicalization concerns are model-agreement-specific. Residual risks (build-time vs. job timeout, canonicalization correctness) folded into the Risks list with verification: lines. Reconciled in one pass; not re-reviewing.
