# Feature Specification: Assumptions Tab — Reliability Checks

> **Feature #027**
> **Created**: 2026-02-27
> **Last Updated**: 2026-02-28
> **Status**: Draft
> **Dependencies**: Domain analysis pipeline (existing), transcript viewer components (existing), temp=0 signature support (existing), scenario variant generation workflow for #286/#287 (new implementation work).

## Overview

Add an **Assumptions** tab that verifies whether value-prioritization results are stable enough to trust for interpretation.

The tab evaluates three reliability checks:

1. `#285` Temp=0 determinism
2. `#286` Order invariance
3. `#287` Job-title invariance

The UI reports the **exact match percentage** and **exact difference percentage** for each assumption, or `INSUFFICIENT DATA` when the required runs are not available.

This feature answers one product question:

**“Are these value-priority results robust, or are they changing because of repeat-run noise or superficial framing?”**

## Product Goal

Enable researchers and product stakeholders to judge whether model value-prioritization outputs are trustworthy for interpretation by validating that outcomes remain stable when:

- the same prompt is repeated at `temp=0`,
- option order is reversed,
- professional job-title framing is removed.

If assumptions hold, users can treat value-priority outputs as more robust.  
If assumptions do not hold, users can inspect the exact vignette table, condition row, and batch transcript that produced the divergence.

## Success Criteria

- All three assumptions are available in one unified tab.
- Each assumption shows exact percentage metrics, not abstract pass/fail labels.
- Users can review the exact vignette package and estimated run cost before launching trials.
- Users can drill from summary -> vignette-specific table row -> exact batch transcript prompt/response.
- Results are copyable/exportable for audits and research documentation.

---

## Why One Spec

Use one umbrella spec because all three checks:

- live in one product surface,
- share the same preflight review flow,
- share pairing/comparison infrastructure,
- share drill-down and audit UX.

Implementation may ship in separate PRs, but the product contract should remain unified.

---

## User Stories

### User Story 1 — Verify temp=0 determinism

As a researcher, I need to confirm repeated identical `temp=0` runs produce identical decisions, so I can trust that observed differences are structural rather than random.

**Independent test**: Run the temp=0 determinism check and verify that each `(model, vignette, condition)` row shows three repeated decisions and highlights any mismatch.

**Acceptance scenarios**

1. Given three repeated `temp=0` trials for the same condition, when any trial differs in `decisionCode`, that row is marked as a mismatch.
2. Given the required coverage exists, when the tab renders, it shows exact `matchRate` and `differenceRate`.
3. Given trial coverage is incomplete, when the tab renders, the assumption displays `INSUFFICIENT DATA`.

### User Story 2 — Verify order invariance

As a researcher, I need to confirm that reversing option order does not change the semantic decision, so I know results are not artifacts of ordering.

**Independent test**: Compare baseline vs flipped-order condition pairs, normalize flipped decisions back to baseline semantic orientation, and verify the exact normalized match rate.

**Acceptance scenarios**

1. Given a flipped pair, when a response is compared, the flipped result is normalized to baseline semantic orientation before equality checks.
2. Given normalized decisions differ, the row is marked as a `decision_flip`.
3. Given pair-link or orientation metadata is invalid, the row is marked with the correct mismatch type and excluded from the comparable denominator.

### User Story 3 — Verify job-title invariance

As a researcher, I need to confirm that professional job-title wording does not materially change outcomes, so I can separate value preference from role-label framing.

**Independent test**: Compare titled vs generic paired conditions and verify exact change rates, row-level differences, and transcript drill-down.

**Acceptance scenarios**

1. Given titled/generic equivalent pairs, when decisions differ, the row is marked as changed.
2. Given pair-link metadata is missing, the row is marked `missing_pair` and excluded from the comparable denominator.
3. Given the required coverage exists, the tab shows exact `% changed` and `% matched`, not title-family rollups.

---

## Core Product Behavior

### Information Architecture

1. **Summary cards**: one per assumption, showing exact metrics and counts.
2. **Preflight review panel**: shown before execution, listing the exact vignette package and estimated run cost.
3. **Detail tables**: one per assumption with row-level evidence.
4. **Methods disclosure (`?`)**: shared methodology, normalization rules, and caveats.

