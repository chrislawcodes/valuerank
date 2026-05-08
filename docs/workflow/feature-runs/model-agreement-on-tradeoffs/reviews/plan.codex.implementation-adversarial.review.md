---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/model-agreement-on-tradeoffs/plan.md"
artifact_sha256: "5629c6ee8540c3f61306b6c010c58d74a8a44d76c0eeca860309a797df48bd6b"
repo_root: "."
git_head_sha: "9c48754bdcf18289e4acbb9d6a4d74de0a47187e"
git_base_ref: "origin/main"
git_base_sha: "9c48754bdcf18289e4acbb9d6a4d74de0a47187e"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/model-agreement-on-tradeoffs/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

- High: Wave 2's `cohensKappa(observed, chance)` contract is incomplete. It says the helper must return `null` when `totalCells == 0`, but `totalCells` is not an input. That makes the empty-set rule impossible to enforce inside the helper and leaves room for `NaN`/`Infinity` bugs unless every caller adds a separate guard.
- Medium [UNVERIFIED]: Wave 1/A2 silently `skip`s any grouped cell map entry whose physical cell does not collapse to exactly two value-key entries. If the current snapshot can contain malformed, partial, or non-binary groups, those cells will disappear from the new metrics with no warning. That is a data-loss path, not just a cleanup path.
- Medium: The plan never defines whether `totalCells` and the support thresholds are based on raw cells or cells remaining after tie and low-trial exclusions. That is a problem because `totalCells >= 10`, `no overlap`, `excludedTiedCells`, and the default drilldown selection all depend on the same count. Right now the matrix, drilldown, and tooltip logic can end up speaking about different denominators.
- Medium [UNVERIFIED]: The rollout still assumes a safe deploy order even though Wave 5 deletes the old GraphQL field and resolver in the same change that introduces the new client path. If backend/frontend deployment order or rollback order is not exactly controlled, cached old clients will still hit the removed field and fail hard. The plan does not include a compatibility shim or feature flag.

## Residual Risks

- The `1.12.0` snapshot bump will still create a rebuild window on first access. The first `/models` request after deploy may stay pending until the refresh job finishes.
- The new exclusions for tied and low-trial cells may reduce usable data more than the synthetic tests suggest. Real signatures with many indecisive cells could end up with sparse or null matrix rows.
- The separate drilldown query adds another failure mode at selection time. If the matrix loads but the drilldown request fails or stays pending, the section can look partially broken unless the UI handles that state explicitly.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 