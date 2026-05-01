---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/pressure-sensitivity-domain-analysis-alignment/spec.md"
artifact_sha256: "49937947251f45bb1034688fec6e0c2dbd4927d21ed338d234e27eebbc264762"
repo_root: "."
git_head_sha: "091e556939d1da5f726884a79da281bf207123d7"
git_base_ref: "origin/main"
git_base_sha: "091e556939d1da5f726884a79da281bf207123d7"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted. The plan now replaces the manual sanity check with an automated fixed-fixture table assertion, adds explicit tests for transcript cap and pressure-condition exclusions, and keeps the shared-helper adoption check in verification."
raw_output_path: "docs/workflow/feature-runs/pressure-sensitivity-domain-analysis-alignment/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. HIGH: The Spec Is Unimplementable As Written Due to Contradictory Constraints

The spec creates a fundamental conflict between its core product goal and its implementation constraints.

- **Spec Requirement:** The report MUST use condition-level pooling (FR-001) where each condition's result counts once, but it MUST NOT change the existing statistical machinery (Non-Goals), which includes using `diffProportionCI` for confidence intervals.
- **Problem:** The `diffProportionCI` function (`aggregation.ts`) requires trial-level counts (successes and total trials) to operate. However, true condition-level pooling, as demanded by the spec, involves averaging the rates of the conditions, which discards the underlying trial counts needed by the statistical function. One cannot average the rates and also provide the total trial counts needed for the existing CI calculation.
- **Implementation Choice:** The engineer chose to satisfy the statistical constraint. The `pooledDirectionalReduction` function aggregates data by summing up successes and trials from all vignettes within a pool. This makes the `diffProportionCI` function work, but it directly violates the spec’s primary goal (FR-001, FR-002) by weighting cells with more vignettes more heavily.
- **Evidence:** `[CODE-CONFIRMED]` in `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts`. The implementation of `pooledDirectionalReduction` shows data being prepared for `diffProportionCI` by summing trials (`directionalTrials`) and successes (`directionalSuccesses`), which is a trial-weighted approach. This makes implementing the spec's "count each condition once" rule impossible without violating the "don't change the stats" non-goal.

This contradiction must be resolved by product and engineering stakeholders before any other fixes are attempted. A decision is required: either change the definition of pooling or change the statistical method.

### 2. HIGH: Backend Aggregation Logic Violates the Spec's Core Principle

Even if the statistical contradiction were resolved, the current backend implementation for calculating the main `pressureResponse` metric is incorrect and re-introduces the very trial-weighting problem this feature aims to eliminate.

- **Spec Requirement:** "No final roll-up on the page may multiply a pooled condition result by its trial count." (FR-003). Each condition must be counted once in roll-ups.
- **Problem:** The `pooledDirectionalReduction` function in `aggregation.ts` calculates rates like `pushTowardFirstRate` by summing the `successes` from all cells in a pool and dividing by the sum of `n` (the vignette count) from those same cells. This is a weighted average, where cells containing more vignettes have a greater influence on the final rate.
- **Evidence:** `[CODE-CONFIRMED]` in `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts`. The lines `const directionalTrials = sumNumbers(directionalCells.map((cell) => cell.n));` and `const pushTowardFirstRate = directionalSuccesses / directionalTrials;` confirm that cells are being weighted by their vignette count (`cell.n`). This directly contradicts FR-003.

This flawed calculation invalidates the `pressureResponse` value at the heart of the report, along with the derived cross-value map and sanity check views.

### 3. HIGH: Frontend `PressureResponseByValueTable` Re-implements Flawed Aggregation

The frontend contains a separate, incorrect implementation of the aggregation logic, mirroring the conceptual flaw in the backend.

- **Spec Requirement:** "The Pressure Response by Value table MUST compute each pair summary from pooled condition results, then average pair summaries equally for each value row." (FR-003).
- **Problem:** The `poolRate` function within `PressureResponseByValueTable.tsx` calculates column values (e.g., "High pressure on value") by performing a weighted average. It multiplies each cell's `winRate` by `cell.n` (the number of vignettes in that cell), effectively re-introducing weighting by vignette count.
- **Evidence:** `[CODE-CONFIRMED]` in `cloud/apps/web/src/components/models/PressureResponseByValueTable.tsx`. The lines `weightedSuccesses += rate * cell.n;` and `return weightedSuccesses / trials;` in the `poolRate` function explicitly implement a weighted average based on vignette count, violating the spec's core requirement.

This means the "Pressure Response by Value" table, a key deliverable, is showing numbers that are distorted by vignette counts, directly opposing the feature's goal.

### 4. MEDIUM: UI Copy Is Misleading and Inconsistent with Implementation

The user-facing text in the report accurately describes the behavior required by the spec, but since the implementation is flawed, the text actively misleads the user about what the data represents.

- **Spec Requirement:** UI copy must be updated to explain the condition-level pooling rule (FR-008, FR-009).
- **Problem:** The UI makes explicit claims like, "Each pressure cell counts each vignette once. The pair rows are then averaged equally..." (`PressureResponseByValueTable.tsx`) and "...it does not weight by trial count" (`PressureSensitivityLimitations.tsx`). As established by previous findings, the implementation does the opposite.
- **Evidence:** `[CODE-CONFIRMED]` in `cloud/apps/web/src/components/models/PressureResponseByValueTable.tsx` and `cloud/apps/web/src/components/models/PressureSensitivityLimitations.tsx`. The copy is present but describes a reality that the code does not deliver.

This discrepancy undermines user trust and can lead to serious misinterpretation of the results, as users are being coached to read the numbers with an incorrect understanding of their calculation.

## Residual Risks

Assuming the above findings are addressed, the following risks remain inherent to the design:

- **Statistical Integrity:** The spec's non-goal of changing statistical machinery is a major source of risk. The entire report hinges on `diffProportionCI`, which is designed for comparing simple binomial proportions. The data being fed to it is a complex, multi-level aggregation. There is a risk that even with a "fixed" implementation, the chosen statistical method may not be appropriate for the averaged, pooled data, potentially producing misleading confidence intervals.
- **Ambiguity of "Condition":** The spec and code use "condition," "vignette," and "cell" somewhat interchangeably. The implementation treats a "condition" as a "vignette" for weighting purposes. If the true research requirement is for a "pressure cell" to be the "condition" that is counted once, the entire aggregation logic is wrong in a different way. This ambiguity risks future misalignment.
- **Scalability Ceiling:** The implementation fetches up to 500,000 transcripts into memory for real-time processing. While `transcriptCapHit` provides a safety valve, it also means the report's utility will degrade as data volume grows. For a feature intended for deep analysis, relying on a synchronous, in-memory aggregation with a fixed cap creates a long-term risk of the feature becoming unusable or systematically biased.

## Token Stats

- total_input=43164
- total_output=1564
- total_tokens=50473
- `gemini-2.5-pro`: input=43164, output=1564, total=50473

## Resolution
- status: accepted
- note: Accepted. The plan now replaces the manual sanity check with an automated fixed-fixture table assertion, adds explicit tests for transcript cap and pressure-condition exclusions, and keeps the shared-helper adoption check in verification.