### User Flow

1. User opens the Assumptions tab.
2. User reviews the selected vignette package, conditions, and estimated run cost in preflight.
3. User explicitly confirms the preflight review.
4. Trials execute (or existing results are loaded).
5. User sees exact percentages and row-level comparisons.
6. User clicks a row to inspect the exact transcript(s), prompt(s), and response(s).

### Display Semantics

- The UI displays exact percentages.
- `INSUFFICIENT DATA` is shown only when the required comparison volume is not met.
- The UI does **not** convert results into `TRUE`, `MIXED`, or `FALSE`.

---

## Vignette Package

All three assumptions use the same locked set of five professional-domain vignette families.

### Locked Production Set

1. `cmlsmyn9l0j3rxeiricruouia` — `Jobs (Self Direction Action vs Power Dominance)`
2. `cmlsn0pnr0jg1xeir147758pr` — `Jobs (Security Personal vs Conformity Interpersonal)`
3. `cmlsn216u0jpfxeirpdbrm9so` — `Jobs (Tradition vs Stimulation)`
4. `cmlsn2tca0jvxxeir5r0i5civ` — `Jobs (Benevolence Dependability vs Universalism Nature)`
5. `cmlsn384i0jzjxeir9or2w35z` — `Jobs (Achievement vs Hedonism)`

### Package Rationale

This package is used because:

- it covers all 10 current production values exactly once,
- the value pairs do not overlap, making failures easier to diagnose,
- it spans a broad range of professional tradeoffs,
- all five come from the same live `Jobs (...)` prompt family,
- each vignette family has a full `5 x 5` condition grid,
- the total run size is large enough to be credible but still practical.

### Condition Scope

Each selected vignette family includes **all 25 conditions** in its existing `5 x 5` condition grid.

This means:

- `#285`: 5 vignettes x 25 conditions x 3 repeats
- `#286`: 5 vignettes x 25 baseline conditions + 25 flipped conditions
- `#287`: 5 vignettes x 25 titled conditions + 25 generic conditions

### Vignette Strategy by Issue

- `#285`: reuse the locked package unchanged, with exact repeats.
- `#286`: reuse the same package, generating order-flipped variants per condition.
- `#287`: reuse the same package, generating generic no-title variants per condition.

For `#287`, the approved rewrite pattern is:

- start from: `A person is choosing between two work paths. Both options offer the same pay and practical benefits, but the day-to-day experience is very different.`
- describe each option by the underlying tradeoff, not the original job title
- keep response labels anchored to the semantic choice, not the removed title

---

## Computation Rules

### Shared Metrics

For each assumption:

- `matchRate = matchedComparisons / totalComparableComparisons`
- `differenceRate = 1 - matchRate`
- `modelMinMatchRate = minimum model-level matchRate`

The UI must display `matchRate` and `differenceRate` directly.

### Minimum Data Gates

- `#285`: at least `5 vignettes x all models x all conditions x 3 batches`
- `#286`: at least `5 vignettes x all models x all conditions x 1 batch`
- `#287`: at least `5 vignettes x all models x all conditions x 1 batch`

Below gate: `INSUFFICIENT DATA`.

### Temp=0 Determinism Rule (`#285`)

- Compare three identical trials for the same `(modelId, vignetteId, conditionKey)`.
- Any disagreement across the three trials marks the row as a mismatch.

### Order Normalization Rule (`#286`)

Decision scale: `1..5`

- `1 = strongly favors rendered right`
- `5 = strongly favors rendered left`

Normalization:

- if `orientationFlipped = false`, `normalized = rawDecision`
- if `orientationFlipped = true`, `normalized = 6 - rawDecision`

Mapping table:

- `1 -> 5`
- `2 -> 4`
- `3 -> 3`
- `4 -> 2`
- `5 -> 1`

Baseline semantic orientation is authoritative. All flipped responses must be converted into baseline semantic orientation before comparison.

### Job-Title Invariance Rule (`#287`)

- Compare titled vs generic paired conditions with identical model configuration.
- Mark the row as changed when the final `decisionCode` differs.
- Do not aggregate by title family.

---

## Data Model and Pairing

### Comparison Identity

Pairing is assumption-specific. There is no single universal comparison key.

Base identity fields:

