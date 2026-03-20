---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflows/workflow-two-mode-implementation/reviews/implementation.diff.patch"
artifact_sha256: "7bc261f4aad41760c7cf525b9972f622b4fef6ba5dc9d441f9226eb3817cbb43"
repo_root: "."
git_head_sha: "62666fcfc9d06334e1badbf69c327f26fbe70b25"
git_base_ref: "origin/main"
git_base_sha: "d5d05171abe1c55f411c5ca826872b49c50849cd"
generation_method: "codex-runner"
resolution_status: "deferred"
resolution_note: "F1 (command_doctor NameError): REJECTED — REPAIR constant is defined at line 48 of run_feature_workflow.py; command_doctor at line 1697 references it correctly. F2 (marker reset base_ref): DEFERRED — valid edge case: after rebase+reset, preferred_diff_base_ref may return stale suggested_base_ref from diff_review_budget_state; fix requires explicit None reset in reset paths. F3 (fallback artifact-only check): DEFERRED — pre-existing design, full input validation not in scope for this PR. F4 (repair_closeout not implemented): DEFERRED — valid gap, closeout was added after repair command was scoped, command_repair only iterates spec/plan/tasks/diff; future extension needed."
raw_output_path: "docs/workflows/workflow-two-mode-implementation/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- **High:** `command_doctor` will crash with a `NameError` because it references `REPAIR`, but no `REPAIR` path constant is defined anywhere in the patch. That makes the new `doctor` subcommand unusable as soon as it hits the tool map in `docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py`.
- **High:** The diff checkpoint marker reset path does not actually force a branch-base rerun. In `command_checkpoint`, a `[CHECKPOINT]` marker change or progress reset prints that it is “using branch base,” but the subsequent `preferred_diff_base_ref(...)` call can still substitute the stale recorded base or last-reviewed head from diff metadata. That means a marker edit can silently generate the next diff against the wrong commit, defeating the reset logic.
- **Medium-High:** `run_checkpoint_fallback` treats an existing review as reusable if the artifact hash matches, but it ignores other inputs that affect review validity: `git_base_ref`, context paths, dirty-path allowances, and model/lens changes. A fallback run can therefore accept a stale review file for a materially different checkpoint configuration and still pass verification.
- **Medium:** `recommended_next_action` can return `repair_closeout_checkpoint`, but `command_repair` never repairs `closeout` at all. That makes the status output point users at an action the tool cannot execute, leaving unhealthy closeout state effectively unrecoverable through the advertised repair flow.

## Residual Risks

- The new GH CLI integration is still highly environment-dependent. If `gh pr view`, `gh pr checks`, or `gh pr merge` behave differently across CLI versions, the delivery path can diverge from the code’s assumptions.
- `compose_closeout_text()` still uses a raw string split on `## Workflow Inventory`, so authored closeout prose containing that heading text could be truncated or rewritten unexpectedly.
- The fallback and repair flows now rely on several external review scripts honoring the new manifest fields exactly; there is still limited end-to-end coverage for those interactions.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: deferred
- note: F1 (command_doctor NameError): REJECTED — REPAIR constant is defined at line 48 of run_feature_workflow.py; command_doctor at line 1697 references it correctly. F2 (marker reset base_ref): DEFERRED — valid edge case: after rebase+reset, preferred_diff_base_ref may return stale suggested_base_ref from diff_review_budget_state; fix requires explicit None reset in reset paths. F3 (fallback artifact-only check): DEFERRED — pre-existing design, full input validation not in scope for this PR. F4 (repair_closeout not implemented): DEFERRED — valid gap, closeout was added after repair command was scoped, command_repair only iterates spec/plan/tasks/diff; future extension needed.
