---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/vignette-paired-analysis/plan.md"
artifact_sha256: "63eb1ee4be35af8b02968aa9024e118511c9b0866b3dfd1d98437837a41db28f"
repo_root: "."
git_head_sha: "3cba76c6b06a907df7d2daf6b766e4127962c0f3"
git_base_ref: "origin/main"
git_base_sha: "3cba76c6b06a907df7d2daf6b766e4127962c0f3"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "3-round cap reached."
raw_output_path: "docs/workflow/feature-runs/vignette-paired-analysis/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- **Medium**: The scoped-argument contract is inconsistent throughout the plan. A1 switches the API to `definitionId`, but Slice 1 still describes `getPressureSensitivityResult(definitionIds: string[] | null)`, Slice 2 calls the query with `definitionIds: [id]`, and Slice 4 tests `definitionIds` again. That is not a naming nit. It leaves the backend, client, and tests without one agreed shape.

- **Medium**: The plan does not define a complete result-state model for paired lookup. The main slices only expose `models`, `insufficient`, and `excludedDefinitions`, but Slice 4 and RR-8 require the UI to distinguish `not_paired`, `companion_missing`, `paired`, and `collision`. Without an explicit status in the backend contract, the page cannot reliably render the different banners the plan asks for.

- **Medium**: Signature divergence is still underspecified. Slice 2 says the new page derives a signature from both vignettes’ completed runs, while RR-7 says mismatched signatures must show an extra banner. The core slices never define the mismatch branch, so the shipped page can silently pick one signature and hide that the two directions were analyzed under different snapshots.

## Residual Risks

- The uncached scoped backend path still depends on a manual dev timing check. If dev data is smaller than production data, the 3-second budget check can miss a real regression.

- The legacy redirect path has several branches and only one explicit unit-test file. Mixed query-param cases and odd legacy URLs can still fall through unless the fixtures are very complete.

- The tombstone utility for legacy paired-run heuristics is intentionally deferred to a follow-up ticket. If that ticket is not tracked tightly, the deprecated path can linger longer than intended.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: 3-round cap reached.
