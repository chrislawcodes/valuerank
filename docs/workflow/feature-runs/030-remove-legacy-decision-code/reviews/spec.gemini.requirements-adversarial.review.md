---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/spec.md"
artifact_sha256: "3b720b6be5a3b6579283dbc8f00b0f6a4a6ea92bd6e3f65e2cfc273f283467bf"
repo_root: "."
git_head_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
git_base_ref: "origin/fix/audit-mode-no-legacy-fallback"
git_base_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH ambiguity: plan Decision 2 resolves ConditionMatrix approach (option a: 5-bucket data). US-7 migration: normalizeBucketCode keeps backward compat during transition. HIGH float-to-int: uses Math.round on winnerScore. MEDIUM bucket names: opponentSomewhat naming is established convention in canonical reference impl, renaming out of scope. MEDIUM malformed metadata: resolver already handles per original spec. CRITICAL deployment coupling: TS+Python deploy together via Railway, canonical fields present in payloads for months. HIGH exports: only affects newly generated files."
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Location |
| :--- | :--- | :--- |
| **HIGH** | **Implementation ambiguity creates inconsistent outcomes.** | `US-1`, `US-7` |
| | The spec allows for multiple implementation paths, which undermines the goal of creating a single canonical model. In `US-1`, the component can either use a shared utility *or* receive pre-computed props. In `US-7`, stored data can be handled by a migrator *or* just be "documented as legacy." These ambiguities defer key decisions, increasing the risk of inconsistent implementations and permanent tech debt. A specification's role is to make these choices, not offer them. | |
| **HIGH** | **Omitted requirement for float-to-integer conversion.** | `US-1` |
| | The spec mandates that `ConditionMatrix.tsx` use the `winnerScore` formula from a reference implementation: `(2 * winnerStrongly + 1 * winnerSomewhat) / totalTrials`. This calculation produces a float or rational number (e.g., `1.33`). However, the acceptance criteria state the cell label must be an integer: `0`, `1`, or `2`. The spec omits the required bucketing, rounding, or flooring logic needed to convert the float score into the integer strength display value. | |
| **MEDIUM** | **Semantic violation of the core design principle.** | `US-3` |
| | The "Core Design Principle" is that strength and winner must be separate fields. However, `US-3` describes aggregate logic that uses bucket names like `opponentSomewhat` and `opponentStrongly`. These names semantically conflate the winner ("opponent") and the strength ("somewhat", "strongly"), violating the core principle. While the underlying data *might* be separate, using these names in the code perpetuates the old, conflated mental model for future developers. | |
| **MEDIUM** | **Assumption of data integrity in fallback logic.** | `US-6` |
| | The spec relies on `resolveTranscriptDecisionModel` falling back to the `decisionCode` column if `decisionMetadata` is absent. This assumes that `decisionMetadata` is either entirely present and valid or entirely absent. It does not define behavior for cases where `decisionMetadata` is present but partial, malformed, or invalid. If the resolver fails on malformed data instead of treating it as absent, the fallback to `decisionCode` might not be triggered, leading to errors for older transcripts that the fallback was designed to protect. | |
| **LOW** | **[UNVERIFIED] Assumed direct mapping of existing data types.** | `US-1` |
| | `US-1` states that the existing `MatrixCondition` type has `prioritized`/`deprioritized`/`neutral` counts that "map directly to the canonical buckets." This is an unverified assumption about the codebase. It's possible the mapping is not direct (e.g., it may require flipping logic depending on context), and the spec provides no detail on how to perform this mapping, which could lead to implementation errors. | |

## Residual Risks

| Severity | Risk | Mitigation / Comment |
| :--- | :--- | :--- |
| **CRITICAL** | **Deployment coupling between services creates high risk of runtime failure.** | `US-9`, `Risks` |
| | The spec correctly identifies that Python workers consume data produced by the TypeScript application via a queue. `US-9` requires changing the data structure in this queue payload. The "Risks" section incorrectly dismisses this by stating it's a "read-path only" change. This is a critical misunderstanding. Changing the data contract between a producer (TypeScript) and a consumer (Python) is a breaking change. If the services are deployed independently, any mismatch between the expected and actual data format will cause the Python workers to fail, halting all background processing. The project must have a mitigation strategy, such as versioning the payload, using a staged deployment, or ensuring both services are deployed in lockstep. | |
| **HIGH** | **Downstream export consumers may break.** | `US-10`, `Risks` |
| | The risk mitigation for exports is contradictory. It states to "Keep existing export formats" but the `US-10` acceptance criteria states "Export column headers use 'direction' / 'strength' terminology." Changing column headers is a breaking change for any automated downstream consumer. The spec needs to clarify if this is a new, versioned export or a modification of the existing one. If it's a modification, the risk of breaking downstream consumers is high and is not adequately mitigated. | |
| **LOW** | **[UNVERIFIED] Changes may not be comprehensive due to limited scope.** | `Success criteria` |
| | The `grep` commands in the success criteria are scoped to the `cloud/` directory. The project structure shows other directories like `scripts/` that might contain code (e.g., one-off analysis scripts) that consumes the application's data models. While `src/` is documented as legacy, other directories are not. There is a small risk that consumers of the legacy decision model exist outside the `cloud/` directory and will be missed by these changes and verification steps. | |

## Token Stats

- total_input=16858
- total_output=1141
- total_tokens=20287
- `gemini-2.5-pro`: input=16858, output=1141, total=20287

## Resolution
- status: accepted
- note: HIGH ambiguity: plan Decision 2 resolves ConditionMatrix approach (option a: 5-bucket data). US-7 migration: normalizeBucketCode keeps backward compat during transition. HIGH float-to-int: uses Math.round on winnerScore. MEDIUM bucket names: opponentSomewhat naming is established convention in canonical reference impl, renaming out of scope. MEDIUM malformed metadata: resolver already handles per original spec. CRITICAL deployment coupling: TS+Python deploy together via Railway, canonical fields present in payloads for months. HIGH exports: only affects newly generated files.
