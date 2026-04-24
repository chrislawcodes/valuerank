---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-safety-net/spec.md"
artifact_sha256: "4519e751b65d7f72d73c1f2323a8d751ae2c48dc293e83854252d503c60bcb18"
repo_root: "."
git_head_sha: "f274b57cc2b9bf75e7e01d2c1041461c7767dd81"
git_base_ref: "origin/main"
git_base_sha: "c07a4283ecdebffa57e8a2cccfa08c23e0f76a36"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (brittle veto): structured unaddressed_high_finding_ids field is now mandatory (FR-001). MEDIUM (registry authority): FR-009 derives from argparse. MEDIUM (GC race): FR-014 lock-before-GC. LOW (cross-ref state.json): FR-003 checks ground-truth state — if judge names an id that's already resolved, veto doesn't fire. LOW (static GC list): accepted as known limitation, list is named + test documents it."
raw_output_path: "docs/workflow/feature-runs/ff-safety-net/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. HIGH: Veto Trigger is Brittle and Unreliable

The core logic for the completeness veto (FR-002) depends on a case-insensitive regex match against the natural-language reasoning from the `completeness` judge. This is inherently fragile and can be defeated by simple variations in phrasing, leading to a critical failure mode where a legitimate block is ignored.

-   **False Negatives**: A judge reasoning like "The HIGH finding remains; it has not been addressed" or "High-sev concern is still open" would fail to match `unaddressed` and bypass the veto, allowing the feature to be merged despite the unresolved high-severity finding.
-   **False Positives**: A judge reasoning like "While not a HIGH finding, the unaddressed technical debt is a high priority to fix" could accidentally trigger the veto.

While the spec notes an optional structured signal (FR-016) would be more robust, it is not a required part of the feature. Relying on the regex fallback re-introduces the very risk the feature aims to eliminate: a high-severity concern slipping through the process due to a silent failure.

### 2. MEDIUM: Incomplete Guardrail for Command Registration [UNVERIFIED]

The test designed to ensure future commands are correctly decorated (FR-009) is scoped to functions following the `command_*` naming convention. As noted in the spec's own Risk R2, a developer could add a new command with a different name (e.g., `handle_migration`), which would not be detected by the test. The new command would escape the invariant self-check, re-introducing the class of bug this feature is meant to prevent.

The mitigation proposed in the spec (documentation and code comments) is insufficient for a guardrail. A more robust implementation would derive the master list of commands directly from the command-line argument parser that dispatches them, ensuring the test validates against the true source of authority for what commands exist.

### 3. MEDIUM: Potential Race Condition in Garbage Collection [UNVERIFIED]

The spec states that garbage collection (GC) of intermediate review files occurs "at the top of its execution" (FR-011) and relies on an existing state lock (`with_locked_state`) to prevent issues with concurrent runs (Risk R3). However, the exact sequence is not specified.

If the GC operation runs *before* the state lock is acquired, a race condition is created. One checkpoint process could delete intermediate files that a second, concurrent process is actively using or generating, leading to file-not-found errors or data corruption. The implementation must strictly enforce a `lock -> GC -> dispatch` sequence.

### 4. LOW: Veto Logic Does Not Cross-Reference Known State [UNVERIFIED]

The veto logic appears to only consider the judge's output string (FR-001, FR-002). Acceptance Scenario US1-AC2 implies that if a HIGH concern is addressed, the judge's vote is expected to change to `proceed`.

However, it does not specify what happens if the judge is not re-run or is run with stale context and continues to vote `block` on a concern that the system's own state (`state.json`) records as resolved. In this scenario, the veto would fire incorrectly based on stale information. The tally logic should validate any `unaddressed HIGH` claims from a judge against the ground-truth status of concerns in `state.json` before triggering a veto.

### 5. LOW: Garbage Collection Target List is Static

The GC logic deletes files based on a fixed list of glob patterns (FR-011). As noted in Risk R4, if a new type of intermediate file (e.g., `reviews/{stage}.*.summary.txt`) is added to the workflow in the future, it will not be automatically included in the GC process. This would require developer discipline to update the list, and failure to do so would slowly degrade the feature's value by allowing new classes of stale files to accumulate.

## Residual Risks

-   **Risk 1: Veto Bypass Through Ambiguity**: Even with an improved regex, the veto remains vulnerable. A `completeness` judge could write a blocking reason that is semantically clear to a human but too ambiguous for the pattern matching (e.g., "The primary objective of the highest-rated concern has not been met"). This would still result in a 2-of-3 override, undermining the feature's core purpose. The only complete mitigation is making the structured signal in FR-016 a mandatory requirement.
-   **Risk 2: State Drift from Manual Overrides**: The `--override-judges` escape hatch (FR-005) is a necessary but high-risk tool. Its use to bypass a legitimate completeness veto means the feature can be silently ignored. This creates a gap where the system's recorded state no longer reflects the true quality or risk posture of the feature, potentially misleading downstream processes or future developers who assume the automated checks are always enforced.
-   **Risk 3: Test Brittleness**: Tests for the completeness veto will depend on mocked judge reasoning strings. As judge prompts evolve, these tests will require corresponding updates. This creates a maintenance burden and a significant risk of drift between the tests and the live prompt, potentially leading to tests that pass while the production logic fails.

## Token Stats

- total_input=17116
- total_output=1142
- total_tokens=21226
- `gemini-2.5-pro`: input=17116, output=1142, total=21226

## Resolution
- status: accepted
- note: HIGH (brittle veto): structured unaddressed_high_finding_ids field is now mandatory (FR-001). MEDIUM (registry authority): FR-009 derives from argparse. MEDIUM (GC race): FR-014 lock-before-GC. LOW (cross-ref state.json): FR-003 checks ground-truth state — if judge names an id that's already resolved, veto doesn't fire. LOW (static GC list): accepted as known limitation, list is named + test documents it.
