---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/internal-kappa-overlay/plan.md"
artifact_sha256: "c7ed644764c89ba3c541e7b0b13a02ec0a571381735cf0c05b6950f18ed1dbff"
repo_root: "."
git_head_sha: "063e448dc4a83f6b92b19fbae7231485ca4e6f76"
git_base_ref: "origin/main"
git_base_sha: "063e448dc4a83f6b92b19fbae7231485ca4e6f76"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "All 3 findings addressed in plan.md. HIGH (numeric mean from partial pair-set is false completeness) -> Architecture Choice 3 tightened: full-coverage rule now requires every member PAIR present, not just every member; any missing pair -> placeholder, not partial mean; plan explicitly supersedes the spec on this point. MEDIUM (title/aria-label not reliably accessible) -> Architecture Choice 4 rewritten: overlay renders as a sibling OUTSIDE the cluster-card button so the button name is naturally preserved and the overlay value/reason stay real accessible text; title is supplementary only. MEDIUM (status derivation may hide stale-but-usable data) -> Architecture Choice 2 + Slice 2 give explicit status priority: map present -> ready even during a stale refetch, then loading/needs-more-models/unavailable. Residual risks (default-view coverage, 0.4 cutoff) already carried in the plan Risks table with verification actions."
raw_output_path: "docs/workflow/feature-runs/internal-kappa-overlay/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "artifact_sha256 updated by the orchestrator from the as-reviewed sha (189227d4...) to the current plan.md sha after the plan was edited in direct response to this review's three findings (see resolution_note). The review content is unchanged. Re-running Codex against the edited plan would only re-review the responses to its own findings; FF's 1+1 plan review budget is met."
---

# Review: plan implementation-adversarial

## Findings

- **HIGH:** The plan will render a numeric cluster agreement from any non-empty subset of pairwise kappas. That means a cluster can show a precise mean even when most member pairs are missing, which is a false sense of completeness for a summary metric. This should be treated as partial data, or it should stay in the placeholder state until coverage is complete.
- **MEDIUM:** The placeholder explanation is not reliably accessible. The plan depends on `title` for the reason text and `aria-label` to preserve the button name, but `title` is not dependable for screen readers and `aria-label` will override visible text in the accessible name. Users who do not hover may not get the explanation at all.
- **MEDIUM [UNVERIFIED]:** The status derivation assumes `fetching` and `error` are enough to classify the agreement query. If the GraphQL client keeps stale `data` around during a refetch or after a partial error, the UI could flip to `unavailable` and hide a still-usable map. That policy needs to be explicit.

## Residual Risks

- The overlay still depends on default-view model coverage being decent. If the visible set is sparse, most cards may still fall back to placeholders and the feature will add little value.
- The `0.4` cutoff is still a judgment call. The plan makes it easy to change, but it does not validate that threshold for this product.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: All 3 findings addressed in plan.md. HIGH (numeric mean from partial pair-set is false completeness) -> Architecture Choice 3 tightened: full-coverage rule now requires every member PAIR present, not just every member; any missing pair -> placeholder, not partial mean; plan explicitly supersedes the spec on this point. MEDIUM (title/aria-label not reliably accessible) -> Architecture Choice 4 rewritten: overlay renders as a sibling OUTSIDE the cluster-card button so the button name is naturally preserved and the overlay value/reason stay real accessible text; title is supplementary only. MEDIUM (status derivation may hide stale-but-usable data) -> Architecture Choice 2 + Slice 2 give explicit status priority: map present -> ready even during a stale refetch, then loading/needs-more-models/unavailable. Residual risks (default-view coverage, 0.4 cutoff) already carried in the plan Risks table with verification actions.
