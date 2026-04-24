---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "64a54910ad67fdd4b54e618d9f96b68b1fd5db4639f89e037aaad581c62481ba"
repo_root: "."
git_head_sha: "7b414cadc42e915c128f35f296d36dca61c9d85b"
git_base_ref: "origin/claude/friendly-aryabhata-9efbf7"
git_base_sha: "6f5ed232c83bbd0f51ac8419ac6fb9688b8b8fad"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **HIGH [CODE-CONFIRMED]** The auto-reconcile regex still has a code-fence bypass. The spec says FR-006/FR-007 should catch common HIGH/MEDIUM finding shapes while avoiding prose false positives, but the current test suite explicitly documents that a literal `- HIGH:` line inside a fenced code block still matches and is treated as actionable. That means a reviewer who quotes an example inside a markdown code fence can still be auto-rejected/accepted incorrectly, which is a real blind spot for the exact safeguard this spec is trying to add. Evidence: [factory_review_specs.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_review_specs.py#L20), [test_factory_review_specs.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/tests/test_factory_review_specs.py#L177).

- **MEDIUM [CODE-CONFIRMED]** FR-009 under-specifies the state-mutating commands that must get the post-run invariant check. The current runner already treats `discover` and `parallel` as mutating commands in the invariant dispatcher, and `init` also writes workflow state during bootstrap, but none of those are listed in the spec’s required command set. That leaves the guardrail off for discovery/parallel bookkeeping and for bootstrap state writes, which is exactly where future contradictions can be introduced before spec/plan work even starts. Evidence: [run_factory.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py#L105), [run_factory.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py#L145), [run_factory.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py#L447), [factory_cmd_discover.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_discover.py#L27), [factory_cmd_implement.py](/Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7/docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_implement.py#L351).

## Residual Risks

- The concern-ID hash is still sensitive to major rewording of the reasoning text, so the same issue can still split into multiple IDs if judges paraphrase aggressively.
- I did not verify the eventual `checkpoint --address/--defer/--dismiss` plumbing, so the exact failure behavior for those new flags remains an implementation risk until the code lands.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 