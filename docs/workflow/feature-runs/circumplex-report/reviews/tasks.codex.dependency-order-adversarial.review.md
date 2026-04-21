---
reviewer: "codex"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/circumplex-report/tasks.md"
artifact_sha256: "d1d0d70200a6daa637fc12416d5591b1b79980b98429c93883f7b38831ef8028"
repo_root: "."
git_head_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
git_base_ref: "origin/claude/consistency-signature-dropdown"
git_base_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "HIGH (schema type [[Float]!]! cannot hold nulls): A8 CircumplexResult.profileCorrelationMatrix changed from [[Float]!]! to [[Float]]! with explicit note about nullable Floats. MEDIUM (B3 deep-link missing query path): B3 now specifies 'always-on query' — the circumplexAnalysis call runs on every page load regardless of URL state. MEDIUM (circumplexFit p-value source): same fix as execution review. MEDIUM (A6 no modelIds filter): A6 step 3 now explicitly filters transcripts with modelId IN modelIds. Residual risks (helper path confirmation, default-signature tie-breaking) accepted."
raw_output_path: "docs/workflow/feature-runs/circumplex-report/reviews/tasks.codex.dependency-order-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "Coverage reconciled; tasks revisions address all findings."
---

# Review: tasks dependency-order-adversarial

## Findings

- **HIGH:** `A8` defines `CircumplexResult.profileCorrelationMatrix` as `[[Float]!]!`, but `A4` and `C1` both require null cells for excluded or insufficient comparisons. The schema cannot represent the matrix shape the API and UI are built around, so the resolver will either violate the SDL or silently discard needed nulls.
- **MEDIUM:** `B3` only spells out a data fetch when the URL has no `models` param. There is no explicit query path for direct deep links with `models` already set, so a user can land on `/models/circumplex?models=...` and never trigger the analysis request that populates the page.
- **MEDIUM:** `A4` requires `circumplexFit` to return `spearmanP`, but the tasks never define how that p-value is computed from Spearman rho, or what fallback to use when the correlation collapses. That leaves a core output under-specified and risks inconsistent implementations.
- **MEDIUM:** `A6` accepts `modelIds`, but the aggregation flow never says to filter transcripts or returned buckets to that roster. Without an explicit filter, the resolver can spend time on unrelated models and later stages may see matrices that do not match the requested selection.

## Residual Risks

- The plan still depends on several existing helpers and DB shapes being discoverable in the codebase (`resolveTranscriptDecisionModel`, `runMatchesSignature`, `formatTrialSignature`). Those are only audited here, not pinned by path or signature, so a follow-up edit may still be needed.
- `A2` documents the default-signature chain, but the listed tests do not exercise the `v*` fallback or the highest-preamble / lowest-temperature branch. That leaves one important path lightly covered.
- `A4` and `A9` rely on the exact FR-012 / FR-018 interpretation matching the task text. If the underlying product spec uses slightly different cutoffs or null-handling rules, the implementation may need adjustment.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: HIGH (schema type [[Float]!]! cannot hold nulls): A8 CircumplexResult.profileCorrelationMatrix changed from [[Float]!]! to [[Float]]! with explicit note about nullable Floats. MEDIUM (B3 deep-link missing query path): B3 now specifies 'always-on query' — the circumplexAnalysis call runs on every page load regardless of URL state. MEDIUM (circumplexFit p-value source): same fix as execution review. MEDIUM (A6 no modelIds filter): A6 step 3 now explicitly filters transcripts with modelId IN modelIds. Residual risks (helper path confirmation, default-signature tie-breaking) accepted.