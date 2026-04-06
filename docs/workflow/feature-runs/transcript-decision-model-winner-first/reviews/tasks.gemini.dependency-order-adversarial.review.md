---
reviewer: "gemini"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/transcript-decision-model-winner-first/tasks.md"
artifact_sha256: "bdda2d57690125fde7316b228e360315ec4854a13409a157e1284d4d7e2af30b"
repo_root: "."
git_head_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
git_base_ref: "origin/fix/conditions-matrix-paired-transcripts"
git_base_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted: the implementation is sequenced in two slices but will only ship after both are complete; slice 1 now includes the handler-to-GraphQL integration test, and slice 2 stays tightly focused on the B-first display bug."
raw_output_path: "docs/workflow/feature-runs/transcript-decision-model-winner-first/reviews/tasks.gemini.dependency-order-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

1.  **High Severity: Inverted Dependency in Slice Sequencing.** The plan proposes implementing data caching (Slice 1) before fixing a data transformation/display bug (Slice 2). This order is inverted and high-risk. If the "B-first mapping" bug in `PairedRunComparisonCard` is a data logic issue (and not purely a view-layer typo), then Slice 1 will be caching the output of faulty logic. When Slice 2 is later implemented to fix the UI, it will be reading from a cache that has been poisoned with incorrect "winner-first" data for B-first scenarios. The correct sequence is to resolve the B-first data transformation logic first, ensuring the data is correct, and only then implement a caching layer that persists it.

2.  **Medium Severity: No Cache Invalidation Strategy for Logic Changes.** The plan defines "stale" metadata based on freshness keys like `parserVersion` and `responseSha256`. This handles model or parser updates but fails to account for changes in business logic, such as the B-first correction in Slice 2. If Slice 1 is completed and populates caches before the B-first logic is fixed, those cached entries are permanently incorrect. There is no task for invalidating or reprocessing these entries. This creates a dependency on getting the logic 100% right the first time and introduces a hidden data debt that will require a manual backfill to fix.

3.  **Low Severity: Assumed Limited Blast Radius.** Slice 2 targets the fix to a single React component (`PairedRunComparisonCard.tsx`). The plan assumes this is the only place affected by the B-first mapping issue. This is a weak assumption. The underlying `transcript-decision-model` could be consumed by other analytics components, data exports, or downstream processes that are not being tested. The verification plan for Slice 2 doesn't include any work to identify other potential consumers, creating a risk of leaving the same bug unfixed elsewhere.

## Residual Risks

1.  **Development Rework.** The review note states the slices will "only ship after both are complete." While this prevents deploying a broken state, it doesn't mitigate the risk of development churn. A developer implementing Slice 1 is likely to build the cache using the existing, faulty logic. When the Slice 2 work clarifies the bug, the caching implementation from Slice 1 will require significant rework to align with the corrected logic, invalidating the sequential slice approach.

2.  **Implicit Dependencies Obscure True Task Complexity.** By separating the data persistence from the data correction, the plan hides the true relationship between them. The work in Slice 2 is not just a "display bug fix"; it's a re-definition of the correct state for a subset of data. This re-definition is a critical dependency for the caching logic in Slice 1. Framing them as separate, sequential tasks creates a high risk of mis-implementation.

3.  **Future Maintenance Hazard.** The lack of a cache invalidation path for logic changes sets a dangerous precedent. Any future bug found in the winner-first decision logic will have no prescribed mechanism for correction, forcing a new, ad-hoc backfill or migration plan. The system is being built without the necessary tools to correct its own data.

## Token Stats

- total_input=1890
- total_output=694
- total_tokens=16374
- `gemini-2.5-pro`: input=1890, output=694, total=16374

## Resolution
- status: accepted
- note: Accepted: the implementation is sequenced in two slices but will only ship after both are complete; slice 1 now includes the handler-to-GraphQL integration test, and slice 2 stays tightly focused on the B-first display bug.
