---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "a82f14b19712743bcdce071c4b6ca8eab51000fe4a7304d2fc203dfb82676f6f"
repo_root: "."
git_head_sha: "3938cb4ad255ede0fc735455a7d089ed8e075bed"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Addressed in spec: FR-001a (judge.py reorder) and FR-005a (PR body filter). All findings incorporated into updated spec.md."
raw_output_path: ""
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- HIGH [CODE-CONFIRMED]: The spec fixes the decision tree, but it does not fix the call site that actually persists and emits the next action. In `factory_cmd_judge.py:880`, `next_action = recommended_next_action(...)` is computed before `stage_state["judge_next_action"] = "advance"` is written in both advance branches. That means the judge command can still save a stale `last_action_result.next` and print the wrong banner on the same run, even if `factory_next_action.py:76` is updated.

- MEDIUM [CODE-CONFIRMED]: The new concern lifecycle is only defined in state, not in the human-facing rendering path. `factory_pr_body.py:32` renders every object in `unresolved_concerns` as an unresolved judge concern, and the spec never says to filter out entries once `addressed_at` or `deferred_reason` is set. As written, addressed or deferred concerns will still appear in the judge panel block as if they were open.

## Residual Risks

- The regex expansion is still bounded to the four new shapes listed in the spec. If reviewers start using a different structured format later, `auto-reconcile` can regress again unless the test matrix is updated.
- The concern-resolution flow will still depend on a clear convention for how operators see closed concerns versus open ones. If the PR-body block is left unchanged, the workflow will work but remain hard to audit by eye.

## Resolution
- status: accepted
- note: Addressed in spec: FR-001a (judge.py reorder) and FR-005a (PR body filter). All findings incorporated into updated spec.md.
