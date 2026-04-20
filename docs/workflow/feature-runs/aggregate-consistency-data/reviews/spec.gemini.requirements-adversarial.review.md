---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/aggregate-consistency-data/spec.md"
artifact_sha256: "c4141e49974003afd222470b1c781346b2c56b69258c241629963e7834b52aa4"
repo_root: "."
git_head_sha: "8edda6e6bea3bf9235b54f8991650f5c8bf673f5"
git_base_ref: "origin/main"
git_base_sha: "8edda6e6bea3bf9235b54f8991650f5c8bf673f5"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/aggregate-consistency-data/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Evidence |
| :--- | :--- | :--- |
| HIGH | **Contradictory Specification for `trials` Metric:** The spec provides two conflicting definitions for the `trials` metric. FR-002 states `trials` MUST equal `sampleCount`, while the Glossary and FR-002a define it as the number of unique pairs of trials, calculated as `n * (n - 1) / 2`. This second definition is correct for a Bernoulli-pair based Repeatability metric. This reveals a fundamental ambiguity in a core metric and indicates the calculation is a new requirement, not the surfacing of an existing value. | `[CODE-CONFIRMED]` |
| HIGH | **"No Regressions" Goal Contradicted by Functional Requirement:** The spec contains a direct conflict between its goals. US-4 and FR-011 demand "zero behavioral change" and "bit-for-bit identical" values for existing consumers. However, FR-001 explicitly requires that the system *stop* emitting the `perScenario` object for scenarios with `sampleCount < 2`. The current `variance.ts` code *does* emit this object. Removing it constitutes a breaking change that will cause any downstream consumer that relies on its presence to fail, directly violating the "no regressions" requirement. | `[CODE-CONFIRMED]` |
| MEDIUM | **Metric Calculation Uses Non-Existent Bucket Names:** The `winRate` formula in FR-006 and the Glossary relies on `directionCounts.strongly` and `directionCounts.somewhat`. However, the `directionCounts` object calculated in `variance.ts` does not contain these keys. Instead, it uses `favor_first_strong`, `favor_first_lean`, `favor_second_strong`, `favor_second_lean`, and `neutral`. An implementer must infer the mapping, introducing ambiguity and a high risk of implementing the metric incorrectly. | `[CODE-CONFIRMED]` |
| MEDIUM | **Spec Understates Required Code Changes:** The spec's "Background" and "Discovery" sections claim the work is purely additive, surfacing already-computed numbers. However, FR-001 requires adding new conditional logic to `variance.ts` to filter out single-trial scenarios, which is a modification to existing logic flow, not a simple addition. Furthermore, FR-002a defines new calculations (`matches`, `trials`) that are not currently performed in the code. This misrepresents the implementation effort and risk. | `[CODE-CONFIRMED]` |
| LOW | **Backfill Race Condition Mitigation is Insufficient:** The spec (FR-008a) acknowledges the possibility of race conditions between the backfill script and live aggregate workers but defers mitigation, stating to "verify" and add a lock "if race conditions appear." For a long-running, data-critical process, relying on hope and post-mortem fixes is insufficient. A robust design would specify a locking or serialization mechanism upfront to guarantee data integrity. | `[UNVERIFIED]` |

## Residual Risks

The review surfaced several high-confidence, code-confirmed findings. The primary residual risks stem from assumptions about code not provided in the context, which are flagged as `[UNVERIFIED]` but should be explicitly checked before implementation.

1.  **Graceful Degradation Assumption:** The entire rollout plan leans heavily on the assumption that "The Consistency resolver already handles missing fields gracefully." If this is not strictly true, or if it handles missing fields by crashing, the "partial rollout" described in the Edge Cases section will cause the entire Consistency report to fail, not degrade.
2.  **Normalization Logic is Unseen:** The spec's `winRate` calculation (FR-006) is critically dependent on `resolveTranscriptDecisionModel` correctly normalizing scenario orientation. The function's implementation was not provided, so this is taken on faith. If the normalization is flawed, the `winRate` metric will be incorrect.
3.  **Backfill Error Handling:** The spec requires logging errors and continuing (US-3, AcSc 3). The risk is that if a systematic error is encountered (e.g., due to an unexpected historical data shape), the script may produce thousands of log entries but leave a large fraction of the dataset un-migrated, requiring significant manual intervention. The effectiveness of the "continue" strategy depends on error frequency, which is unknown.

## Token Stats

- total_input=19622
- total_output=943
- total_tokens=24283
- `gemini-2.5-pro`: input=19622, output=943, total=24283

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
