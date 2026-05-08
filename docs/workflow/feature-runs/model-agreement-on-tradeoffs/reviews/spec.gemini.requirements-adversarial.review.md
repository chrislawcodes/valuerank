---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/model-agreement-on-tradeoffs/spec.md"
artifact_sha256: "b8fc850be6d2696b0837b6014a51fb608f69e7f5a2326a39e4b767a5bb1fd665"
repo_root: "."
git_head_sha: "9c48754bdcf18289e4acbb9d6a4d74de0a47187e"
git_base_ref: "origin/main"
git_base_sha: "9c48754bdcf18289e4acbb9d6a4d74de0a47187e"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/model-agreement-on-tradeoffs/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. HIGH: Rollback strategy is non-functional due to contradictory implementation plan

The spec's "rollback safety" strategy is to have the new snapshot builder write both the legacy `valuePairModelVotes` field and the new `cellLevelOutcomes` field. The stated purpose is to allow an old client/resolver to gracefully handle a new snapshot during the deployment window.

However, the spec also explicitly directs the deletion of `model-grouping-significance.ts` (the old resolver) and `readValuePairModelVotesFromSnapshot` (the function that reads the legacy data). If the code that reads the legacy data is deleted, no "old client" can possibly use it. The act of writing the legacy data becomes pointless as its read path is removed in the same batch of changes. The proposed safety mechanism cannot work as described.

This is a direct contradiction in the plan that makes the "graceful degradation" and "rollback safety" claims invalid. A true rollback would require reverting both the frontend and backend changes, which the spec itself acknowledges is a multi-PR operation, but it incorrectly claims the dual-write provides a temporary bridge that it cannot.

[CODE-CONFIRMED] — The `model-grouping-significance.ts` resolver is the only consumer of `readValuePairModelVotesFromSnapshot`. The spec's "Affected surfaces" table mandates deleting this resolver, which removes the only read path for the legacy data, making the dual-write for rollback safety ineffective.

### 2. MEDIUM: Code changes in the new math library will not trigger snapshot rebuilds, risking silent data corruption

The spec proposes a new `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` to be used in an `inputHash` to determine when a snapshot needs rebuilding. This is a good practice.

However, the plan introduces a new, separate math library (`model-agreement/math.ts`) to perform the core Cohen's Kappa calculation *after* the snapshot is read. The `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` is only tied to the *snapshot builder* (`domain-analysis-snapshot-builder.ts`).

If a bug is fixed or the methodology is tweaked in `model-agreement/math.ts`, the `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` will not change, and snapshots will not be rebuilt. The resolver will fetch "fresh" snapshot data and apply the new, modified math to it, producing different results. This creates a silent data inconsistency where the results shown to the user do not match the version of the code that generated them, as the data is stale relative to the *consuming* code.

[CODE-CONFIRMED] — The `computeInputHash` function in `domain-analysis-snapshot-builder.ts` uses `DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION` as the primary code fingerprint. This version constant is defined in `domain-analysis-cache-types.ts` and is not connected to any other files. Logic changes in a downstream consumer like the proposed `model-agreement-on-tradeoffs.ts` resolver are not tracked by this hash.

### 3. LOW: Ambiguous definition of equal-weighting for chance-agreement calculation

The methodology for calculating Cohen's Kappa requires computing `P_chance`, the probability of chance agreement. This relies on the marginal probabilities for each model (e.g., `P(X chose A)`). The spec states these marginals should be computed with "the same equal-weight aggregation over the comparison set."

This is ambiguous. "Equal-weight aggregation" is defined as a two-level process: first averaging results with equal weight *per cell* to get a per-vignette score, and then averaging those scores with equal weight *per vignette*. It is unclear how this two-level process should be applied to calculate a single marginal probability like `P(X chose A)`. Should it be a simple mean across all cells, or a mean-of-means across vignettes? The former would violate the "equal weight per vignette" principle. The latter is more complex and leaves room for implementation error if not specified precisely. This ambiguity could lead to an incorrect kappa calculation.

[UNVERIFIED] — This is an ambiguity in the specification for code that has not yet been written.

## Residual Risks

The spec provides a "Risks" section that addresses many potential issues. However, the findings above represent risks that are either not identified or are more severe than acknowledged. The following are residual risks noted from the review that are not severe enough to be primary findings but warrant documentation:

*   **Loss of Distributional Information:** The `meanTrialConsistency` metric aggregates a model's consistency into a single number. This average can hide significant variance; a model that is perfectly consistent half the time and completely random the other half may appear mediocre overall, masking the underlying bimodal behavior. Exposing only the mean loses this important detail.
*   **Arbitrary Thresholds Presented as Insight:** The spec proposes a `noisy` badge for models where `meanTrialConsistency < 0.7` and `cellsObserved >= 5`. While the spec notes these are heuristics, they will be presented to the user as a definitive state. There is a risk that users will over-interpret this badge as a statistically validated classification rather than a simple heuristic, especially since it replaces a section that was explicitly about statistical significance.

## Token Stats

- total_input=38614
- total_output=1138
- total_tokens=42745
- `gemini-2.5-pro`: input=38614, output=1138, total=42745

## Resolution
- status: open
- note: