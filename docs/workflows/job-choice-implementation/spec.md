# Spec

## Goal

Implement the next-generation `Job Choice` vignette family and the supporting launch, parsing, review, and reporting changes needed to run it safely alongside the current professional `Jobs (...)` system.

The methodology source of truth remains:

- [spec.md](/Users/chrislaw/valuerank/docs/plans/job-choice-vignettes/spec.md)
- [plan.md](/Users/chrislaw/valuerank/docs/plans/job-choice-vignettes/plan.md)

This workflow artifact is the implementation-facing translation of that methodology.

## User Problem

We want to move toward the new `Job Choice` methodology without breaking the current product, losing same-signature reuse, or letting parser failures silently corrupt downstream analysis.

The product also needs a clearer launch distinction:

- `Start Paired Batch` for methodology-safe launches
- `Start Ad Hoc Batch` for exploratory work

And any current pages that remain visible during migration should be clearly labeled `Old V1`.

## Scope

The implementation should eventually cover:

1. creation of the `Job Choice` vignette family from the live professional-domain roots
2. option-text-labeled and `value A / value B` response-scale support for the bridge
3. parser and adjudication support for text-label outputs
4. coverage-aware stability and analysis reporting
5. `Paired Batch` versus `Ad Hoc Batch` launch UX
6. staged migration support while keeping the current system intact as `Old V1`

## Locked Methodology Decisions

- `Job Choice` is treated as a new instrument
- bridge comparison claim is descriptive side-by-side only
- manual pilot comes first: one vignette, one paired batch, all active default models
- pilot and bridge data should be reusable same-signature baseline-compatible evidence
- fallback-resolved transcripts in the manual pilot and first bridge should all be human-reviewed
- fallback parser agreement target is 95%
- ambiguous or unparseable transcripts above 3% block rollout

## Core Product Requirements

### Vignette family

- Duplicate all live root professional-domain `Jobs (...)` vignettes into a new `Job Choice` domain.
- Reuse the existing matching `150 words + no reframe` preamble.
- Remove job titles while preserving the concrete value-bearing work description.
- Record canonical value order and shown-first order metadata.
- Add the `job-choice` tag.

### Response wording

- Support an option-text-labeled form whose vignette sentence looks like:
  - `In one role, they would gain [value] <core value phrase> by <concrete activity or consequence>.`
- Support short response labels that use the phrase before `by`, for example:
  - `Strongly support taking the job with substantial recognition for expertise`
- Preserve support for the `value A / value B` bridge arm.

### Parsing and adjudication

- Keep the legacy numeric path unchanged.
- Add a text-label path for `Job Choice`.
- Preserve raw parser output, parse provenance, and manual override provenance.
- Make ambiguous cells inspectable and manually relabelable.
- Support CSV export of fallback-resolved transcripts for full human adjudication in the pilot and first bridge.

### Launch and reporting

- Make `Start Paired Batch` the primary launch action.
- Make `Start Ad Hoc Batch` available but less prominent.
- Exclude `Ad Hoc Batch` results from methodology-safe reporting by default.
- Label pages that continue to show the current system as `Old V1`.
- Surface coverage loss anywhere unresolved text outputs would otherwise drop out of numeric analysis.

## Non-Goals For The First Slice

- full sentinel migration
- noisy-cell follow-up paired batches
- replacing every legacy page immediately
- claiming strong cross-family equivalence

## Implementation Checkpoint

This workflow now has code landed for Slices 1 through 3:

- transcript decision metadata and manual override provenance
- `Job Choice` transform and duplication scaffolding
- text-label parsing, fallback classification, and export/audit support

Slices 4 and 5 have now started landing in code:

- `Start Paired Batch` / `Start Ad Hoc Batch` launch UX and paired companion-run orchestration are implemented.
- transcript-focused bridge reporting is implemented for ambiguous/fallback/manual visibility and adjudication flows.

Aggregate/stability coverage surfacing and pilot-execution workflows still remain for later slices.

## Risks To Manage

- parser-derived scores may look cleaner than adjudicated scores because ambiguous transcripts drop out
- title removal may make some value statements too abstract
- the current assumptions and order-effect tooling are tightly coupled to legacy semantics
- same-signature reuse will be damaged if pilot launches use a test-only run type
