---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/pressure-sensitivity-report/spec.md"
artifact_sha256: "c9ec8559e7573c01122452060bef1dbecb4c6b2d584cc8d36164a6f312fae589"
repo_root: "."
git_head_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
git_base_ref: "origin/main"
git_base_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Round 4 findings addressed: (1) HIGH AGGREGATE data shape insufficient — FR-022 rewritten to source from raw transcripts (with pooling), not summarized AGGREGATE output; plan phase will confirm exact pooling source; (2) HIGH value vs value pair ambiguity — FR-024 explicitly states unit of analysis is value pair; deterministic alphabetical own/opponent assignment (no user-selectable target in v1); product goal language clarified as shorthand; (3) HIGH getLevelNormalizationMap misrepresentation — FR-002b uses getDimensionLevelsFromDefinition for legacy fallback; getLevelNormalizationMap reserved for label-to-score mapping with adapter wrapper; (4) MED N contradiction — FR-003(a) rewritten: N is scored count (consistent with FR-023 unscored exclusion); (5) MED novel adapter required — FR-002b explicitly acknowledges net-new code, toComparableNumber export/duplicate decision deferred to plan. Residual risks: effort underestimation flagged in FR-022 plan-phase note; misleading UX value-vs-pair resolved by FR-024 explicit statement; normalization bugs covered by FR-002a collision detection + FR-002b adapter rules."
raw_output_path: "docs/workflow/feature-runs/pressure-sensitivity-report/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### 1. HIGH: Required data is not available in the specified data source
- **Severity:** HIGH
- **Finding:** The spec mandates a complex new aggregation pivot by `(own_level_score, opponent_level_score)` (FR-002). However, it also requires sourcing data from `AGGREGATE` analysis records (FR-017a, FR-022) to align with other reports like `models-consistency`. The code shows that the existing `AGGREGATE` output, as parsed by `models-consistency.ts`, contains summarized data (`perScenario`, `perPair`) that lacks the granular per-transcript pressure level scores needed for this new pivot. This implies the fundamental assumption about the data source is incorrect. The project will likely require a new, costly aggregation pipeline directly from raw transcripts, significantly increasing complexity beyond what is described.
- **Evidence:** `[CODE-CONFIRMED]`
- **Code Reference:** `cloud/apps/api/src/graphql/queries/models-consistency.ts` in `buildParsedModelData` parses `perScenario` and `perPair` from the `AGGREGATE` output. The data shapes (`ConsistencyParsedScenario`, `ConsistencyParsedPair`) do not contain fields for the pressure levels of the individual vignettes, which are necessary for the 2D grid aggregation required by this spec.

### 2. HIGH: Critical ambiguity in the unit of analysis (Value vs. Value Pair)
- **Severity:** HIGH
- **Finding:** The spec is fundamentally ambiguous, conflating the analysis of a single "value" with that of a "value pair". Product goals (e.g., "which values move under pressure?") and aggregate metrics (FR-008) focus on individual values. However, the core technical requirements (FR-005, FR-010, FR-024) are defined for value pairs. FR-024 defines "own" pressure based on a "user-selected analysis target" value, but the UI described in the user stories provides no such selection mechanism, instead presenting tables of value pairs. This makes it unclear how "own" vs. "opponent" pressure is determined, or if the same data is meant to be analyzed twice with flipped axes, leading to a confusing and potentially misleading report.
- **Evidence:** `[UNVERIFIED]`
- **Code Reference:** This is a conceptual flaw in the spec itself. There is no code to confirm or refute how a "user-selected analysis target" would be implemented in this new context.

### 3. HIGH: Misunderstands cited helper function for data normalization
- **Severity:** HIGH
- **Finding:** The spec repeatedly and centrally relies on `getLevelNormalizationMap` for label-to-score mapping (Dependency section, FR-002, Code Reuse table). However, it misrepresents the function's behavior. FR-018 discusses how the function handles legacy `values[]` fields as a fallback. The code for `getLevelNormalizationMap` shows it *only* processes the `levels[]` field and has no fallback to `values[]`. The function that *does* have this fallback is `getDimensionLevelsFromDefinition`, which is not the function specified for building the normalization map. This indicates a flawed understanding of the primary helper function, which will cause the implementation to fail or be incorrect if followed literally.
- **Evidence:** `[CODE-CONFIRMED]`
- **Code Reference:** `cloud/apps/api/src/graphql/queries/scenarios-utils.ts` clearly shows `getLevelNormalizationMap` only considers `definitionDimension.levels`, while `getDimensionLevelsFromDefinition` considers both `levels` and `values`.

