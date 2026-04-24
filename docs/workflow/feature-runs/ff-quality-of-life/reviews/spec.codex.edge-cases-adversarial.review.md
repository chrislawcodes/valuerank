---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-quality-of-life/spec.md"
artifact_sha256: "70c7715a932eaa6c8e8ac5f56422eaf2b5dd7ea3bdbd67841e9a4d584f670261"
repo_root: "."
git_head_sha: "51207c8bf078e076ea613e85c0b9abf3dd36ea7a"
git_base_ref: "origin/main"
git_base_sha: "29476d513f705290496288c4e580ba6890bc87ad"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/ff-quality-of-life/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1. HIGH [CODE-CONFIRMED] The spec points both CLI changes at the wrong module. The checkpoint defaults and discover flags are defined in [run_factory.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py#L303) and [run_factory.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py#L376), not in `factory_cmd_checkpoint.py` / `factory_cmd_discover.py`. If the spec is followed literally, the CLI surface will not change.

2. HIGH [CODE-CONFIRMED] `--validation-only` must explicitly bypass the adversarial round-cap early return. `command_checkpoint` exits as soon as `adversarial_rounds >= 3` before any manifest or review rewrite happens ([factory_cmd_checkpoint.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_checkpoint.py#L582) and [factory_cmd_checkpoint.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_checkpoint.py#L598)). Without a control-flow carve-out, the new mode cannot do the post-cap reseal that US2 requires.

3. MEDIUM [CODE-CONFIRMED] The reseal path also needs to refresh stage history, not just manifest/review SHAs. Restatement selection uses `stage_state["adversarial_sha_history"]` and `initial_sha` to decide what counts as “latest” ([factory_cmd_judge.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_judge.py#L344) and [factory_cmd_judge.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_judge.py#L406)). If validation-only only rewrites the manifest and review frontmatter, the next restatement round can misclassify the reviews as stale or find no latest findings at all.

4. MEDIUM [CODE-CONFIRMED] The new discovery clear flags are under-specified for standalone use. `command_discover` only accepts invocations that satisfy its current “has at least one update” guard and then branches on the existing `clear` flag ([factory_cmd_discover.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_discover.py#L59) and [factory_cmd_discover.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_discover.py#L189)). Unless the spec explicitly folds `--clear-non-goals` and `--clear-acceptance-criteria` into those guards, `discover --clear-non-goals` will still be rejected as a no-op.

## Residual Risks

- The restatement hardening is still prompt-level only. There is no mechanical check that the judge actually quotes prior reasoning text.
- The spec does not pin whether validation-only should also touch any other derived workflow metadata besides `artifact_sha256`, so implementation may still need a judgment call on state timestamps or annotations.
- The discovery append/dedup rule is exact-string only. If operators expect whitespace-normalized or case-insensitive deduplication, this spec will still allow near-duplicates.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
