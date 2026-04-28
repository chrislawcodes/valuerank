---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/pressure-sensitivity-report/spec.md"
artifact_sha256: "c9ec8559e7573c01122452060bef1dbecb4c6b2d584cc8d36164a6f312fae589"
repo_root: "."
git_head_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
git_base_ref: "origin/main"
git_base_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Round 4 findings addressed: (1) HIGH normalization pipeline gap — FR-002b rewritten with explicit (a)-(d) breakdown showing what's reusable, what needs adapter, and acknowledging adapter is net-new; (2) MED transcript vs vignette pooling — FR-022 mandates pooled (model, scenario) observations matching ModelValueDetailDrawer semantics; (3) LOW FR-018/FR-024 incompatible taxonomies — consolidated into FR-018 (a)-(g) including self-pair; (4) LOW self-pair edge case — FR-018(g) rejects value_first.token === value_second.token. Residual: per-cell unscored_count/exclusion data shape covered by FR-018 persistence + FR-023 unscored_count; cross-vignette calibration limitation acknowledged in FR-014(a)."
raw_output_path: "docs/workflow/feature-runs/pressure-sensitivity-report/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- HIGH: The spec assumes a reusable normalization pipeline will trim and numeric-normalize scenario-side dimension values before lookup, but the provided helpers do not do that. `normalizeScenarioAnalysisMetadata` only preserves raw string/number entries, and `getLevelNormalizationMap` does exact-string matching on labels. As written, values like `" moderate"` or `"01"` will miss their buckets unless new canonicalization code is added. [CODE-CONFIRMED]
- MEDIUM: The spec mixes `transcripts`, `scenarios`, and pooled `vignettes` as counting units, but the existing Models UI already treats pooled observations as distinct vignettes, not raw runs. `ModelValueDetailDrawer.tsx` explicitly says repeated runs are pooled before counting. If this report counts raw transcripts for `N` or `unscored_count`, its denominators and coverage badges will disagree with existing Models-tab semantics. [CODE-CONFIRMED]
- LOW: FR-018 and FR-024 define incompatible exclusion taxonomies. FR-018 presents a closed mutually exclusive list `(a-f)`, then FR-024 adds a new reason `(g)` for missing value-pair tokens. That leaves the excluded-footer accounting model ambiguous unless the spec is revised to make the reason set truly canonical. [UNVERIFIED]
- LOW: The spec does not say what to do if `value_first.token === value_second.token`. After canonical sorting, that collapses to a single token pair and makes own/opponent assignment ambiguous. This should be explicitly rejected or ruled out. [UNVERIFIED]

## Residual Risks

- I could not verify the final report data shape for per-cell `unscored_count`, per-definition exclusion reasons, or the exact storage of low-data markers because the pressure-sensitivity implementation is not provided.
- The spec still leaves cross-vignette level calibration as an acknowledged limitation. Even if implemented correctly, cross-value comparisons remain only descriptive, not validated.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Round 4 findings addressed: (1) HIGH normalization pipeline gap — FR-002b rewritten with explicit (a)-(d) breakdown showing what's reusable, what needs adapter, and acknowledging adapter is net-new; (2) MED transcript vs vignette pooling — FR-022 mandates pooled (model, scenario) observations matching ModelValueDetailDrawer semantics; (3) LOW FR-018/FR-024 incompatible taxonomies — consolidated into FR-018 (a)-(g) including self-pair; (4) LOW self-pair edge case — FR-018(g) rejects value_first.token === value_second.token. Residual: per-cell unscored_count/exclusion data shape covered by FR-018 persistence + FR-023 unscored_count; cross-vignette calibration limitation acknowledged in FR-014(a).
