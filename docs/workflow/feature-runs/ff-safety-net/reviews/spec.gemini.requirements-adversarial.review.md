---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ff-safety-net/spec.md"
artifact_sha256: "a03753d0a4ce026eaa4cd7527592ee1a83632df1fd5e4c1750e3cbb2f475c841"
repo_root: "."
git_head_sha: "baf9c78f2c8130f3de17c7904a0e85edf62b9074"
git_base_ref: "origin/main"
git_base_sha: "c07a4283ecdebffa57e8a2cccfa08c23e0f76a36"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/ff-safety-net/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | ID | Finding |
| :--- | :--- | :--- |
| CRITICAL | F-1 | The entire **Completeness Veto** (US1) depends on a single, non-guaranteed behavior: an LLM prompt (`judge-prompts/completeness.md`) correctly emitting a structured JSON object with a populated `unaddressed_high_finding_ids` array (FR-001). If the prompt is updated incorrectly, fails to format its output, or an LLM hallucination omits the array, the veto will silently fail to fire. The specified fallback (FR-007) is to default to a majority-rules vote, which completely negates the safety feature and allows a feature with unaddressed HIGH concerns to be merged. This outsources a critical safety invariant to a probabilistic system with no specified mechanism for validating the prompt's own logic. |
| HIGH | F-2 | The `deliver --override-judges --reason "<text>"` command (FR-006) provides an escape hatch from the completeness veto, but the spec does not define any requirements for what happens to the mandatory `--reason` text. Without a requirement to log this reason to an audited location (e.g., the PR body, a run log, or `state.json`), an operator can silently bypass a critical safety check with no recorded justification, undermining the feature's role as a guardrail. |
| MEDIUM | F-3 | The proposed solution to the manually-curated command list (US2) relies on a new rule: "No more lambdas in `set_defaults(func=...)`" (FR-011). This is a fragile, process-based convention with no technical enforcement proposed. A future developer could easily re-introduce a `lambda`, which would not have a decorator and would therefore be invisible to the new safety check in FR-012. This re-introduces the original bug class (silent degradation of a guardrail). |
| MEDIUM | F-4 | The spec is inconsistent on the number of intermediate files to be deleted by the garbage collection feature (US3). The summary lists three, the user story acceptance criteria list five (`.raw.txt`, `.stdout.txt`, `.stderr.txt`, `.narrowed.txt`, `.narrowed.json`), and the functional requirement (FR-015) also lists five. While FR-015 is presented as the canonical list, the inconsistency points to a lack of rigor in the spec itself. |
| MEDIUM | F-5 | [UNVERIFIED] The reclassification of the `init` command as mutating (FR-011) assumes the invariant self-check will execute harmlessly. However, the self-check likely compares a "before" and "after" state. For `init`, the "before" state does not exist. The spec assumes the checker will handle this gracefully (e.g., treat missing state as empty) rather than crashing. If this assumption is false, the `init` command will be broken. |
| LOW | F-6 | [UNVERIFIED] The test for the auto-registry (FR-012) asserts that every subcommand handler from `argparse` has a decorator. However, the mechanism for decorator discovery in FR-010 (`__ff_mutates_state__` attribute) might not be robust enough for all Python callables. For example, if a command handler were implemented as a class with a `__call__` method, it's not guaranteed that the decorator mechanism as described would attach the attribute in a discoverable way. The spec assumes all handlers are simple functions. |

## Residual Risks

| ID | Risk |
| :--- | :--- |
| R-1 | **Non-atomic review file writes.** The spec correctly notes in `Risk R5` that garbage collection does not solve the problem of a killed process leaving a corrupt `.review.md` file. Because GC explicitly preserves this file, a partial write can still break the next run. The proper fix (atomic write via temp file and rename) is correctly deferred, but this remains the most likely point of failure for the review file workflow. |
| R-2 | **Incomplete garbage collection scope.** The GC feature (US3) is scoped only to the `checkpoint` command (FR-014). If other commands (existing or future) also create intermediate output files in the `reviews/` directory, they will not be garbage-collected, and the "intermediate files pile up" problem will persist, albeit at a reduced scale. |
| R-3 | **New intermediate file shapes are not collected.** `Risk R4` in the spec correctly identifies that a future, unanticipated intermediate file format (e.g., `reviews/spec.foo.partial.yaml`) will not be garbage-collected by the current glob list. While the implementation may make this easy to update, it requires developer discipline to remember to update the GC configuration when adding new review tooling. |
| R-4 | **Judge JSON schema validation failure.** The spec requires the completeness judge to emit a new JSON field (FR-001). If the judge prompt produces a malformed object (e.g., `unaddressed_high_finding_ids: "id-1,id-2"` as a string instead of an array), the behavior of the JSON validator (`_validate_json_output`, FR-002) is not specified. It will likely fail open and discard the malformed field, silently disabling the veto and defaulting to a majority vote. |

## Token Stats

- total_input=17924
- total_output=1187
- total_tokens=21896
- `gemini-2.5-pro`: input=17924, output=1187, total=21896

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
