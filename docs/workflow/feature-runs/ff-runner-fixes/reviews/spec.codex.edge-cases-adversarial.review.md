---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "026757984d1f921d93c5a73e8885d9882a5c0c36b55f767bdabe655968cbeae0"
repo_root: "."
git_head_sha: "95c4e50c40146980f88be52ac1f48cf3170178fc"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Round-2 findings (runner auto-accepted but content had MEDIUM/LOW findings — my Fix 2 regex gap): M#1 init/discover/parallel added to _STATE_MUTATING_COMMANDS. M#2 FR-004 clarified — only self-fields count for closure, annotations are display-only. LOW#3 heading regex tightened to require colon or EOL after severity word, with test fixture for ### HIGH availability and ## MEDIUM-term."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1. MEDIUM: The spec’s “post-run invariant” is not actually wired to every state-mutating command. `run_factory.py` only runs `_run_post_invariants` for the commands listed in `_STATE_MUTATING_COMMANDS`, but that list omits `init`, `discover`, and `parallel` even though all three mutate workflow state. That leaves the new contradiction guard blind to state introduced by those commands. [CODE-CONFIRMED] See [run_factory.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py#L102) and [run_factory.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py#L143), [factory_cmd_discover.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_discover.py#L27), [factory_cmd_implement.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_implement.py#L314).

2. MEDIUM: FR-004 / US1 scenario 3 mixes two different resolution sources. The spec implies a concern can be cleared by being referenced in plan annotations or by `--defer`, but the code’s concern lifecycle only treats the concern record’s own fields (`addressed_at`, `deferred_reason`, `dismissed_reason`) as resolution; annotations are collected for display, not used as closure signals. If implemented literally, the PR body and checkpoint gate can disagree about whether a concern is open. [CODE-CONFIRMED] See [factory_pr_body.py](/Users/chrislaw/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py#L32) and [factory_pr_body.py](/Users/chrislaw/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py#L69).

3. LOW: The broadened severity regex still has a heading false-positive hole. The heading branch matches any heading that starts with `HIGH`, `CRITICAL`, or `MEDIUM`, so headings like `### HIGH availability` or `### MEDIUM-term plan` will be treated as actionable even though they are just section titles. The spec says structural anchoring avoids prose false-positives, but this branch can still flag a non-finding heading. [CODE-CONFIRMED] See [factory_review_specs.py](/Users/chrislaw/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_review_specs.py#L55).

## Residual Risks

- Concern IDs are still derived from the first 48 non-whitespace characters of reasoning, so heavy paraphrasing can split one conceptual concern into multiple IDs. The spec acknowledges this, but the lifecycle is still fragile.
- The invariant only checks one contradiction class. Other mismatches between verdicts, reconciliation state, and stage health can still slip through until more guardrails are added.
- The regex test matrix is style-dependent. If reviewer output formats drift again, the fixtures and pattern list will need manual refresh even if the underlying issue is the same.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Round-2 findings (runner auto-accepted but content had MEDIUM/LOW findings — my Fix 2 regex gap): M#1 init/discover/parallel added to _STATE_MUTATING_COMMANDS. M#2 FR-004 clarified — only self-fields count for closure, annotations are display-only. LOW#3 heading regex tightened to require colon or EOL after severity word, with test fixture for ### HIGH availability and ## MEDIUM-term.
