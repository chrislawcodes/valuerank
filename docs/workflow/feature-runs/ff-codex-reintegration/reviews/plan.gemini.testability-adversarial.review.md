---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-codex-reintegration/plan.md"
artifact_sha256: "1ab2331c6d86b01698c6ca268ae5840b6dde43c6b10178bf281142119524d872"
repo_root: "."
git_head_sha: "80a77301dc580237a047b7093138f47ab77402ee"
git_base_ref: "origin/main"
git_base_sha: "80a77301dc580237a047b7093138f47ab77402ee"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/ff-codex-reintegration/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

### High Severity

| Finding ID | Slice | Description |
| :--- | :--- | :--- |
| **TEST-H-01** | Slice 5 | The plan correctly identifies the critical write order (artifacts first, then state) to prevent inconsistent state in case of a crash. However, it proposes to "Document this in the module docstring" rather than testing it. A test should be added that simulates a crash after artifact writing (e.g., by mocking the state update call to raise an exception) and asserts that the state file remains unmodified while the orphaned artifact directory exists. This verifies the crash-safety of the command, which is more robust than a documentation note. |

### Medium Severity

| Finding ID | Slice | Description |
| :--- | :--- | :--- |
| **TEST-M-01** | Slice 3 | The freshness logic depends on helpers like `_added_code_lines` which re-run `git diff` and `is_ancestor_of_head` which runs `git merge-base`. The plan doesn't specify testing the failure modes of these underlying `git` commands (e.g., `subprocess.run` raising an exception, returning non-zero with stderr, or timing out). The helpers should be tested to ensure they handle these failures gracefully (e.g., returning `None` or `False`) and that the main `check_implementation_rule` logic correctly interprets these "can't-compute" signals as "not fresh" without crashing. |
| **TEST-M-02** | Slice 4 | The atomicity of the `advance` command relies entirely on `factory_state.update_state` being atomic, but this is "verified by inspection". Relying on inspection for a critical atomicity guarantee is a significant test gap. While re-testing the helper is redundant, the test for `command_advance` should at least mock `factory_state.update_state` and assert it's called exactly once with all required data (`judge_next_action` and the new annotation) in a single call, confirming the command properly uses the atomic primitive. **[UNVERIFIED]** |
| **TEST-M-03** | Slice 2 | The plan relies on a manual `grep` to find all call sites of `check_implementation_rule` before changing its signature. This is brittle and error-prone. If a call site is missed, it will cause a `TypeError` at runtime. While a fully automated static check might be difficult, this finding highlights that the refactoring is high-risk and relies on a manual, non-repeatable verification step. The risk could be lowered by temporarily adding a compatibility shim and a `DeprecationWarning` to catch any missed callers during testing. The plan explicitly rejects this ("No boolean compatibility shim"). |
| **TEST-M-04** | Slice 5 | The "Atomic claim" logic for creating a dispatch directory via `mkdir` is tested for a `FileExistsError` but not for other filesystem errors (e.g., `PermissionError`). The test should mock `Path.mkdir` to raise other `OSError` subtypes to ensure the command fails cleanly with a useful error message instead of an unhandled exception. |

### Low Severity

| Finding ID | Slice | Description |
| :--- | :--- | :--- |
| **TEST-L-01** | Slice 1 | The test plan for the banner rename (Fix 4) asserts that `repair_<stage>_checkpoint` changes to `run_<stage>_checkpoint`. It does not explicitly test the negative case: that other "repair" messages like `repair_unhealthy_manifest` are *not* changed, as stated in the plan. This leaves a small gap in verifying the change was correctly targeted. |
| **TEST-L-02** | Slice 3 | The plan states that when multiple dispatch entries are fresh, the one with the lexicographically maximum `ts` is chosen. It doesn't explicitly describe how this is tested. A test should be created with a state fixture containing multiple fresh entries where the list order does not match the chronological (`ts`) order, and assert the correct entry is chosen deterministically. |
| **TEST-L-03** | Slice 5 | The plan notes the `head_sha` is captured *before* invoking Codex. The test plan should explicitly verify this call order. This can be done using `unittest.mock.Mock` call order assertions to confirm that the `git rev-parse HEAD` subprocess is called before the `codex exec` subprocess. |

## Residual Risks

| Risk ID | Description |
| :--- | :--- |
| **RISK-R-01** | The test strategy relies heavily on mocking `subprocess.run` at the boundary of Python scripts. There are no automated integration tests that invoke the `run_factory.py` CLI and exercise the logic with a real (but controlled) `git` repository. A manual smoke test is planned, but this is not a substitute for automated CI coverage. Subtle behavioral differences between a mocked subprocess and a real one, especially concerning shell quoting, environment variables, or unexpected stderr output from `git`, could be missed. |
| **RISK-R-02** | The robustness of `git merge-base --fork-point` in shallow clones is flagged as a known risk (R2), with the mitigation being to "skip-on-fail". The testing doesn't appear to simulate a shallow-clone environment where this command is known to be fragile. The failure might be more complex than the mock assumes, potentially leading to an unhandled error rather than a clean skip. |
| **RISK-R-03** | **[UNVERIFIED]** The entire test suite for the feature factory scripts appears to be unit-level. A failure in the argparse routing in `run_factory.py` (e.g., a decorator placed on the wrong command handler) would not be caught by any of the described tests, as they target the command modules (`factory_cmd_*.py`) directly. |

## Token Stats

- total_input=16732
- total_output=1309
- total_tokens=20168
- `gemini-2.5-pro`: input=16732, output=1309, total=20168

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
