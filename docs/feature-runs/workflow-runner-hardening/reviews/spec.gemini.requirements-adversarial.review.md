---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflows/workflow-runner-hardening/spec.md"
artifact_sha256: "802b0426b15ab95e912bc996b13cf0adf3f4178da04e1eb0e6421c89ad63fe6f"
repo_root: "."
git_head_sha: "c526eec446cdaf814b7c52e69e385dd4fe47894f"
git_base_ref: "origin/main"
git_base_sha: "d5d05171abe1c55f411c5ca826872b49c50849cd"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F1 (user base-ref nullified): REJECTED — the fix is inside the guard 'if marker_count > 0 and not args.base_ref:', so user-supplied base refs are already excluded. The spec now includes an explicit note on this. F2 (incomplete repair for closeout): ACCEPTED — spec now clarifies only unhealthy-manifest is repairable; added reasoning for why missing-artifact is not in scope. F3 (brittle acceptance): ACCEPTED — acceptance criterion updated to test behavior not implementation. F4 (other hardcoded strings): ACCEPTED — added step to scan file for all hardcoded model strings."
raw_output_path: "docs/workflows/workflow-runner-hardening/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

1.  **(High) Dangling User-Supplied Base Ref:** The fix for P0.2 only addresses the case where the tool automatically selects a `base_ref`. It fails to account for a user explicitly providing a `--base-ref` via the command line. If a user supplies a `base_ref` that later becomes a dangling SHA (e.g., after a `git rebase`), the logic inside `if marker_count > 0 and not args.base_ref:` is skipped entirely. The tool would then proceed to `preferred_diff_base_ref` with a stale, non-existent ref, leading to a corrupt or meaningless diff. The tool should validate that any user-supplied `base_ref` exists before use.

2.  **(Medium) Incomplete Test Plan for Base-Ref Resets:** The acceptance criteria for P0.2 correctly identifies the need to test the behavioral outcome of setting `args.base_ref = None`. However, it only specifies mocking a state for the `dangling SHA` reset path. The fix is being applied to three separate reset paths (`index overflow`, `markers-sha mismatch`, `dangling SHA`). The test plan is insufficient as it does not require verification that the other two reset triggers also lead to the correct `base_ref` behavior.

3.  **(Low) Ambiguous "Skippable" Behavior in Repair:** The fix for P0.1 states that `missing-artifact` and `stub-artifact` in the `closeout` stage should be "skippable." This behavior is not rigorously defined. It assumes the repair command's loop will silently continue. If the default behavior for other stages is to error or halt on a non-repairable status, this introduces an undocumented exception. The fix should explicitly define "skip" as "log the status and proceed to the next stage in the repair loop without error."

4.  **(Low) Search Scope for Hardcoded Models is Too Narrow:** The fix for P0.3 directs the implementer to search "the entire file" for other hardcoded model names. This scope is too restrictive. Another script within the same feature-workflow skill could be using the same hardcoded value. The search-and-replace action should be specified to cover the entire `docs/operations/codex-skills/feature-workflow/` directory to ensure all instances are caught, not just those in the primary `run_feature_workflow.py` file.

## Residual Risks

1.  **State Corruption via Race Conditions:** The spec explicitly puts file locking for `workflow.json` out of scope. This leaves a significant risk of state corruption. If a user runs a repair command at the same time a checkpoint is being written by another process, the two processes could overwrite each other's changes to `workflow.json`, resulting in an inconsistent state that the repair tool itself may not be able to fix.

2.  **Unhandled Artifact Corruption:** The repair logic for the `closeout` stage only addresses a stale `unhealthy-manifest`. It does not consider other potential failure modes, such as a syntactically invalid (e.g., malformed JSON) closeout artifact. If such a file exists, the tool may crash while trying to parse it, and the repair command would have no path to recovery.

3.  **Silent Failure on User-Supplied Bad Ref:** If the "Dangling User-Supplied Base Ref" finding is not addressed, a residual risk remains where the workflow proceeds with a bad ref supplied by the user. This could lead to a silent failure where an empty or incorrect diff is generated and subsequently approved, allowing incorrect history to be recorded or incorrect code to be merged.

## Token Stats

- total_input=2456
- total_output=779
- total_tokens=17115
- `gemini-2.5-pro`: input=2456, output=779, total=17115

## Resolution
- status: accepted
- note: F1 (user base-ref nullified): REJECTED — the fix is inside the guard 'if marker_count > 0 and not args.base_ref:', so user-supplied base refs are already excluded. The spec now includes an explicit note on this. F2 (incomplete repair for closeout): ACCEPTED — spec now clarifies only unhealthy-manifest is repairable; added reasoning for why missing-artifact is not in scope. F3 (brittle acceptance): ACCEPTED — acceptance criterion updated to test behavior not implementation. F4 (other hardcoded strings): ACCEPTED — added step to scan file for all hardcoded model strings.
