---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-quality-of-life/spec.md"
artifact_sha256: "ef0fe4e58d4772e6f4d2656fd004979cddd4585ca188ef3c267af42e6d40b1f1"
repo_root: "."
git_head_sha: "3165f5ec0a8db61ff954e72ec15aa075c80a1daa"
git_base_ref: "origin/main"
git_base_sha: "29476d513f705290496288c4e580ba6890bc87ad"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/ff-quality-of-life/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Evidence Tag |
| :--- | :--- | :--- |
| MEDIUM | **(Fix 2)** The `--validation-only` feature builds on a fragile design where the artifact SHA is not stored in the central manifest. | `[UNVERIFIED]` |
| MEDIUM | **(Fix 2)** The manifest re-sealing process can fail in a non-atomic way, leaving the audit trail incomplete. | `[UNVERIFIED]` |
| LOW | **(Fix 3)** The "restatement judge gaming" mitigation relies solely on prompt engineering, which is a non-deterministic control. | `[UNVERIFIED]` |
| LOW | **(Fix 2)** The CLI design for `--validation-only` increases operator burden by disallowing combined actions, creating room for human error. | `[UNVERIFIED]` |
| LOW | **(Fix 4)** The deduplication logic for `discover` CLI flags is simplistic and may allow functionally duplicate entries. | `[UNVERIFIED]` |

### MEDIUM: (Fix 2) Distributed Source of Truth for Artifact SHA

The `--validation-only` feature is designed to synchronize SHAs between an artifact and its review files. However, `FR-005` states that the central checkpoint manifest (`reviews/{stage}.checkpoint.json`) does not itself store the `artifact_sha256`. Instead, the authoritative source is the `artifact_sha256` field scattered across the frontmatter of multiple individual review files.

This is an architectural weakness. A manifest should serve as the single source of truth. Relying on multiple distributed files to determine a critical piece of state like the artifact hash is brittle. If a review file is corrupted, deleted, or becomes unreadable, the validation logic may fail or produce an incorrect state. While the spec proposes pre-checks (`FR-005`), this patches over the symptom rather than fixing the root cause of a weak manifest design. This finding is rated MEDIUM instead of HIGH only because the relevant code is not available for inspection.

**Evidence**: `[UNVERIFIED]` — The spec itself (`FR-005`) describes this architectural limitation, but the code for `checkpoint_manifest()` was not provided for confirmation.

### MEDIUM: (Fix 2) Potential for Incomplete Audit Trail

`FR-005` specifies that review files should be updated atomically (`write to temp file then os.replace`), but `FR-007` requires that an annotation be appended to `stages[stage].annotations[]` without specifying similar atomicity or failure handling.

A failure could occur after the review files are successfully re-sealed but before the annotation is written. This would result in a state change (the manifest is re-sealed) without a corresponding record in the audit trail, undermining the stated goal of making the action visible (`Residual Risks`, `R2`).

**Evidence**: `[UNVERIFIED]` — The implementation code for the `command_checkpoint` function does not exist yet to verify the transactional nature of the annotation write.

### LOW: (Fix 3) Over-reliance on Prompt Engineering for Security

`FR-008` and `FR-011` confirm that the mitigation for a "bad-faith operator" gaming the review system is a change to a prompt (`judge-prompts/restatement.md`), not a change to the schema or validation logic.

While this lowers the probability of the attack, prompt-level enforcement is not deterministic. An LLM judge could fail to follow the instruction to quote evidence, especially if other parts of the prompt guide it toward a "proceed" verdict. This accepts the risk that a sophisticated actor could still bypass the control.

**Evidence**: `[UNVERIFIED]` — The finding is based on the description of the prompt change in the spec; the efficacy of prompt-level controls is inherently probabilistic.

### LOW: (Fix 2) Increased Operator Toil and Error-proneness

The spec's edge case handling for `--validation-only` explicitly makes it mutually exclusive with concern-lifecycle flags like `--address` or `--defer`. The stated reasoning is to avoid "implicit order of operations' fragility."

This design decision prioritizes implementation simplicity at the cost of user experience. It forces an operator to run two separate commands to perform what is logically a single operation (e.g., "address a concern and re-seal the manifest"). This increases the likelihood of human error, such as forgetting to run the second command, leaving the system in an inconsistent state.

**Evidence**: `[UNVERIFIED]` — This is a critique of the user workflow and command-line interface design as described in the spec's "Edge cases" section.

### LOW: (Fix 4) Simplistic Deduplication Logic

`FR-013` specifies that new non-goals and acceptance criteria should be added "if not already present (dedup by exact string match)." This logic is too simple and will fail to catch functionally identical entries that differ by minor formatting, such as trailing whitespace or capitalization (e.g., `"Fix the button."` vs `"fix the button"`). This could lead to a cluttered and slightly redundant list of criteria.

**Evidence**: `[UNVERIFIED]` — The finding is based on the logic described in `FR-013` of the spec.

## Residual Risks

1.  **Context Mismatch**: The provided `CLAUDE.md` constitution applies to the TypeScript `cloud/` codebase (using Prisma, `strict: true`, etc.). The feature spec, however, describes changes to a separate set of Python scripts in the `scripts/` and `operations/` directories. The standards for testing, typing, and error handling detailed in the provided context are likely not applicable, meaning this review cannot assess adherence to the project's Python-specific standards.

2.  **Technical Debt**: The `--validation-only` feature (`Fix 2`) knowingly builds upon a weak foundation where the manifest is not the single source of truth for artifact state. While it solves an immediate friction point, it codifies a workaround rather than addressing the underlying architectural issue, which may lead to more complex state management problems in the future.

3.  **Probabilistic Security**: The mitigation for gaming the restatement judge (`Fix 3`) is based on prompt engineering. This is a probabilistic control, not a deterministic one. There remains a non-zero risk that an LLM judge could ignore the prompt instruction, allowing the vulnerability to be exploited.

## Token Stats

- total_input=19746
- total_output=1383
- total_tokens=23846
- `gemini-2.5-pro`: input=19746, output=1383, total=23846

## Resolution
- status: open
- note: