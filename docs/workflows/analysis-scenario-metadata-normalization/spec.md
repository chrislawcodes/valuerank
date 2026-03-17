# Analysis Scenario Metadata Normalization Spec

## Goal

Make analysis treat scenario metadata consistently across legacy numeric vignettes and newer job-choice vignettes so that:

- scenario-dimension warnings are accurate
- pivot and stability views can group scenarios reliably
- repeat-pattern labels such as `stable`, `softLean`, `torn`, and `noisy` remain valid for new vignette formats

This feature must normalize scenario metadata without rewriting model decisions or transcript outcomes.

## Problem

The repo currently has multiple scenario metadata shapes:

- legacy/generated scenarios store machine-readable numeric levels in `scenario.content.dimensions`
- newer job-choice scenarios store human-readable values in `scenario.content.dimension_values`
- analysis warnings and dimension-analysis worker inputs still mostly depend on `scenario.content.dimensions`

Because of that mismatch, a run can contain real scenario metadata but still show warnings like `No scenario dimensions found in transcripts`, and condition-level analysis can become unavailable or incomplete for newer vignette formats.

## Why This Should Be Next

This is blocking confidence in the analysis page for current vignette creation flows.

It should happen before more analysis UX work because:

1. condition grouping and stability tables depend on trustworthy scenario metadata
2. the current warning can mislead users into thinking a run lacks metadata when the metadata is simply stored differently
3. backfilling and future vignette creation should share one analysis contract instead of proliferating more format branches

## Core Decision

We should not migrate or rewrite model answers.

We should normalize scenario metadata into one canonical analysis shape and let all analysis code read from that canonical shape.

The model answer, decision code, and repeat outcomes remain the evidence.
Scenario metadata is descriptive context about the condition and may be normalized when the mapping is exact and deterministic.

This slice is run-local and definition-local.
It does not attempt to force cross-family aggregation of similarly named dimensions across unrelated vignette families.

## In Scope

- canonical scenario metadata contract for analysis
- analysis ingestion logic for legacy `dimensions` and newer `dimension_values`
- warning behavior for missing scenario dimensions
- stability and condition-grouping compatibility for normalized metadata
- backfill and migration rules for existing scenarios when mapping is exact
- workflow docs under `docs/workflows/analysis-scenario-metadata-normalization/`

## Out Of Scope

- changing model decisions, transcript text, or adjudicated outcomes
- redefining repeat-pattern thresholds
- redesigning analysis UI copy beyond metadata-related warnings and availability messages
- changing the meaning of job-choice level presets
- adding new vignette families unrelated to this metadata contract

## Desired Behavior

Analysis should work from a canonical scenario metadata view regardless of how the scenario was originally authored.

That means:

1. every scenario used in analysis exposes a canonical machine-readable condition map
2. legacy numeric scenarios continue to work without behavioral regression
3. job-choice scenarios contribute usable condition metadata to scenario warnings, pivot grouping, and stability grouping
4. the analysis warning only appears when scenario metadata is genuinely unavailable, not when it exists in a different valid format
5. repeat-pattern labels continue to be computed from repeated decision behavior, not from rewritten scenario answers
6. any backfill from human-readable job-choice values to machine-readable analysis levels happens only when the mapping is exact and deterministic from stored preset/context data

## Canonical Metadata Rules

The feature should define one canonical analysis-level representation for scenario conditions.

Minimum requirements:

- `groupingDimensions: Record<string, string>`
- `numericDimensions: Record<string, number>`
- `displayDimensions: Record<string, string>`
- `sourceFormat: "canonical" | "dimensions" | "dimension_values" | "mixed"`

Behavior rules:

- `groupingDimensions` is the shared condition-grouping contract for UI and worker ingestion
- `numericDimensions` contains only exact numeric levels and may be empty when a vignette family has no exact numeric mapping
- `displayDimensions` preserves human-readable condition labels for UI display and debugging
- attribute names must be stable within a vignette family and within a definition/run context
- the feature must explicitly handle both legacy numeric scales and newer label-based scales
- non-ordinal categorical metadata is valid in `groupingDimensions` and `displayDimensions` even when it cannot populate `numericDimensions`

Normalization precedence must be deterministic:

1. explicit canonical metadata if present
2. exact legacy `dimensions`
3. exact deterministic normalization from `dimension_values`
4. otherwise unavailable

If a scenario contains both `dimensions` and `dimension_values` and they conflict, the system must not choose arbitrarily.
It should either resolve by the explicit precedence above or mark normalization unavailable for that scenario.

The mapping authority must be centralized in one normalization module.
That module must be keyed by vignette family plus versioned metadata source so families with similarly named attributes do not share mappings accidentally.
Python workers should receive already-normalized metadata from the TypeScript analysis boundary rather than re-implementing family-specific mapping logic independently.

For the first implementation slice, normalization should be computed at read/analysis time rather than requiring an immediate database schema migration.
Persisted canonical metadata and bulk backfill remain optional follow-on work after dry-run validation proves the value.

## Validity Rules For Backfill

Backfill is valid only for scenario metadata, never for model answers.

Backfill is allowed when:

- the source metadata exists
- the mapping to the canonical analysis representation is exact
- the conversion is reproducible from stored scenario or preset data

Backfill is not allowed when:

- the system would need to guess a numeric level from free text without a deterministic mapping
- the source metadata is ambiguous or incomplete
- the conversion would alter the meaning of model decisions

If a backfill is attempted, it must support a verification-first path before any persisted write.

## Acceptance Criteria

1. Analysis can ingest legacy numeric `scenario.content.dimensions` without regression.
2. Analysis can ingest newer job-choice `scenario.content.dimension_values` through the canonical normalization path.
3. The `NO_DIMENSIONS` warning appears only when no usable canonical scenario metadata exists.
4. Stability and overview condition-grouping can use normalized scenario metadata for new-format vignettes.
5. The classification inputs for `stable`, `softLean`, `torn`, and `noisy` remain based on repeat decision metrics, while condition-cell grouping uses normalized scenario metadata.
6. The implementation does not rewrite transcript decisions, decision codes, or transcript content.
7. Any proposed backfill path is explicitly limited to deterministic scenario-metadata normalization.
8. Conflicting raw metadata fields have deterministic precedence or resolve to unavailable, never silent arbitrary choice.
9. New vignette creation paths either populate metadata that can satisfy the canonical normalization contract or fail fast before shipping unusable scenario metadata into analysis.
10. When a run is only partially normalizable, usable scenarios still participate, unusable scenarios are excluded deterministically, and the UI shows partial-coverage behavior rather than incorrectly claiming total absence of dimensions.

## Risks To Manage

- silent semantic drift if human-readable level words are converted to numeric levels without a guaranteed mapping
- creating yet another parallel metadata field without making it canonical
- partially fixing warnings while leaving stability grouping and transcript drilldown filters on old logic
- job-choice scenarios with insufficient stored preset provenance for exact normalization

## Verification

Implementation later should verify:

```bash
cd /Users/chrislaw/valuerank/cloud
npm test -- --runInBand
```

At minimum, targeted tests should cover:

- analysis ingestion from numeric `dimensions`
- analysis ingestion from `dimension_values`
- warning suppression when normalized metadata exists
- stability grouping for normalized new-format scenarios
