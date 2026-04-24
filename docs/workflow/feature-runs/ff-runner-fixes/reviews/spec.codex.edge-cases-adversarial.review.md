---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "ff794bfed6a87cc28adc461c386aabe6163b4aaaf74d4b4dd84a740555925377"
repo_root: "."
git_head_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Round-2 (fresh) findings ALL ADDRESSED: (M#1) repair/closeout added to _STATE_MUTATING_COMMANDS. (M#2) _run_post_invariants now uses reconciliation_state() for recon_ok — FR-011b. (M#3) _concern_is_resolved aligned with FR-004 gate (state-bearing fields only). (M#4) PR body open-concerns block prints id."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **Medium [CODE-CONFIRMED]**: FR-009 does not cover all state-mutating entry points. `run_factory.py` only post-checks `{"checkpoint", "judge", "reconcile", "auto-reconcile", "implement", "deliver", "block"}`, but `repair` and `closeout` are also user-facing commands and both mutate workflow state by calling `command_checkpoint()`. That leaves the new contradiction guard able to miss the same bad state on two important paths. [run_factory.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py#L102) [factory_cmd_status.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_status.py#L238) [factory_cmd_deliver.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_deliver.py#L473)

- **Medium [CODE-CONFIRMED]**: The invariant check is being evaluated against the wrong decision context. `_run_post_invariants()` hardcodes `recommended_next_action(..., True)`, while the real checkpoint path computes the next action from the actual reconciliation state. If reconciliation is blocked, the warning can be computed against a branch the user would never see, which makes the contradiction detector unreliable in edge states. [run_factory.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py#L116) [factory_cmd_checkpoint.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_checkpoint.py#L146)

- **Medium [CODE-CONFIRMED]**: FR-005a splits the meaning of “resolved” from the code that already exists. The spec’s unresolved filter only excludes concerns with `addressed_at`, `deferred_reason`, or `dismissed_reason`, but `factory_pr_body.py` already treats `addressed_by` as enough to move a concern into the resolved block and prints that field as the resolution detail. A concern with only evidence attached will therefore be classified one way by the UI and another way by the spec’s filter. [factory_pr_body.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py#L32) [factory_pr_body.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py#L123)

- **Medium [CODE-CONFIRMED]**: The new concern lifecycle is not actually operable from the open-concerns view the spec preserves. `render_judge_panel_block()` prints stage, judge, confidence, reasoning, and round history for unresolved concerns, but it does not print the `id` that the proposed `--address`, `--defer`, and `--dismiss` flows need. Only the resolved-concerns block includes the ID, so operators still have to inspect `state.json` to recover it. [factory_pr_body.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py#L93) [factory_pr_body.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py#L117)

## Residual Risks

- Legacy `state.json` readers that bypass the shared loader can still miss the new defaulting behavior for `invariant_warnings` and concern fields. The spec assumes read-time normalization, but that only helps if every path actually uses the shared accessors.
- The regex fix is still format-bound. Any reviewer style that falls outside the anchored markdown shapes in FR-006 will remain invisible to `auto-reconcile` until someone adds a new pattern and a regression test.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Round-2 (fresh) findings ALL ADDRESSED: (M#1) repair/closeout added to _STATE_MUTATING_COMMANDS. (M#2) _run_post_invariants now uses reconciliation_state() for recon_ok — FR-011b. (M#3) _concern_is_resolved aligned with FR-004 gate (state-bearing fields only). (M#4) PR body open-concerns block prints id.