- `assumptionKey`
- `modelId`
- `vignetteId`
- `runSignature`
- `promptHash`
- `parserVersion`

Issue-specific comparison keys:

- `#285`:
  - comparison group key: `(modelId, vignetteId, conditionKey)`
  - individual trial key inside the group: `trialIndex`
- `#286`: `(modelId, vignetteId, baselineScenarioId, flippedScenarioId)`
- `#287`: `(modelId, vignetteId, titledScenarioId, genericScenarioId)`

### Pairing Constraints

Shared hard constraints:

- same `modelId`
- same `modelVersion` (or provider snapshot identifier)
- same `signature`
- same `parserVersion`

Issue-specific constraints:

- `#285`:
  - identical prompt template
  - identical prompt payload
  - same `promptHash`
- `#286`:
  - approved baseline/flipped pair link required
  - prompt difference allowed only in order/orientation fields
  - same `promptFamily = order_invariance_v1`
- `#287`:
  - approved titled/generic pair link required
  - prompt difference allowed only in title-framing rewrite
  - same `promptFamily = job_title_invariance_v1`

Excluded reason codes:

- `model_version_mismatch`
- `signature_mismatch`
- `parser_version_mismatch`
- `invalid_prompt_family`
- `missing_pair_link`

### Storage Model

The selected unit is a vignette family, but execution happens at the scenario-condition level. The spec therefore requires two layers of stored metadata.

**A. Vignette family selection record**

- `assumptionKey`
- `vignetteId`
- `selectionReviewedBy`
- `selectionReviewedAt`
- `selectionRationale`

**B. Scenario condition execution record**

- `assumptionKey`
- `vignetteId`
- `sourceScenarioId`
- `conditionKey`
- `variantScenarioId`
- `variantType`
- `equivalenceReviewedBy` (`#286/#287` only)
- `equivalenceReviewedAt` (`#286/#287` only)

For `#286` and `#287`, pairing links must exist for each of the 25 conditions before runs are scheduled.

---

## API Contract

```ts
type AssumptionKey =
  | 'temp_zero_determinism'
  | 'order_invariance'
  | 'job_title_invariance';

type AssumptionStatus = 'COMPUTED' | 'INSUFFICIENT_DATA';

interface AssumptionSummary {
  key: AssumptionKey;
  title: string;
  status: AssumptionStatus;
  statusReason:
    | 'computed_successfully'
    | 'insufficient_pairs';
  matchRate: number | null;
  differenceRate: number | null;
  comparisons: number;
  excludedComparisons: number;
  modelsTested: number;
  vignettesTested: number;
  worstModelId: string | null;
  worstModelMatchRate: number | null;
}

interface AssumptionPreflight {
  key: AssumptionKey;
  vignettes: Array<{
    vignetteId: string;
    title: string;
    conditionCount: number;
    variantType: 'none' | 'flipped_order' | 'generic_framing';
    variantCount: number;
    rationale: string;
  }>;
  projectedPromptCount: number;
  projectedComparisons: number;
  estimatedInputTokens: number | null;
  estimatedOutputTokens: number | null;
  estimatedCostUsd: number | null;
  pricingSnapshotId: string | null;
  requiresReviewConfirmation: boolean;
}

interface AssumptionDifferenceRow {
  assumptionKey: AssumptionKey;
  modelId: string;
  vignetteId: string;
  conditionKey: string;
  sourceScenarioId: string;
  variantScenarioId: string | null;
  decisions: Array<{
    label: string; // e.g. batch_1, batch_2, batch_3, baseline, flipped, generic
    trial: number | null;
    transcriptId: string | null;
    decision: string | null;
    content: unknown | null;
  }>;
  isMatch: boolean;
  mismatchType:
    | 'decision_flip'
    | 'missing_pair'
    | 'invalid_mapping'
    | 'missing_trial'
    | null;
}

interface AssumptionsAnalysis {
  preflight: AssumptionPreflight[];
  summaries: AssumptionSummary[];
  details: Record<AssumptionKey, AssumptionDifferenceRow[]>;
  generatedAt: string;
}
```

---

## UI Specification

### Components

- `AssumptionsPreflightReview`
- `AssumptionsSummaryCards`
- `AssumptionDetailTable`
- `AssumptionTranscriptModal`
- `AssumptionsMethodsDisclosure`

