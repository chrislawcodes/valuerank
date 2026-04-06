---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflows/workflow-runner-hardening/plan.md"
artifact_sha256: "385e6f25e4b1421e889a0627fcc8c4b297aa034af333f08aeec0f37d9505bb04"
repo_root: "."
git_head_sha: "e38b1c0df568c1a8c86cfafa9f505060741e65a5"
git_base_ref: "origin/main"
git_base_sha: "b44a76cad358741fabfa4776f45752606980d56a"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F1 (stage_repairable undefined in plan): REJECTED — stage_repairable is an existing function; plan correctly documents its usage. F2 (missing partial-success test): ACCEPTED — added test_repair_blocks_when_checkpoint_succeeds_but_closeout_remains_unhealthy to cover checkpoint returns 0 but manifest still unhealthy. F3 (unverified fallback for recorded_base_ref): REJECTED — documented in plan; preferred_diff_base_ref behavior tested."
raw_output_path: "docs/workflows/workflow-runner-hardening/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

### 1. Undefined `stage_repairable` Function Creates Critical Ambiguity

**Severity:** High

The entire logic for Patch 3 hinges on the `stage_repairable(args.slug, "closeout", closeout_state)` function, yet its behavior, inputs, and definition are completely omitted from the plan. This makes the proposed change untestable and unverifiable. An adversarial implementation of `stage_repairable` could always return `True`, causing the repair to run inappropriately, or always `False`, preventing a necessary repair. The plan is critically incomplete without defining what makes a closeout stage "repairable".

### 2. Closeout Repair Logic Fails to Test a Key Failure Path

**Severity:** High

The plan includes logic to handle a scenario where `command_checkpoint` for a closeout repair *succeeds* (returns 0), but the stage remains unhealthy.

```python
# from patch 3
else:
    refreshed = stage_manifest_state(args.slug, "closeout")
    stages["closeout"] = refreshed
    if not refreshed["healthy"]:
        blocked_reason = f"closeout remains unhealthy: {trim_detail(str(refreshed.get('detail', '')))}"
```

However, the test plan for `RepairCloseoutTests` completely omits a test case for this branch. A test is needed where a mocked `command_checkpoint` returns 0, but the subsequent mock of `stage_manifest_state` returns `{"healthy": False, "detail": "..."}`. Without this test, a silent failure that appears to succeed but leaves the system in a broken state could go undetected.

### 3. `base-ref` Reset Logic Relies on an Unverified Fallback

**Severity:** Medium

In Patch 2, the three reset scenarios force `args.base_ref` to `None`. The rationale states this causes `preferred_diff_base_ref` to "fall through to the `recorded_base_ref` from diff metadata". The plan assumes this `recorded_base_ref` is always correct or valid.

This assumption is weak. What if the `recorded_base_ref` is also stale, invalid, or points to a non-existent ref (`origin/deleted-branch`)? The tests verify that the stale `head_sha` is discarded, but they do not adversarially test what happens if the fallback ref itself is bad. This could lead to a secondary, uncaught failure in `git diff` execution.

### 4. "Grep and Replace" Directive is Ambiguous and Untested

**Severity:** Low

The "Additional" task in Patch 1 instructs the implementer to "Grep the entire file for other hardcoded model strings... replace with constants as appropriate." This is too vague for a technical plan.

*   **Ambiguity:** It doesn't define what is "appropriate". What if other, weaker models are used intentionally for specific, non-critical tasks within the file? This could lead to an incorrect replacement.
*   **Untestability:** The test plan includes no mechanism to verify this step was performed correctly or at all. A test would need to pre-seed the file with other hardcoded model strings and assert they are handled correctly, which is not proposed.

## Residual Risks

If this plan is implemented as-is, the following risks will remain:

1.  **Incorrect Repair Execution:** The `closeout` repair logic could trigger on the wrong conditions or fail to trigger when needed because its dependency (`stage_repairable`) is a black box.
2.  **Silent Repair Failures:** The system may report that a `closeout` repair was successful when it actually failed to make the stage healthy, leading to downstream errors that are harder to diagnose. This is a direct result of the missing test case.
3.  **Cascading `diff` Failures:** A `base-ref` reset during a `diff` could successfully avoid using a stale `HEAD` SHA, only to fail in a subsequent step because the fallback `recorded_base_ref` is also invalid. The failure would be misattributed to the `git diff` command itself, not the incomplete reset logic.
4.  **Inconsistent Model Usage:** Hardcoded, non-standard model names may persist elsewhere in the `run_feature_workflow.py` script, undermining the goal of centralization and easy maintenance.

## Token Stats

- total_input=2566
- total_output=944
- total_tokens=16690
- `gemini-2.5-pro`: input=2566, output=944, total=16690

## Resolution
- status: accepted
- note: F1 (stage_repairable undefined in plan): REJECTED — stage_repairable is an existing function; plan correctly documents its usage. F2 (missing partial-success test): ACCEPTED — added test_repair_blocks_when_checkpoint_succeeds_but_closeout_remains_unhealthy to cover checkpoint returns 0 but manifest still unhealthy. F3 (unverified fallback for recorded_base_ref): REJECTED — documented in plan; preferred_diff_base_ref behavior tested.