### 4. MEDIUM: Contradictory definition of 'N' for cell counts
- **Severity:** MEDIUM
- **Finding:** The spec contains a direct contradiction on how to count transcripts. FR-003(a) defines `N` as "total transcripts in the cell (no exclusion of strength buckets)," implying an all-inclusive count. In contrast, FR-023 mandates that transcripts with `refusal` or `unknown` direction "MUST be excluded from N" and tracked separately in an `unscored_count`. The intent appears to be that N represents only scored trials, but FR-003(a) is stated incorrectly, which would lead to incorrect metrics if implemented as written.
- **Evidence:** `[UNVERIFIED]`
- **Code Reference:** This is a contradiction within the spec for a new feature. Existing code like `canonicalConditionSummary.ts` does separate `unknownCount` from `totalTrials`, suggesting FR-023 is the correct intent, but this confirms the contradiction in the new spec, not a code-level flaw.

### 5. MEDIUM: Implementation requires novel combination of incompatible helpers
- **Severity:** MEDIUM
- **Finding:** FR-002b requires creating a "single canonical pipeline" for normalization by combining logic from `normalizeScenarioAnalysisMetadata` and `getLevelNormalizationMap`. The former uses `toComparableNumber` which handles numeric string variations (e.g., `"1"`, `"1.0"`) by converting to a `number`, while the latter uses simple, exact string matching for map keys. The spec requires a hybrid approach that is not present in either helper (e.g., treating `"1.0"` as a key to look up a value associated with the key `"1"`). This requires creating a new, non-trivial piece of logic rather than simply wiring together existing helpers, introducing implementation risk and effort not acknowledged in the spec.
- **Evidence:** `[CODE-CONFIRMED]`
- **Code Reference:** `cloud/apps/api/src/services/analysis/scenario-metadata.ts` shows `toComparableNumber` returning `number | null`. `cloud/apps/api/src/graphql/queries/scenarios-utils.ts` shows `getLevelNormalizationMap` building a `Map<string, string>` using literal string keys. The two are not directly compatible for the kind of fuzzy lookup the spec implies.

## Residual Risks

- **Effort Underestimation:** The most significant risk is that the work is much larger than specified. The incorrect assumption that `AGGREGATE` analysis results are a sufficient data source (Finding #1) means a new, complex data processing pipeline will likely need to be built from scratch, invalidating effort estimates based on reusing existing aggregations.
- **Misleading UX:** The ambiguity between analyzing "values" and "value pairs" (Finding #2) risks creating a report that is confusing or misinterpreted by researchers. If a value's sensitivity is an average over multiple, unstated pairings, the "headline" number could mask critical variance and fail to meet the product goals.
- **Normalization Bugs:** The complexity of the normalization logic (Finding #3, Finding #5) creates a high risk of subtle bugs. Errors in handling edge cases like label/score collisions, whitespace, or numeric-vs-string representations could lead to vignettes being silently dropped or incorrectly bucketed, undermining the validity of the entire report.

## Token Stats

- total_input=31969
- total_output=1511
- total_tokens=38595
- `gemini-2.5-pro`: input=31969, output=1511, total=38595

## Resolution
- status: accepted
- note: Round 4 findings addressed: (1) HIGH AGGREGATE data shape insufficient — FR-022 rewritten to source from raw transcripts (with pooling), not summarized AGGREGATE output; plan phase will confirm exact pooling source; (2) HIGH value vs value pair ambiguity — FR-024 explicitly states unit of analysis is value pair; deterministic alphabetical own/opponent assignment (no user-selectable target in v1); product goal language clarified as shorthand; (3) HIGH getLevelNormalizationMap misrepresentation — FR-002b uses getDimensionLevelsFromDefinition for legacy fallback; getLevelNormalizationMap reserved for label-to-score mapping with adapter wrapper; (4) MED N contradiction — FR-003(a) rewritten: N is scored count (consistent with FR-023 unscored exclusion); (5) MED novel adapter required — FR-002b explicitly acknowledges net-new code, toComparableNumber export/duplicate decision deferred to plan. Residual risks: effort underestimation flagged in FR-022 plan-phase note; misleading UX value-vs-pair resolved by FR-024 explicit statement; normalization bugs covered by FR-002a collision detection + FR-002b adapter rules.
