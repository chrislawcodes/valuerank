---
reviewer: "gemini"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflows/run-status-visualization/plan.md"
artifact_sha256: "00f5db5b2fc759cae8fbbc9b2dc09fdf54d7178b37b7741a5d1072a4a6830a9d"
repo_root: "."
git_head_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "See plan.md Review Reconciliation for full notes."
raw_output_path: "docs/workflows/run-status-visualization/reviews/plan.gemini.architecture-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

1.  **Critical Flaw in API Implementation:** The plan for Wave 1 is incomplete. It specifies adding the `byModel` field to the `runProgress` block within the client-side GraphQL fragment (`RUN_WITH_TRANSCRIPTS_FRAGMENT`), but it **completely omits the corresponding backend implementation** for this field in the API. When the web client executes this updated query, the GraphQL server will not have a resolver for `runProgress.byModel`, leading to immediate query failures and a broken UI.

2.  **Contradictory UI Data Sourcing:** The "Model-to-provider mapping strategy" for Wave 2 is fundamentally unsound. It states it will derive model IDs from `provider.recentCompletions`, but the plan also explicitly documents the **removal of the `RecentCompletionsFeed` component**, which is the most likely source of this data. The plan fails to explain how the new `ProviderCard` will get the `recentCompletions` data it depends on, or how it will map models to providers without it.

3.  **Inefficient Throughput Calculation:** The `computeRatePerMin` function is designed to run on every render. It filters a potentially large `completions` array based on `Date.now()`. This is a performance-intensive operation that is not memoized. This will cause excessive computation on every re-render, leading to UI lag, especially when completion events are frequent.

## Residual Risks

1.  **Insufficient Verification for UI Rewrite:** The verification for Wave 2 relies on running existing tests for a component that is undergoing a "full rewrite." This is a weak validation strategy. The plan carries a significant risk that the new implementation has flaws that are not covered by the old test suite. It should include a dedicated task for writing new tests that target the new props and complex rendering logic.

2.  **Ambiguous `totalRetries` Aggregation Scope:** The Wave 1 plan describes a `totalRetries` aggregation (`db.probeResult.aggregate`) inside the `run.ts` resolver, which typically handles a single entity. However, the client-side changes are in `runs.ts` (plural), and the verification plan doesn't specify whether this is for a list view or detail view. If used in a list context without proper batching (e.g., via DataLoader, which is not mentioned), this will create a classic N+1 query problem, hammering the database with a separate aggregation query for every run in the list.

3.  **Unstated Dependencies:** The plan assumes `PROVIDER_CONFIG` and `getProviderConfig` can be kept and will function correctly. However, these helpers may have depended on data structures or props from the `RecentCompletionsFeed` or `ProviderCard` components that are being removed. The plan does not verify their dependencies, creating a risk that they will fail at runtime.

## Token Stats

- total_input=1967
- total_output=612
- total_tokens=16203
- `gemini-2.5-pro`: input=1967, output=612, total=16203

## Resolution
- status: accepted
- note: See plan.md Review Reconciliation for full notes.
