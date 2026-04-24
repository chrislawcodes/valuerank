---
reviewer: "codex"
lens: "architecture-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/plan.md"
artifact_sha256: "dc061ea73545a86c8e1a615660bbab41b7247ccd464641c6a2d4090f1490c2e6"
repo_root: "."
git_head_sha: "b8d5934f8215b9d6e4bffd546f5abca8e9799c79"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/plan.codex.architecture-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan architecture-adversarial

## Findings

- Medium [CODE-CONFIRMED] The invariant hook is only best-effort, not a true postcondition. `run_factory.main()` calls `args.func(args)` before `_run_post_invariants(...)` and does not wrap the call in `try/finally`, so any state-mutating command that persists a bad state and then raises or exits early will skip the invariant check entirely. That weakens Fix 8 from “always catches contradictions after mutation” to “catches them only on clean exits.” Evidence: [/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py:438-449] and [/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_invariants.py:90-131].
- Medium [CODE-CONFIRMED] The plan introduces a concern lifecycle UX without a write path in the shipped CLI. `factory_pr_body.py` will render “Resolved Concerns” only when `addressed_at`, `deferred_reason`, or `dismissed_reason` are already set, but `run_factory.py` exposes no `checkpoint --address/--defer/--dismiss <id>` surface for judge concerns, and the only writer shown here still only appends new unresolved concerns from judge verdicts. That makes the new concern lifecycle effectively read-only in this PR, so the separate resolved block is not operational yet. Evidence: [/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py:291-375], [/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py:32-47], [/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py:129-153], [/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_judge.py:906-916].

## Residual Risks

- The new invariant is intentionally narrow. It only flags the specific `judge_next_action == "advance"` versus `repair_<stage>_checkpoint` contradiction, so other bad next-action combinations will still rely on tests or manual review to surface them. Evidence: [/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_invariants.py:48-81].
- Warning history is bounded and partially summarized. `invariant_warnings` is capped at 100 entries, and `status --slug` shows only the last 5, so older contradictions can fall out of operator view even while the state remains inconsistent. Evidence: [/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_invariants.py:40-45] and [/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_status.py:220-226].

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 