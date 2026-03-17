# Analysis Scenario Metadata Normalization Plan

## Scope

Implement a canonical scenario-metadata path for analysis so both legacy numeric scenarios and newer job-choice scenarios can drive warnings, condition grouping, and stability views safely.

The plan intentionally separates:

- decision evidence: transcript content, decision codes, repeat outcomes
- scenario metadata: the condition descriptors used to group and explain those outcomes

Only the second category is eligible for normalization or backfill.

## Design Summary

The implementation should introduce one shared normalization path that converts raw scenario content into an analysis-ready condition map.

That path should:

- accept legacy `content.dimensions`
- accept newer `content.dimension_values`
- preserve display fidelity where useful, while also exposing stable grouping values for analysis
- become the shared input for:
  - analysis worker warnings
  - visualization `scenarioDimensions`
  - condition-level grouping in overview and stability views
  - transcript drilldown filters that depend on condition rows

For this slice, normalization is definition-local and run-local.
We are not trying to unify semantically similar dimensions across unrelated vignette families.
The first implementation should prefer read-time normalization at the analysis boundary over a required database migration.
Persisted canonical metadata can remain a later follow-up if dry-run evidence shows it is worth the complexity.

## Proposed Architecture

### 1. Define a canonical scenario analysis metadata helper

Create a shared helper in the API layer that reads a scenario record and returns:

- `groupingDimensions: Record<string, string>`
- `numericDimensions: Record<string, number>`
- `displayDimensions: Record<string, string>`
- `sourceFormat`

This helper must be deterministic and must return `null` when exact normalization is not possible.
It becomes the single mapping authority for raw scenario metadata.
Its mapping registry should be keyed by vignette family and metadata version/preset provenance so same-named dimensions from different families cannot collide.

Precedence:

1. explicit canonical metadata if present later in the implementation
2. raw numeric `dimensions`
3. deterministic normalization from `dimension_values`
4. otherwise unavailable

If both raw fields exist and conflict, add deterministic precedence tests and treat unresolved conflicts as unavailable rather than guessing.

### 2. Normalize ingestion at the analysis boundary

Update the analyze-basic ingestion path so worker input does not depend only on raw numeric `content.dimensions`.

Instead:

- use canonical normalized dimensions for the worker-facing `scenario.dimensions`
- continue populating UI-facing `scenarioDimensions` from the same normalized source

That removes the current mismatch where the warning logic and the UI use different validity rules.
It also prevents Python workers from owning their own separate family-specific mapping logic.

### 3. Keep repeat-pattern math unchanged

The repeat-pattern labels already come from repeated decision metrics such as:

- directional agreement
- median signed distance
- neutral share
- range

Those formulas should remain unchanged.

The only metadata responsibility here is to ensure condition rows can still be formed from normalized scenario attributes.

### 4. Normalize job-choice scenarios safely

For job-choice scenarios, use deterministic preset/context mappings only.

Preferred order:

1. exact numeric analysis dimensions already stored
2. exact normalization from stored preset/version metadata
3. exact normalization from explicit scenario-side machine-readable metadata
4. otherwise return unavailable rather than guessing

If deterministic provenance is missing on real data, leave those records unavailable in this slice rather than inventing fallback guesses.
For partial-normalization runs, the UI should exclude unavailable scenarios deterministically and surface partial coverage rather than a misleading total-no-dimensions warning.

### 5. Optional backfill path

If existing scenarios lack canonical analysis metadata but have enough deterministic provenance, add a bounded backfill path for scenario metadata only.

The backfill must:

- never touch transcript answers or decision codes
- record only canonical scenario condition metadata
- skip ambiguous records rather than guessing
- support a dry-run or verification-only mode before any write path

## Likely File Changes

- `cloud/apps/api/src/queue/handlers/analyze-basic.ts`
- `cloud/workers/analyze_basic.py`
- shared API normalization/helper files for scenario metadata
- `cloud/apps/api/src/graphql/types/transcript.ts`
- analysis normalization or query layers that populate `visualizationData.scenarioDimensions`
- analysis UI code that depends on condition grouping
- tests covering legacy and job-choice vignette flows

## Implementation Steps

1. Add a shared scenario metadata normalization helper.
2. Update analysis ingestion to use normalized metadata for worker input and visualization data.
3. Update warning behavior so `NO_DIMENSIONS` reflects normalized availability, not numeric-only raw fields.
4. Update UI grouping paths that rely on scenario dimensions to consume the normalized output consistently.
5. Add tests for:
   - legacy numeric dimensions
   - string-valued dimensions that are still valid
   - job-choice `dimension_values`
   - conflict/precedence cases where both metadata shapes exist
   - categorical grouping-only metadata with no exact numeric mapping
   - graceful UI handling when normalization is unavailable for some scenarios
   - stability grouping and transcript drilldowns under normalized metadata
6. If deterministic provenance is sufficient, implement a bounded metadata-only backfill path for existing scenarios with a dry-run mode first.

## Constraints

- do not rewrite transcript decisions or transcript content
- do not infer levels from ambiguous free text
- do not change repeat-pattern thresholds in this slice
- avoid proliferating new parallel metadata contracts without clear canonical ownership

## Review Focus

The default review pair is appropriate:

- Codex `architecture` for spec and plan structure
- Gemini `requirements` at spec
- Gemini `testability` at plan

Triggered concerns to watch during implementation:

- correctness of normalization precedence
- regression risk for legacy numeric runs
- safety of any metadata backfill

## Verification Strategy

Minimum implementation verification later:

```bash
cd /Users/chrislaw/valuerank/cloud
npm test -- --runInBand
PYTHONPATH=/Users/chrislaw/valuerank/cloud/workers pytest workers/tests/test_analyze_basic.py
```

Targeted suites should be added or updated for:

- analyze-basic ingestion
- analysis GraphQL normalization
- analysis page grouping behavior
- transcript drilldown filtering for normalized scenario dimensions
- precedence/conflict handling between raw metadata formats
- graceful degradation when normalization returns unavailable
- dry-run validation for any metadata backfill
- Python worker compatibility with the normalized worker payload contract

## Workflow Notes

- Runner note: the repo-owned feature workflow runner is blocked in this checkout because it expects `/Users/chrislaw/valuerank/scripts/sync-codex-skills.py`, which is missing as source. This workflow follows the same artifact/checkpoint structure manually and uses Gemini directly for the required reviews.

## Review Reconciliation

- Spec review reconciliation target:
  define the canonical schema explicitly, make precedence deterministic, centralize mapping authority, and require fail-fast behavior for new vignette creation paths that cannot satisfy the contract.
- Plan review reconciliation target:
  add precedence/conflict tests, graceful-degradation UI tests, and dry-run verification requirements for any metadata backfill.
- Remaining spec questions to settle during implementation kickoff:
  define the concrete worker-delivery contract for normalized metadata, define the vignette-family registry source of truth, and decide how partial-normalization runs are labeled in the UI.
- Remaining plan questions to settle during implementation kickoff:
  add cross-language contract fixtures or schema checks, add malformed/partial metadata coverage, and add family-collision isolation tests.
