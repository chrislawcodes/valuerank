---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "ff794bfed6a87cc28adc461c386aabe6163b4aaaf74d4b4dd84a740555925377"
repo_root: "."
git_head_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Round-2 (fresh run) findings ALL ADDRESSED: (HIGH) factory_pr_body._concern_is_resolved no longer treats addressed_by as resolution — uses state-bearing fields (addressed_at/deferred_reason/dismissed_reason) to match FR-004 gate. (MEDIUM) Added repair and closeout to _STATE_MUTATING_COMMANDS in run_factory.py. (MEDIUM) Open-concerns block in factory_pr_body now prints the id field so operators can reference it for --address/--defer/--dismiss."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- HIGH [CODE-CONFIRMED]: FR-004 and FR-005a split the meaning of “resolved” in a way that will let the UI and the checkpoint gate disagree. The spec makes `addressed_at` the checkpoint gate, but the existing rendering logic already treats `addressed_by` as enough to move a concern into the resolved block, and it prints `addressed_by` as the resolution detail. That means a concern can look resolved in the PR body while still blocking the next checkpoint if only the evidence string is set. See [factory_pr_body.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py#L32-L42) and [factory_pr_body.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py#L117-L137), plus the concern schema in [factory_cmd_judge.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_judge.py#L181-L194).

- MEDIUM [CODE-CONFIRMED]: FR-009’s invariant hook list is incomplete. The spec names `checkpoint`, `judge`, `reconcile`, `auto-reconcile`, `implement`, `deliver`, and `block`, but the runner also exposes `repair` and `closeout`, and both mutate state through checkpoint calls. Because the invariant pass in `run_factory` only runs for command names in `_STATE_MUTATING_COMMANDS`, those flows will bypass the new contradiction warning entirely. See [run_factory.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py#L102-L105), [run_factory.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py#L268-L323), [factory_cmd_status.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_status.py#L238-L300), and [factory_cmd_deliver.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_deliver.py#L473-L589).

- MEDIUM [CODE-CONFIRMED]: The new concern-ID workflow is not operable from the human-facing output the spec updates. The unresolved concerns block in the PR body shows stage, judge, confidence, reasoning, and round history, but it does not print the `id` that the new `--address`, `--defer`, and `--dismiss` flags need. Only the resolved-concerns block includes the ID. That forces operators to open `state.json` just to recover the identifier. See [factory_pr_body.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py#L64-L73) and [factory_pr_body.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py#L93-L137).

## Residual Risks

- Older workflow snapshots still need read-time normalization for missing concern fields and invariant warnings. If any reader bypasses the shared state loader, it can still mis-handle legacy `state.json` shapes.
- The severity regex fix remains format-sensitive. Any new reviewer style that does not match the anchored patterns will need an explicit test and regex update, or auto-accept can regress again.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Round-2 (fresh run) findings ALL ADDRESSED: (HIGH) factory_pr_body._concern_is_resolved no longer treats addressed_by as resolution — uses state-bearing fields (addressed_at/deferred_reason/dismissed_reason) to match FR-004 gate. (MEDIUM) Added repair and closeout to _STATE_MUTATING_COMMANDS in run_factory.py. (MEDIUM) Open-concerns block in factory_pr_body now prints the id field so operators can reference it for --address/--defer/--dismiss.