### Preflight Review Requirements

Before runs launch, the preflight panel must show:

- exact selected vignettes
- included condition count
- pair links for `#286/#287`
- stored rationale
- projected prompt count
- projected comparison count
- estimated token usage
- estimated dollar cost (if pricing metadata exists)

The launch action must remain disabled until the user explicitly confirms preflight review.

### Cost Estimation Rule

The preflight cost estimate must be computed by:

1. rendering the exact prompts that will be sent,
2. estimating input tokens from the rendered prompts,
3. applying the current model pricing snapshot,
4. adding the standard assumptions-run output-token allowance.

The pricing snapshot used must be recorded in the payload.

### Detail Tables

`#285` detail layout:

- Render one table per vignette.
- Table columns:
  - `Model`
  - dynamic `Attribute A` name
  - dynamic `Attribute B` name
  - `Batch 1`
  - `Batch 2`
  - `Batch 3`
- `Attribute A` and `Attribute B` column titles must use the actual value/attribute names for that vignette.
- The cells under those columns must show the row's condition levels for those two attributes.
- Batch cells show the decision code only.
- Each row is clickable.

`#286` table columns:

- `Model`
- `Vignette`
- `Condition`
- `Baseline`
- `Flipped`
- `Normalized Match`
- `Reason`

`#287` table columns:

- `Model`
- `Vignette`
- `Condition`
- `Titled`
- `Generic`
- `Changed?`

### Drill-Down Behavior

Clicking a detail row opens `AssumptionTranscriptModal`.

The frontend must be able to fetch the exact transcript(s) for that row using:

- `(modelId, vignetteId, conditionKey, sourceScenarioId, variantScenarioId)`, and/or
- explicit `transcriptId` values returned in the row payload.

For `#285`, the modal should show the three batch transcripts directly in one view:

- `Batch 1`
- `Batch 2`
- `Batch 3`

Each batch block should show:

- decision code,
- transcript identifier (if present),
- exact prompt text,
- exact model response.

### UX Rules

- Show exact summary percentages directly.
- `INSUFFICIENT DATA` uses a gray chip/state.
- Show excluded-row counts in each section.
- Copy/export actions must be positioned consistently at the top-right of each table title.

---

## Approval and Execution Rules

Before any assumption run is scheduled:

1. The UI must show preflight review.
2. The author must document selected/created vignettes with IDs and rationale.
3. A reviewer must approve the selected vignette families:
   - record `selectionReviewedBy`
   - record `selectionReviewedAt`
4. For `#286` and `#287`, the reviewer must also approve each scenario-level pair:
   - record `equivalenceReviewedBy`
   - record `equivalenceReviewedAt`
5. No run may start until the required review metadata exists and preflight has been explicitly confirmed.

Partial approval sets are not allowed.

---

## Operations Model

Use a baseline + living-check model.

### Baseline

1. Create a baseline run snapshot.
2. Store run IDs, date, model versions, and pricing snapshot.
3. Export baseline evidence artifacts.

### Living Checks

Rerun checks when:

- model versions change,
- the assumption vignette package changes,
- a monthly drift schedule triggers.

### Automated Reruns

Automated drift-monitoring reruns may bypass manual preflight UI confirmation only when:

- they reuse an already approved vignette package,
- required review metadata is still valid,
- the pairing logic version is unchanged.

If the vignette package, pairing logic, or approval metadata changes, the next run must go back through manual preflight review and explicit confirmation.

Even when manual confirmation is bypassed, the system must still:

- compute a fresh run-cost estimate,
- use the current pricing snapshot,
- log that estimate for auditability.

---

## Out of Scope

- Abstract `TRUE/MIXED/FALSE` status labels
- Title-family aggregation for `#287`
- LLM-written narrative summaries of assumption outcomes
- Cross-domain assumptions dashboards
- User-configurable thresholds in the UI
- Statistical significance layers beyond deterministic comparison rules

---

## Open Questions

1. Should excluded comparison reasons be downloadable as a separate audit export?
2. Should the preflight panel allow partial model selection, or only the full default model set?
3. Should cost estimates be shown per assumption only, or also as one combined total for the full batch?
