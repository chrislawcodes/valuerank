---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/transcript-decision-model-winner-first/plan.md"
artifact_sha256: "661ab99fdfe137d37c0558138ebcd5dc43de2d2a9a7228264a60060a770ae285"
repo_root: "."
git_head_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
git_base_ref: "origin/fix/conditions-matrix-paired-transcripts"
git_base_sha: "0e47504311b8d1449e7d178bd56e0d23e9a87cf5"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted: the cache is versioned by freshness keys plus decisionState, stale or malformed rows fall back explicitly, export paths are in the blast radius, and slice 1 includes an end-to-end handler-to-GraphQL check plus db validation."
raw_output_path: "docs/feature-runs/transcript-decision-model-winner-first/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1.  **High Severity: Permanent Data Inconsistency by Design.** The decision to **not backfill** historical data ("Legacy coexistence") creates a permanent schism in the data representation. Instead of a migration, the plan institutionalizes a compatibility layer ("fallback path") that must be maintained indefinitely. This dramatically increases future maintenance costs and the risk of subtle bugs. Every query, analysis surface, and data-related feature must correctly implement two different logic paths (one for new cached data, one for old derived data). Over time, these paths will inevitably diverge, leading to inconsistent analytics and silent data corruption. The assumption that this compatibility path is a safe, long-term solution is a critical flaw.

2.  **High Severity: Missing End-to-End Verification Strategy.** The testing plan verifies the backend and frontend in isolated slices. There is no plan to test the system as a whole. A critical failure could occur at the seams between components: for example, if the GraphQL resolver's transformation of cached data has a subtle error, or if the frontend receives a mix of old-path and new-path data and handles it incorrectly. Without an end-to-end integration test (e.g., creating a transcript, running the summarizer, querying GraphQL, and asserting the `PairedRunComparisonCard` displays correctly), there is no confidence that the slices connect properly.

3.  **Medium Severity: Fragile Cache Invalidation.** The plan relies on `responseSha256`, `parserVersion`, and `modelId` as "freshness keys." This mechanism is brittle. If the business logic for calculating `favoredValueKey` or `strength` is updated within `summarize-transcript.ts` *without* changing the `parserVersion`, the cache will not be invalidated. Existing transcripts will retain stale, incorrectly structured cached data that is indistinguishable from valid data. This creates a high risk of silent data corruption on future deployments. A separate, explicit `cache_version` integer is required to reliably manage cache invalidation when the caching logic itself changes.

4.  **Low Severity: Undefined "Malformed" Cache Handling.** The plan states the read path will fall back if the cache is "malformed," but fails to define this condition. This ambiguity delegates a critical architectural decision to the implementing developer. Without a strict schema and validation for the cached payload (e.g., using a library like Zod), the definition of "malformed" could vary, leading to unpredictable behavior where some bad data is used and other bad data triggers a fallback. This introduces an unnecessary risk of inconsistent data handling.

## Residual Risks

1.  **Compatibility Path Maintenance Burden.** The legacy fallback logic remains a permanent feature of the codebase. It represents a significant source of technical debt and risk. Any future changes to the decision model or transcript analysis must be implemented twice and kept in perfect sync. This is a time bomb that makes the system more fragile and expensive to change over the long term.

2.  **Incomplete Blast Radius Analysis.** The "Blast Radius" section is extensive but may miss non-obvious, implicit dependencies. For example, ad-hoc analysis scripts, internal dashboards, or other undocumented consumers of the database may exist that rely on the previous data structure. Changing the primary source of truth for the decision from a stored `direction` to a derived one could break these downstream consumers in ways not anticipated by the plan.

3.  **Cross-Vignette Analysis Complexity.** The plan anchors the canonical ordering to the `definitionSnapshot` of each transcript. This is sound for individual transcripts but complicates analyses that compare results *across different vignette versions*. If a vignette's `dimensions` order is changed in a new version, any tool performing a cross-version comparison will now need to be aware of this new data model to avoid misinterpreting `favoredValueKey`. The plan correctly solves for the single-transcript case but may introduce complexity for higher-level analysis features that are not in the current scope.

## Token Stats

- total_input=2029
- total_output=829
- total_tokens=16362
- `gemini-2.5-pro`: input=2029, output=829, total=16362

## Resolution
- status: accepted
- note: Accepted: the cache is versioned by freshness keys plus decisionState, stale or malformed rows fall back explicitly, export paths are in the blast radius, and slice 1 includes an end-to-end handler-to-GraphQL check plus db validation.
