---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/implementation.diff.patch"
artifact_sha256: "132c64c0ca7f787053b67da38dfc7c89e02d81e31adfdfeb94a9106408e57a06"
repo_root: "."
git_head_sha: "b4a15a9f"
git_base_ref: "424c0605"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Findings addressed: MEDIUM#1 Fix 1 extended to diff+closeout (factory_next_action.py). MEDIUM#2 concern ID collision Risk R5."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/diff.codex.correctness-adversarial.review.md.narrowed.txt"
narrowed_artifact_sha256: ""
coverage_status: "narrowed"
coverage_note: "Codex ran against a narrowed view of the large diff (1177 lines of relevant slice). Findings were produced and merged — the 'failed' resolution_status was a post-run validation mismatch, not a missing review. Content resolved in raw.txt."
---

# Review: diff correctness-adversarial

## Findings

- [UNVERIFIED] Medium: `recommended_next_action()` only applies the new `judge_next_action == "advance"` bypass to `spec`, `plan`, and `tasks`. `diff` and `closeout` still fall through to the old `manifest_exists/healthy` repair checks, so an unhealthy but judge-approved `diff` or `closeout` can still be sent to `repair_*_checkpoint`, which defeats the new advance semantics and can recreate the repair loop the patch is meant to stop.

- [UNVERIFIED] Medium: The new concern ID is not unique enough for the role it is now playing. `_concern_id()` and the state backfill both hash only `stage`, `judge`, `round_raised`, and the first 48 non-whitespace characters of reasoning. Two distinct concerns that share that prefix will collide, and because the ID is now surfaced as the operator handle in the PR body, a collision can point a manual resolve/defer/dismiss action at the wrong concern.

## Residual Risks

- `factory_review_specs.py` still matches severity tokens anywhere in the file, including quoted examples and fenced code blocks; the new tests explicitly pin that limitation, so false positives remain possible for reviews that mention `HIGH`/`MEDIUM` in non-finding text.
- The new invariant-warning output is only summarized in `status` and only the last five entries are shown, so repeated runs can hide older contradictions even though they remain in state.

## Resolution
- status: accepted
- note: Findings addressed: MEDIUM#1 Fix 1 extended to diff+closeout (factory_next_action.py). MEDIUM#2 concern ID collision Risk R5.
