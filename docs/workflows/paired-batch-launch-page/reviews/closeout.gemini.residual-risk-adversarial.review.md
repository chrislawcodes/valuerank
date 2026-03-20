---
reviewer: "gemini"
lens: "residual-risk-adversarial"
stage: "closeout"
artifact_path: "docs/workflows/paired-batch-launch-page/closeout.md"
artifact_sha256: "f9124a528048f19b142cfd5169886e960b8b49df55eb9adb66b872829084ca2d"
repo_root: "."
git_head_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
git_base_ref: "origin/domain-defaults-preamble-context"
git_base_sha: "266e3a9970b6f64da9708f66cf37a025d6db2d35"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflows/paired-batch-launch-page/reviews/closeout.gemini.residual-risk-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: closeout residual-risk-adversarial

## Findings

1.  **Unverified User Flow:** The verification section lists only component and unit tests. There is no mention of an end-to-end (E2E) test to confirm the entire user journey—from clicking the launch button on the `DefinitionDetail` page, through the new `StartPairedBatchPage`, to successfully creating a run on the backend. This omits verification of the critical integration points between the components and the API.
2.  **Hardcoded `PRODUCTION` Category:** The feature forces the `PRODUCTION` category onto all paired-batch launches. This removes user control and assumes paired-batch runs are never for testing or other non-production purposes. This is a flawed assumption that reduces functionality and could have downstream impacts on data filtering, analysis, and cost attribution.
3.  **Implicitly Scoped to `job-choice`:** The summary explicitly mentions that `DefinitionDetail` sends `job-choice` vignettes to the new path. It makes no mention of how other vignette types are handled. This implies a hidden, hardcoded constraint where the new flow may fail or be inaccessible for any vignette that is not of the `job-choice` type, a significant omitted case.
4.  **Dismissal of UI/UX Concerns:** The reconciliation dismisses loading and error copy issues as "design tradeoffs." From an adversarial perspective, this is a flaw. Inadequate feedback during loading can lead to duplicate form submissions, and unclear error states can cause user confusion and prevent successful task completion. These are correctness and usability bugs, not simply aesthetic choices.

## Residual Risks

1.  **Divergent Launch Methodologies:** The feature solidifies two separate, diverging code paths and user experiences for launching runs (modal for trials, dedicated page for paired-batches). This architecture increases future maintenance costs and cognitive load, as any change to the run submission process must now be implemented and tested in two places, increasing the likelihood of future inconsistencies and bugs.
2.  **Brittle `RunForm` Abstraction:** The `copyMode` prop is a superficial, short-term fix. It assumes the only difference required between launch types is button and field labels. The acknowledged risk is that as soon as the paired-batch flow requires different validation, controls, or logic, the shared `RunForm` component becomes an obstacle and will require a complex, likely breaking, refactor.
3.  **Precedent for Route Proliferation:** By creating a new, dedicated route for this specific workflow, the feature sets a precedent for avoiding a more scalable routing or component-based solution. The acknowledged risk of needing a "more explicit routing abstraction" in the future is likely to be realized as new workflows are added, leading to a fragmented system with a confusing number of single-purpose pages.

## Token Stats

- total_input=1559
- total_output=577
- total_tokens=14995
- `gemini-2.5-pro`: input=1559, output=577, total=14995

## Resolution
- status: open
- note: