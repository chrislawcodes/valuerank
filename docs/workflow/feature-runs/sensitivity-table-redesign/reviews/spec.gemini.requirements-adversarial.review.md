---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/spec.md"
artifact_sha256: "fa7be2e8f98d5877d53be462f2a49b97ba7923d78b374787f103eb2e988d5b3d"
repo_root: "."
git_head_sha: "037325feb2617aa96b68cfb204a023144a68c88a"
git_base_ref: "origin/main"
git_base_sha: "4772ae79f8e1580ee31c0f10f32e6d86a842ef68"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (Inconsistent Win Rate Definition) DISMISSED. Reviewer claim is incorrect. The resolver code at aggregation.ts line 102 explicitly computes n equals ownPicked plus opponentPicked plus neutral, and line 108 computes winRate equals ownPicked divided by n. This matches the glossary definition of prioritized over prioritized plus deprioritized plus neutral exactly. Neutral is NOT excluded from the denominator; only unscored (refusals and unparseables) is excluded. The reviewer appears to have misread the outcome mapping. MEDIUM (Trials column with thin bands) RESOLVED via new FR-008b restricting Trials to qualifying-cell trials only. LOW (no badge on dash cell) RESOLVED via new FR-007a. LOW (hard-coded 0.02) RESOLVED via FR-006a now requiring import of FLAT_DELTA_THRESHOLD constant rather than literal."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### HIGH

- **Inconsistent "Win Rate" Definition**
  The spec's glossary, user stories, and functional requirements are built on a definition of "Win Rate" that contradicts the existing implementation in `pressure-sensitivity.ts`. The spec glossary (and FR-009's reference to `ModelValueDetailDrawer.tsx`) defines win rate as `prioritized / (prioritized + deprioritized + neutral)`. However, the current resolver implementation calculates it as `ownCount / (ownCount + opponentCount)`, explicitly excluding `neutral` decisions from the denominator by mapping them to an 'unscored' outcome which is filtered out before the rate calculation. This is a fundamental discrepancy. Implementing the new pooled binomial calculations (FR-005, FR-005b) without first resolving this definition will produce metrics that are mathematically correct but inconsistent with other parts of the application, and will be based on a flawed understanding of the source data.
  **[CODE-CONFIRMED]**

### MEDIUM

- **Ambiguous "Trials" Column Definition with Thin Bands**
  FR-002 introduces a "Trials" column, but its behavior is not clearly defined when one of the pressure bands is "thin" (i.e., has insufficient data per FR-008 and FR-008a). FR-008a states that when one band is thin, the other band's value is still displayed. However, the spec does not clarify if the "Trials" column should then show the total trials for the entire value pair (which would be misleading, as not all were used) or only the trials from the non-thin band. The current code calculates a total `pairN` across all cells, which would need to be modified. This ambiguity risks misrepresenting how much data supports the reported metrics for a given row.
  **[UNVERIFIED]**

### LOW

- **Omitted Ceiling/Floor Badge Behavior for Thin Bands**
  FR-007 specifies that a "ceiling" or "floor" badge should be rendered on the "Low pressure" cell, and that the badge's logic must follow the displayed value. However, FR-008a requires that this cell displays "—" when the low pressure band is thin. The spec omits the explicit rule that no ceiling/floor badge should be rendered in this case. While implied, this lack of an explicit rule creates ambiguity for the frontend implementation.
  **[UNVERIFIED]**

- **Hard-Coded Threshold in Requirement**
  FR-006a requires an annotation that counts pairs where `per-pair Δ > 0.02`. This hard-codes a magic number into the requirement. The current codebase defines this value as a constant `FLAT_DELTA_THRESHOLD`. While FR-013 and FR-017 correctly reference this as a "threshold," FR-006a does not. This creates a risk that the annotation's logic could diverge from the directional sanity check's logic in the future if the constant is changed.
  **[CODE-CONFIRMED]**

## Residual Risks

The spec correctly identifies and defers several pre-existing issues. These are not new findings from this review, but this review confirms they are valid and the proposed mitigations are reasonable within the feature's scope.

- **Transcript Fetch Limit:** The hard cap of 500,000 transcripts (`TRANSCRIPT_FETCH_LIMIT`) is confirmed in the code. The spec's proposal to log a warning upon truncation is a sound, temporary mitigation. **[CODE-CONFIRMED]**
- **Source Run to Definition ID Collisions:** The resolver's use of `sourceRunToDefId.set()` in a loop guarantees that if a `sourceRunId` is associated with multiple definitions, the last one processed will silently win. The spec correctly identifies this v1 bug and proposes a logging-based mitigation. **[CODE-CONFIRMED]**
- **Sanity Panel Classification Shifts:** The spec proactively and correctly notes that changing the Δ calculation from a mean-of-rates to a pooled-proportion difference (FR-005) will cause the classification of some borderline pairs in the sanity check panel to change. Calling this out as an expected correctness improvement is a good example of adversarial thinking within the spec itself. **[CODE-CONFIRMED]**

## Token Stats

- total_input=25203
- total_output=935
- total_tokens=29643
- `gemini-2.5-pro`: input=25203, output=935, total=29643

## Resolution
- status: accepted
- note: HIGH (Inconsistent Win Rate Definition) DISMISSED. Reviewer claim is incorrect. The resolver code at aggregation.ts line 102 explicitly computes n equals ownPicked plus opponentPicked plus neutral, and line 108 computes winRate equals ownPicked divided by n. This matches the glossary definition of prioritized over prioritized plus deprioritized plus neutral exactly. Neutral is NOT excluded from the denominator; only unscored (refusals and unparseables) is excluded. The reviewer appears to have misread the outcome mapping. MEDIUM (Trials column with thin bands) RESOLVED via new FR-008b restricting Trials to qualifying-cell trials only. LOW (no badge on dash cell) RESOLVED via new FR-007a. LOW (hard-coded 0.02) RESOLVED via FR-006a now requiring import of FLAT_DELTA_THRESHOLD constant rather than literal.
