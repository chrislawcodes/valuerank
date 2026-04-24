---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-runner-fixes/spec.md"
artifact_sha256: "4ab997afabde09d73e0680a192ec0043e351c24cf51bb3a5166a324de5aba32a"
repo_root: "."
git_head_sha: "3938cb4ad255ede0fc735455a7d089ed8e075bed"
git_base_ref: "origin/main"
git_base_sha: "424c0605a8158acfe0b3912840a6c5b2da057c84"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Addressed: dismiss action (FR-003/004); regex broadened (FR-006); reseal reason field (FR-002); invariant broadened (FR-010)."
raw_output_path: "docs/workflow/feature-runs/ff-runner-fixes/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. Mandatory Concern-Tracking Introduces Significant Scope Creep and Workflow Friction

**Severity**: MEDIUM
**Finding**: Functional Requirement `FR-004` transforms a bug fix into a new, complex feature by introducing a mandatory "unresolved concerns" verification step at every subsequent `checkpoint`. This is a significant expansion of scope beyond the stated problem of the decision tree ignoring a judge's verdict. The new workflow forces an orchestrator to explicitly address or defer every single concern from a prior stage, creating a new blocking point. Crucially, the proposed API (`checkpoint --address` and `checkpoint --defer`) omits a vital `dismiss` or `invalidate` action. This forces semantically incorrect states where an invalid finding must be "deferred" rather than removed, polluting the `unresolved_concerns` list and complicating future audits.

**Evidence**: `[UNVERIFIED]` — This finding is based on the logical requirements laid out in `spec.md` (`FR-003`, `FR-004`, and US1 Acceptance Scenario 3). The described behavior represents a fundamental change to the workflow logic, regardless of the current implementation which was not provided.

### 2. Proposed Severity-Detection Regex Is Still Brittle and Incomplete

**Severity**: MEDIUM
**Finding**: The proposed regular expression in `FR-006` for detecting actionable findings, while an improvement, remains brittle and fails to cover common Markdown variations. For example, the pattern `**(HIGH|CRITICAL|MEDIUM)[\s:\[]` is intended to match a bolded severity prefix. However, it will fail to match the extremely common pattern `**HIGH**: A finding.` because the character class `[\s:\[]` does not account for the closing `*` of the bold tag. The reliance on increasingly complex regex for what is fundamentally semantic extraction is a fragile strategy.

**Evidence**: `[UNVERIFIED]` — This finding is based on analyzing the regular expression described in `spec.md` (`FR-006`) against standard Markdown syntax. The implementation file `factory_review_specs.py` was not provided for confirmation.

### 3. Manifest Resealing Obscures Traceability of Unreviewed Changes

**Severity**: LOW
**Finding**: The proposed solution for handling manifest drift (`FR-002`) is to lazily reseal the manifest when `advance` is triggered. While this correctly moves the process forward and records that drift occurred, it implicitly blesses changes made *after* the judge panel's review was completed. The `annotations[]` entry records the `old_sha` and `new_sha`, but the semantic link to *why* the changes were made is lost. This weakens the audit trail, as code that was not subject to the formal judge verdict is advanced.

**Evidence**: `[UNVERIFIED]` — This finding is based on the logic described in `spec.md` (`FR-002` and US1 Acceptance Scenario 2). It's a critique of the specified workflow logic, for which the code is not required to validate the weakness.

### 4. Invariant Check Is Too Specific and Reactive

**Severity**: LOW
**Finding**: The invariant self-check proposed in `FR-010` is narrowly defined to catch the specific symptom of the bug in run-033 (`judge_next_action == "advance"` AND `recommended_next_action == "repair_<same stage>_checkpoint"`). This is a reactive fix. A more robust, proactive invariant would be based on the underlying principle: `IF judge_next_action == "advance" THEN recommended_next_action MUST NOT be a repair action for the current stage`. By coding to the specific symptom, there is a risk that other future states could lead to a similar, but not identical, contradiction that would not be caught.

**Evidence**: `[UNVERIFIED]` — This is a logical assessment of the requirement defined in `spec.md` (`FR-010`). It critiques the specified logic, not its implementation.

## Residual Risks

-   **Risk R1 (from spec, amplified)**: The broadened regex in Fix 2 is more complex, not just broader. This increases the risk of both false positives and false negatives from subtle formatting changes in reviewer output, making the `auto-reconcile` step appear unreliable. The test matrix described in `FR-008` must be exceptionally thorough to mitigate this.
-   **Risk R3 (from spec, amplified)**: The concern-verification system in `FR-004` is a major new source of friction. The lack of a `dismiss` capability for invalid concerns (as noted in Findings) means the `unresolved_concerns` list will become polluted with items that are perpetually deferred. This could lead to orchestrators habitually deferring all concerns just to move forward, defeating the purpose of the check.
-   **New Risk**: The three fixes are specified as independent, but they create a new complex interaction. An orchestrator could get blocked by the new concern-tracking (`FR-004`), manually edit the artifact to address it (causing SHA drift), and rely on the manifest-reseal (`FR-002`) to advance. This sequence of operations, while technically functional per the spec, completely bypasses the intended review loop and hides un-judged changes within a "drift" annotation, undermining the integrity of the workflow.

## Token Stats

- total_input=20982
- total_output=1152
- total_tokens=24927
- `gemini-2.5-pro`: input=20982, output=1152, total=24927

## Resolution
- status: accepted
- note: Addressed: dismiss action (FR-003/004); regex broadened (FR-006); reseal reason field (FR-002); invariant broadened (FR-010).
