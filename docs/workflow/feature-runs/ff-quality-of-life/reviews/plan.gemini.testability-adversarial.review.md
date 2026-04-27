---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-quality-of-life/plan.md"
artifact_sha256: "ca93ee59c09306c70321feb23ce0baf82c50239fbd4f9f7c00729fd2b09dbf73"
repo_root: "."
git_head_sha: "3b06bc99aa6b877dd16a078c1e70c811418e60ea"
git_base_ref: "origin/main"
git_base_sha: "29476d513f705290496288c4e580ba6890bc87ad"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Addressed during spec/plan/tasks rounds (see plan.md reconciliation for rollup)."
raw_output_path: "docs/workflow/feature-runs/ff-quality-of-life/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

### HIGH

*   **Transactional Integrity of Validation Reseal Is Under-specified.** The plan for `--validation-only` correctly specifies testing the atomicity of the SHA updates across multiple files. However, it states the process will "Append `{type: "validation-only-reseal", ...}`" to the stage annotations. It does not specify *when* this occurs relative to the file writes, nor what happens if the file writes succeed but the annotation write fails (or vice versa). **A test case is missing** to confirm that the annotation is *only* written if and only if the full set of artifact reseals succeeds. A mid-run failure should roll back *both* the file changes and any attempt to write the annotation.

### MEDIUM

*   **[UNVERIFIED] Graceful Handling of Corrupt State Is Not Tested.** The `--validation-only` implementation plan assumes that all review files it needs to read have well-formed YAML frontmatter and contain the `artifact_sha256` key. It does not specify behavior if a file is corrupt, has malformed YAML, or is missing the key. Tests should be added for these failure modes to ensure the command exits gracefully with a clear error message (e.g., "Error parsing frontmatter in file X") rather than crashing.
*   **[UNVERIFIED] Definition of String De-duplication Is Ambiguous.** The `discover` command plans to de-duplicate appended non-goals and acceptance criteria by "exact string match". This is not fully specified. The tests should clarify and verify the desired behavior for strings that differ only by leading/trailing whitespace or case (e.g., is `" my criteria "` the same as `"my criteria"`? Is `"Example"` the same as `"example"`?). Without explicit tests, the behavior is ambiguous and may lead to unexpected duplicates or incorrect filtering.
*   **Pre-check for Atomic Write Is Incomplete.** The pre-check for `--validation-only` tests if the target review files are writable. However, the `os.replace` pattern for atomic writes requires creating a temporary file in the same directory. The pre-check does not verify that the *directory* containing the review files is writable, which could cause the `atomic_write` helper to fail after the pre-check has already passed. A test case where the file is writable but the parent directory is not should be added.

### LOW

*   **[UNVERIFIED] Argparse Default Test Is Too Simplistic.** The plan to "verify argparse defaults resolve" for char budgets is insufficient. A robust test would verify not just that the default value is present, but that it is correctly overridden by a command-line argument, and that the command fails appropriately if a non-numeric or invalid value is provided via the command line.
*   **[UNVERIFIED] Mutex Enforcement Mechanism Is Unspecified.** The plan states `--validation-only` is mutually exclusive with four other flags and that this will be tested. However, it's unclear if this is enforced by `argparse` itself (which is robust) or by manual post-parsing logic. If manual, it's more fragile. The test should specifically assert that the command fails with the expected `argparse` conflict error message, which confirms the more robust implementation and better user experience.

## Residual Risks

*   **Risk of Inconsistent State:** The plan has a strong focus on atomicity for the `--validation-only` feature, but the logic is complex. A residual risk remains that an un-tested error condition (e.g., disk full during write, unexpected OS-level error) could interrupt the process, leaving the system in an inconsistent state where some files are updated and others are not, and the manifest annotation does not reflect reality. The "mid-run failure" test is a good mitigation, but it cannot cover all possible hardware or OS-level failure modes.
*   **Risk of User Misunderstanding Complex CLI Behavior:** The "clear-then-append" semantics for the `discover` command, where flag order within a single command matters (e.g., `--non-goal A --clear-non-goals --non-goal B`), is powerful but non-standard for CLI tools. Even with documentation and testing, there is a residual risk that users will find this behavior surprising and misuse the feature, leading to unintentionally cleared or omitted data in their specifications.

## Token Stats

- total_input=2245
- total_output=922
- total_tokens=17087
- `gemini-2.5-pro`: input=2245, output=922, total=17087

## Resolution
- status: accepted
- note: Addressed during spec/plan/tasks rounds (see plan.md reconciliation for rollup).
