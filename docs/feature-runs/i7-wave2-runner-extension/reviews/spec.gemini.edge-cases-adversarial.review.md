---
reviewer: "gemini"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/i7-wave2-runner-extension/spec.md"
artifact_sha256: "f10085e11cdefe022cee5f769421e41f864442b0f3371957c44cd783f199c392"
repo_root: "."
git_head_sha: "c16754b277e7f93f31eb63486dc5be9dc6320105"
git_base_ref: "origin/main"
git_base_sha: "1bc92c5502d64397cd53f28fed52f4f58ff07934"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Wave 2 implementation complete and tested. Spec is accurate."
raw_output_path: "docs/feature-runs/i7-wave2-runner-extension/reviews/spec.gemini.edge-cases-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

1.  **Implicit Trust in Migration Logic:** The spec's most significant vulnerability is its reliance on `migrate_discovery_state()` without defining its behavior under non-ideal conditions. The instruction not to touch `factory_state.py` exacerbates this risk.
    *   **Edge Case:** What happens if the migration is run on a state that is already partially or fully V2? The function must be idempotent to prevent data duplication or corruption.
    *   **Edge Case:** What if the V1 `merged` blob is missing expected keys or contains malformed data? The migration could crash or produce a corrupted V2 state. Without the V1 version guard (to be removed), this corrupted state would be processed, risking downstream failures.
    *   **Omission:** There is no mention of error handling. If `migrate_discovery_state()` fails, does the program exit gracefully, or does it proceed with a half-migrated, invalid state?

2.  **Ambiguous CLI Flag Behavior:** The specification for the new V2 flags lacks precision, leaving critical implementation details undefined.
    *   **Edge Case:** How should the system handle repeated flags (e.g., `... --answer "First" --answer "Second"`)? Should it append to a list, overwrite the previous value, or throw an error?
    *   **Edge Case:** What is the expected behavior for empty arguments (e.g., `... --resolve ""`)? Should this be treated as a valid but empty input or an error?
    *   **Omission:** The spec does not define validation rules between flags. For example, can an item be marked as both `--unresolved` and a `--non-goal` in the same execution? Allowing contradictory state changes can lead to logical inconsistencies.

3.  **Testing Scope is Insufficient:** The verification plan focuses on the happy path for the new CLI flags but overlooks critical tests for the migration process itself.
    *   **Omission:** The test plan does not explicitly require tests for migration idempotency (running on V2 state), robustness against malformed V1 data, or behavior on failure.
    *   **Weakness:** "6+ new tests for V2 flag behavior" is too vague. It provides no confidence that adversarial cases (like repeated flags or conflicting mutations) will be covered.

4.  **Risk of Downstream System Failure:** The "Do Not Touch" constraint on `command_checkpoint()` creates a serious integration risk. The `discover` command will now produce V2 state blobs, but there is no guarantee that the `checkpoint` command (or any other part of the system reading this state) can correctly interpret them. This could break the primary user workflow.

## Residual Risks

1.  **Data Corruption/Loss:** The primary risk is that a failed or partial migration could produce an invalid state that, with the version guard removed, gets committed to disk. This could make the state file unreadable by any version of the tool, leading to permanent loss of discovery data.

2.  **Inconsistent State and Unpredictable Behavior:** Without clear rules for the new CLI flags, a user could inadvertently create a logically inconsistent state (e.g., an item is both deferred and resolved). This would lead to unpredictable behavior in status reporting and any downstream logic that consumes this state.

3.  **Broken End-to-End Workflow:** Even if the `discover` command works perfectly, the feature introduces the risk of breaking the `checkpoint` command. A user could successfully mutate a discovery with V2 flags, only to find they cannot checkpoint their work, rendering the new functionality useless in practice.

## Token Stats

- total_input=1553
- total_output=768
- total_tokens=15406
- `gemini-2.5-pro`: input=1553, output=768, total=15406

## Resolution
- status: accepted
- note: Wave 2 implementation complete and tested. Spec is accurate.
