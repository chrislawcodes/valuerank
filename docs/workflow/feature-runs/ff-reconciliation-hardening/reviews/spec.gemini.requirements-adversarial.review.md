---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-reconciliation-hardening/spec.md"
artifact_sha256: "29c09dc13c0f84585a92377741466fe054682e164be4c625e06f3a7e5aa2fecd"
repo_root: "."
git_head_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
git_base_ref: "origin/main"
git_base_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Fixed after judge-cap advance: added word boundaries, heading spacing, replay-safe flag principle, extra ignored Markdown contexts, and YAML recovery constraints."
raw_output_path: "docs/workflow/feature-runs/ff-reconciliation-hardening/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | ID | Finding |
| --- | --- | --- |
| **HIGH** | F-01 | The severity detection logic in `FR-001` is insufficient and may lead to false positives. The spec requires matching on `HIGH`, `MEDIUM`, etc., but does not mandate the use of word boundaries. A phrase like `HIGHLY important detail` would incorrectly be flagged as a `HIGH` severity finding. This undermines the goal of reducing noise and could lead to reviews being held open incorrectly. |
| **MEDIUM** | F-02 | The plan-narrowing hash logic in `FR-008` is brittle. It depends on the exact heading `## Review Reconciliation`. The spec does not state how to handle trailing whitespace or variations in spacing (e.g., `##  Review Reconciliation`). An operator adding a single extra space to this line would cause all subsequent reconciliation edits to be treated as full plan edits, re-introducing the very problem `US5` aims to solve. |
| **MEDIUM** | F-03 | The mechanism for persisting checkpoint flags in `FR-006` is defined too loosely. It states, "The exact list can include additional checkpoint flags if that keeps the implementation simpler," without creating a clear inclusion or exclusion principle. This creates a high risk that a future developer could add a new, non-idempotent, or context-sensitive flag (similar to the correctly-excluded `use_existing_artifact`) that gets persisted automatically, leading to unpredictable "magical" behavior during repair runs that is difficult to debug. |
| **LOW** | F-04 | [UNVERIFIED] The list of markdown contexts to ignore for severity detection (`FR-001`) is incomplete. It covers common code and quote blocks but omits other non-finding contexts like markdown tables or HTML comments (`<!-- CRITICAL: old note -->`). An operator leaving notes in these formats could unintentionally stall the auto-reconciliation process. This depends on the specific markdown parsing library in use. |
| **LOW** | F-05 | [UNVERIFIED] The definition of whitespace normalization in `FR-004` is slightly ambiguous. It specifies collapsing internal whitespace but does not explicitly mention normalizing different newline characters (`\n` vs. `\r\n`). If a plan note and a YAML frontmatter note differ only by their newline style, they may fail comparison, creating a false mismatch loop. This depends on the implementation of "collapsing internal whitespace". |
| **LOW** | F-06 | The recovery mechanism for a failed YAML parse in `US3`, Acceptance `5`, could be improved. It states that on a parsing error, the system reports a mismatch. However, it does not specify what state the `resolution_note` is in. If a file write is interrupted while changing the `resolution_status` to `accepted`, the YAML frontmatter could be corrupted, causing all subsequent verification runs to fail with a parse error, effectively blocking the process until manual file repair. |

## Residual Risks

| ID | Risk | Mitigation / Comment |
| --- | --- | --- |
| **R1** | Severity formats can still evolve. | This is acknowledged in the artifact. The verification plan to use regression tests is appropriate but reactive. The risk remains that a novel severity format used by a reviewer will bypass the check entirely. |
| **R2** | The reconciliation heading is a fragile contract. | Acknowledged in the artifact as R3. A developer renaming `## Review Reconciliation` to `## Reconciliation Notes` would silently break the narrowed hashing feature (`US5`), causing all plan reviews to become stale after any reconciliation note is added. Documentation and helper docstrings are the only proposed guards. |
| **R3** | The list of persisted checkpoint flags may become unsafe. | Even if the initial list of persisted flags in `FR-006` is safe, the lack of a guiding principle for *what* makes a flag safe to persist means future flags may be added without due consideration. A future flag like `--force-regenerate` could be safe for a single run but dangerous if re-applied automatically during a later repair. |
| **R4** | Environmental differences create behavioral forks. | Acknowledged in the artifact as R4. The fallback to byte-comparison for reconciliation notes (`US3`, AC4) when PyYAML is not present means the system's correctness is dependent on the execution environment. This could cause a reconciliation that passes locally to fail in a CI/CD environment (or vice-versa), complicating diagnosis. The warning message mitigates but does not eliminate this risk. |

## Token Stats

- total_input=13759
- total_output=984
- total_tokens=17041
- `gemini-2.5-pro`: input=13759, output=984, total=17041

## Resolution
- status: accepted
- note: Fixed after judge-cap advance: added word boundaries, heading spacing, replay-safe flag principle, extra ignored Markdown contexts, and YAML recovery constraints.
