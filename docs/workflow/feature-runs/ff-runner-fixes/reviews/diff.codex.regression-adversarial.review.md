---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/implementation.diff.patch"
artifact_sha256: "132c64c0ca7f787053b67da38dfc7c89e02d81e31adfdfeb94a9106408e57a06"
repo_root: "."
git_head_sha: "55f130cde79344c09ac3c9f873a77abae390e6f9"
git_base_ref: "424c0605"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "All 4 findings addressed in follow-up commits: MEDIUM#1 invariant sweep now runs in finally block (catches contradictions even after exceptions). MEDIUM#2 set_json_mode no longer advertises dead FF_INVARIANT_EMIT path. MEDIUM#3 backfill int() now defensively catches TypeError/ValueError. LOW#4 empty Unresolved header is suppressed when only resolved concerns exist."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

- Medium: [run_factory.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py#L438)  
  The new post-run invariant sweep only executes after `args.func(args)` returns. If a state-mutating command writes partial state and then raises, `main()` exits before `_run_post_invariants()` runs, so the contradiction check never records the bad state. That leaves the new guard blind to the exact failure mode it is meant to catch.

- Medium: [factory_invariants.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_invariants.py#L148)  
  `set_json_mode()` advertises `FF_INVARIANT_EMIT=stderr|stdout`, but `_emit_target()` is hard-wired to `sys.stderr`. The stdout path is effectively dead, so any wrapper or test that expects the documented override to move warnings off stderr will not work.

- Medium [UNVERIFIED]: [factory_state.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_state.py#L411)  
  The new backfill path converts `round_raised` with `int(concern.get("round_raised") or 0)`. If any existing concern in a real run stores `round_raised` as a non-numeric string or other malformed value, simply loading the workflow state will now raise and block the run. This depends on existing data shape, so I am marking it unverified.

- Low: [factory_pr_body.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_pr_body.py#L91)  
  When only resolved concerns exist, `render_judge_panel_block()` still emits the `## ⚠ Unresolved Judge Concerns` heading before the new resolved section. That leaves an empty open-issues block in the PR body, which is confusing and can be misread as unresolved work still present.

## Residual Risks

- I did not validate the existing workflow-state corpus, so the backfill failure mode on malformed `round_raised` values remains a data-dependent risk.
- I did not inspect every mutating command path to see whether any of them can raise after persisting state, so the missed-invariant-window risk may be broader than the one call site shown here.
- The new review-regex expansion and judge-panel rendering changes may still have edge-case false positives or false negatives outside the cases covered in the diff.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: All 4 findings addressed in follow-up commits: MEDIUM#1 invariant sweep now runs in finally block (catches contradictions even after exceptions). MEDIUM#2 set_json_mode no longer advertises dead FF_INVARIANT_EMIT path. MEDIUM#3 backfill int() now defensively catches TypeError/ValueError. LOW#4 empty Unresolved header is suppressed when only resolved concerns exist.
