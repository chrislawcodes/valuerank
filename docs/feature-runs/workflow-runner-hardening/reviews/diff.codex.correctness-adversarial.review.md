---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflows/workflow-runner-hardening/reviews/implementation.diff.patch"
artifact_sha256: "f46a0f655f4958c86beb72af9af40201de502bde96aeb50ebf7b7e36d5f36535"
repo_root: "."
git_head_sha: "3e90acf9d1c5a39a84582bc7bd354329ea0b8a3e"
git_base_ref: "f41c7b2"
git_base_sha: "f41c7b267e6e9bdbead376d8cfcd54908c87dffc"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "F1 (codex: base-ref cleared unconditionally): REJECTED — already guarded by 'if marker_count > 0 and not args.base_ref:'; user-supplied base refs are excluded. F2 (codex: stale closeout_state after earlier-stage repair): REJECTED — out of scope; repair is idempotent, subsequent run handles any newly stale closeout. R1 (gemini regression: multiple repair runs needed): REJECTED — same as F2; documented residual limitation, not a regression. Q1 (gemini quality: other hardcoded model strings): REJECTED — grepped entire file; only the two DEFAULT_* constants remain."
raw_output_path: "docs/workflows/workflow-runner-hardening/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. **High:** In [`run_feature_workflow.py`](file:///Users/chrislaw/valuerank/docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py#L1062), the new `args.base_ref = None` assignments clear the base ref unconditionally in all three reset branches. That also wipes any caller-supplied `base_ref`, so a checkpoint reset will silently ignore an explicit base selection and fall back to `preferred_diff_base_ref()` heuristics. The added tests only cover the stale `last_head` case, not an intentional upstream base ref.

2. **Medium:** In the new closeout repair block in [`run_feature_workflow.py`](file:///Users/chrislaw/valuerank/docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py#L1658), `closeout_state` is taken from the pre-repair `stages["closeout"]` snapshot and never refreshed after earlier stage repairs. If repairing an earlier stage changes closeout metadata or health, this block will still make its decision on stale state, which can produce a false block or a redundant closeout repair attempt.

## Residual Risks

- The closeout repair path still only handles `unhealthy-manifest`; if `stage_drift_class()` later broadens the set of repairable closeout failures, this code will bypass them unless it is updated in lockstep.
- The behavior of `repair_checkpoint_args()` and `command_checkpoint()` for closeout remains a coupling point; if either has side effects beyond manifest refresh, repeated repair attempts could still perturb workflow state.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: F1 (codex: base-ref cleared unconditionally): REJECTED — already guarded by 'if marker_count > 0 and not args.base_ref:'; user-supplied base refs are excluded. F2 (codex: stale closeout_state after earlier-stage repair): REJECTED — out of scope; repair is idempotent, subsequent run handles any newly stale closeout. R1 (gemini regression: multiple repair runs needed): REJECTED — same as F2; documented residual limitation, not a regression. Q1 (gemini quality: other hardcoded model strings): REJECTED — grepped entire file; only the two DEFAULT_* constants remain.
