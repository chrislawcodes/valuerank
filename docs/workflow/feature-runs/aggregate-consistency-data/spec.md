# Spec: Aggregate Pipeline — Consistency Data Emission

**Feature slug:** aggregate-consistency-data
**Created:** 2026-04-19
**Status:** draft
**Path:** Feature Factory (`docs/workflow/feature-runs/aggregate-consistency-data/`)

---

## Background

The Models / Consistency report (PRs #702, #704, #705) shipped with an external dependency: the aggregate analysis pipeline had to surface per-scenario Bernoulli counts and per-value-pair Coherence ingredients inside `reliabilitySummary.perModel[modelId]` before the report could render real numbers. Without that data, every model falls into the "Insufficient coverage" footer with reason `no-repeat-coverage`.

All the underlying numbers are **already computed** in `cloud/apps/api/src/services/analysis/aggregate/variance.ts`. This feature surfaces them in the emitted JSON, adds the per-pair Coherence section, and backfills existing `AGGREGATE` rows so historical analyses pick up the new shape.

---

## Discovery: Assumptions Carried In

Discovery complete, 10 assumptions recorded in workflow state. Summary:

- Backend-only. No GraphQL SDL changes, no new DB tables, no resolver or UI code changes.
- Consistency resolver already handles missing fields gracefully → purely additive on the pipeline side.
- Two PRs: **PR1** (Repeatability unblock — add `matches`/`trials` per scenario) + **PR2** (Coherence unblock — add `perPair` section + run/condition IDs). Backfill ships with PR2 or immediately after.
- Canonical net-pressure mapping `strongly:+2 / somewhat:+1 / neutral:0 / opponentSomewhat:−1 / opponentStrongly:−2`, per the Consistency feature plan Decision 4.
- `winRate = (strongly + somewhat) / (sampleCount − neutralCount)`; falls back to 0 when denominator is 0.
- Backfill is a CLI script, not a migration; replaces existing `CURRENT` analysis rows via standard supersede semantics; idempotent on re-run.

---

## Product Goal

Make the Models / Consistency report populate end-to-end without any resolver or UI changes.

1. After PR1 + partial backfill: Repeatability numbers and CIs render in the scatter and table.
2. After PR2 + full backfill: Coherence chips, per-pair drill-downs, order-effect panel, and deep-link URLs all populate.
3. No regression in any existing consumer of `reliabilitySummary.perModel` or the aggregate worker output.

---

## User Stories

### US-1 — Repeatability populates on the Consistency report (P1)

As a researcher opening `/models/consistency`, I want every model with `AGGREGATE`-eligible coverage to appear as a dot on the scatter and a row in the table with a valid Repeatability ± CI.

**Independent test:** Open `/models/consistency` against a database where PR1 has been merged and the backfill script has touched at least one analysis row. Scatter plots N dots for N covered models; each table row shows a numeric Repeatability with `± X.X%` range.

**Acceptance scenarios:**
1. **Given** PR1 has merged and `aggregate-consistency-backfill` has run, **when** the resolver reads any `AGGREGATE`-CURRENT row, **then** `reliabilitySummary.perModel[modelId].perScenario[scenarioId].matches` and `.trials` are integers ≥ 0.
2. **Given** a model has ≥ 1 scenario with `trials ≥ 2`, **when** the report renders, **then** that model appears as a dot on the scatter with a Repeatability value in (0, 1] and a CI width > 0.
3. **Given** a model has zero repeated scenarios, **when** the report renders, **then** that model stays in the "Insufficient coverage" footer with reason `no-repeat-coverage` — not silently promoted to the scatter.

### US-2 — Coherence populates on the Consistency report (P1)

As a researcher opening `/models/consistency`, I want the per-pair Coherence chips and order-effect panel to show real values when I drill into a model.

**Independent test:** Open the drill-down for any covered model after PR2 + backfill; chips show `ρ` and `p-value` for every value pair with enough canonical conditions; the "View condition matrix" and "View transcripts" links navigate to correct targets.

**Acceptance scenarios:**
1. **Given** PR2 has merged and backfill has run, **when** the resolver reads any `AGGREGATE`-CURRENT row, **then** `reliabilitySummary.perModel[modelId].perPair[valueKey]` exists for every value pair the model actually evaluated.
2. **Given** a value pair has ≥ 3 canonical conditions with non-zero pressure variance, **when** the chip renders, **then** `rho` is a number in [−1, 1], `pValue` is a number in [0, 1], `coherent` is boolean, `determinate` is true.
3. **Given** a value pair's pressure vector has zero variance (all conditions collapse to one net-pressure value), **when** the chip renders, **then** `determinate` is false and the chip shows the grey "indeterminate" style.
4. **Given** a drill-down chip is rendered, **when** I click "View condition matrix →", **then** the URL includes `domainId`, `modelId`, `valueKey`, and `signature` matching the chip's own values and the target page loads the correct `ConditionMatrix`.
5. **Given** a drill-down chip is rendered, **when** I click "View transcripts →", **then** the URL includes `targetAnalysisRunId`, `targetCompanionRunId`, `primaryConditionIds`, and `companionConditionIds` matching the chip's own data.

### US-3 — Backfill completes reliably (P1)

As an operator rolling out PR1 and PR2, I want a single command that re-runs the aggregate worker on every existing `AGGREGATE`-CURRENT row and supersedes the old rows with new ones carrying the extended shape.

**Independent test:** Run the CLI against a staging database; verify row counts before/after match, `CURRENT` count is preserved, `SUPERSEDED` count grows by the backfilled count, new rows contain the new fields.

**Acceptance scenarios:**
1. **Given** N `AGGREGATE`-CURRENT rows exist, **when** `npm run backfill:aggregate-consistency` completes without errors, **then** there are still exactly N `AGGREGATE`-CURRENT rows, N old rows marked `SUPERSEDED`, and every new `CURRENT` row contains the new `matches/trials/perPair` fields.
2. **Given** the backfill has already run once, **when** it runs again, **then** the pass is a no-op (all rows already contain the new fields) and exit is clean.
3. **Given** the backfill encounters a row it cannot process (missing transcripts, malformed config), **when** processing that row, **then** it logs a structured error, leaves the existing row untouched, and continues with the rest.
4. **Given** the backfill is interrupted mid-run, **when** re-started, **then** it resumes without duplicating work (rows already upgraded are skipped).

### US-4 — Downstream consumers see no regression (P1)

As a maintainer of the existing Models / Matrix page or the domain analysis view, I want zero behavioral change from these PRs.

**Independent test:** Unit and integration tests for `modelsAnalysis`, `domainAnalysis`, and any code path reading `reliabilitySummary` pass unchanged. Existing `baselineReliability`, `directionalAgreement`, `neutralShare`, and `coverageCount` values are bit-for-bit identical before and after.

**Acceptance scenarios:**
1. **Given** a specific `AGGREGATE` row before PR1, **when** the same row is re-run under PR1, **then** every field that existed before has the same value; only new fields are added.
2. **Given** the Models / Matrix page queries `modelsAnalysis` against an upgraded row, **when** the page renders, **then** the matrix, stability dots, and drawer show identical values to before.
3. **Given** the domain analysis value-detail page opens, **when** it queries transcripts for an upgraded row, **then** the condition matrix and transcript lists match the pre-upgrade output.

---

## Edge Cases

- **Scenario with zero trials for a model** — skip it entirely (don't emit `perScenario[scenarioId]` for that model on that scenario). Do not emit `{ matches: 0, trials: 0 }`, which the resolver would treat as "covered with zero data" — worse than missing.
- **Non-canonical condition labels** (scenario uses a label outside the 5-point grid) — emit the `perCondition` entry with `netPressureRank: null`. The resolver already marks such pairs `indeterminate`.
- **Neutral sweep** (a scenario where every trial was neutral) — `winRate` denominator is 0; emit `winRate: 0, matches: 0, trials: sampleCount`.
- **Single-trial scenario** (`sampleCount = 1`) — resolved: do **not** emit a `perScenario` entry for this model+scenario (FR-001). A single trial has zero trial pairs by definition. If every scenario a model has is single-trial, the model has no Repeatability coverage and falls into the "Insufficient coverage" footer — correct.
- **Pre-existing `perScenario` fields with non-numeric values** — never overwrite existing fields; add new fields alongside.
- **Backfill row that fails the worker** — log, skip, continue. At end, print a summary listing failed row IDs so a human can re-try manually.
- **Simultaneous aggregate worker runs during backfill** — standard CURRENT/SUPERSEDED locking should handle this, but verify. Add a `--lock` flag to the backfill CLI if race conditions appear.
- **Partial rollout** (PR1 shipped, PR2 not yet) — Consistency report shows Repeatability but every pair is marked `indeterminate` because `perPair` is missing. Graceful degrade.

---

## Functional Requirements

- **FR-001:** System MUST emit `reliabilitySummary.perModel[modelId].perScenario[scenarioId]` with `{ trials: Int!, matches: Int! }` **only for scenarios where the model has `sampleCount >= 2`**. Single-trial scenarios are deliberately excluded — they have no Bernoulli pair to agree about, and including them would pollute Repeatability with vacuously-matching ones. PR1 scope.
- **FR-002:** `trials` MUST equal `sampleCount` for that scenario. `matches` MUST equal the count of trial pairs within that scenario where both trials produced the same canonical decision bucket (see FR-002a). This is a pair-agreement metric, distinct from `sameCount` / `directionalAgreement` (which counts samples matching the median direction — a different question). PR1 scope.
- **FR-002a:** `matches` counting rule: for a scenario with `n` trials distributed across the 5 canonical decision buckets with counts `c_1 ... c_5` (where `sum(c_i) = n`), compute in O(k) time:
  - `trials = n * (n - 1) / 2` (total ordered trial pairs)
  - `matches = sum over each bucket i of (c_i * (c_i - 1) / 2)`
  The O(k) closed form is equivalent to the O(n²) pair enumeration: both count the pairs whose two trials fell into the same canonical bucket. The bucket counts are the existing `directionCounts` values (`strongly`, `somewhat`, `neutral`, `opponentSomewhat`, `opponentStrongly`).
- **FR-003:** System MUST preserve every field currently in `perScenario` with bit-identical values (`variance`, `mean`, `sd`, `direction`, `directionCounts`, `directionalAgreement`, `medianSignedDistance`, `iqr`, `neutralShare`, `orientationCorrected`, `sampleCount`). PR1 scope.
- **FR-004:** System MUST emit `reliabilitySummary.perModel[modelId].perPair: Record<valueKey, PairSummary>` in PR2 scope, where `PairSummary` contains:
  - `targetAnalysisRunId: String!`
  - `targetCompanionRunId: String | null`
  - `primaryConditionIds: [String!]!`
  - `companionConditionIds: [String!]!`
  - `perCondition: [PerCondition!]!`
- **FR-005:** Each `PerCondition` MUST contain `{ scenarioId, netPressureRank: Int | null, winRate: Float, matches: Int, trials: Int }`. `netPressureRank` follows the canonical mapping `strongly:+2 / somewhat:+1 / neutral:0 / opponentSomewhat:−1 / opponentStrongly:−2` for target appeal minus opposing appeal; `null` if any label is non-canonical.
- **FR-006:** `winRate` MUST be computed from the **orientation-normalized** canonical bucket counts already in `directionCounts`. The 5-bucket system (`strongly`, `somewhat`, `neutral`, `opponentSomewhat`, `opponentStrongly`) is already normalized against the scenario's `orientationFlipped` flag by upstream code (`resolveTranscriptDecisionModel`), so `strongly` / `somewhat` always mean "favor the target value" regardless of whether the scenario was originally `A→B` or `B→A`. Given that:
  - `winRate = (directionCounts.strongly + directionCounts.somewhat) / denom`
  - `denom = sampleCount - directionCounts.neutral` when that difference is > 0
  - `denom = 1` (forced) when every trial was neutral; in that case `winRate = 0` signals "no directional signal" rather than dividing by zero
  No re-examination of raw transcripts is required; all inputs are integer counts already on the existing `perScenario` payload.
- **FR-007:** System MUST provide a CLI `backfill-aggregate-consistency.ts` (or similar) in `cloud/apps/api/src/cli/` that iterates every `CURRENT` + `AGGREGATE` analysis row, re-runs the aggregate worker, and writes a new analysis row replacing the existing CURRENT one via the standard supersede pathway.
- **FR-008:** Backfill MUST be idempotent — a second run produces no new rows on rows already upgraded. Idempotency check: inspect `reliabilitySummary.perModel[<any-model-with-coverage>].perScenario[<any-scenario>].matches` — if present, the row is already upgraded and is skipped.
- **FR-008a:** Backfill MUST serialize with live `aggregate-run-workflow` executions via the existing `CURRENT`→`SUPERSEDED` transition (a single DB transaction that atomically flips the old row's status and inserts the new one). Concurrent aggregate workers writing to the same `runId` will see one of two outcomes: either both succeed serially (newer supersedes older), or the second detects its base row is already `SUPERSEDED` and aborts cleanly. No new locking primitive is added by this feature.
- **FR-009:** Backfill MUST log each row's outcome (upgraded, skipped, failed) with a structured logger call.
- **FR-010:** Backfill MUST be runnable against a single definition or domain via an optional flag for staged rollouts.
- **FR-011:** System MUST NOT change the shape of any field consumed by `modelsAnalysis`, `domainAnalysis`, `analysis`, or any other existing resolver reading `reliabilitySummary`.
- **FR-012:** System MUST NOT introduce any changes to the GraphQL SDL or schema file (`cloud/apps/web/schema.graphql`).
- **FR-013:** The Zod contract at `cloud/apps/api/src/services/analysis/aggregate/contracts.ts:197` MUST be extended to type the new fields; the contract MUST continue to accept historical rows missing the fields (optional with a default or `.optional()`).

---

## Success Criteria

- **SC-001:** After PR1 + backfill, the Consistency report renders a non-empty scatter for every model with ≥ 1 repeated scenario.
- **SC-002:** After PR2 + backfill, the drill-down panel renders per-pair Coherence chips for every determinate pair a model has evaluated.
- **SC-003:** No `@valuerank/api`, `@valuerank/web`, or `@valuerank/shared` test regression.
- **SC-004:** Backfill completes on the full production dataset in under 30 minutes (aspirational; confirm on staging first).
- **SC-005:** Existing `baselineReliability`, `directionalAgreement`, `neutralShare`, and `coverageCount` values are bit-identical on rows re-processed by the backfill.
- **SC-006:** Every row that ran through the backfill has a log line recording the outcome.

---

## Non-Goals

- Changes to the Consistency resolver, types, Pothos shapes, or UI.
- Changes to the GraphQL SDL.
- New analysis types or new queue entries.
- Recomputing decisions or changing the decision-model contract.
- Any modification to the cross-domain Stability metric (the existing Models / Matrix signal).
- Live re-run of the aggregate worker on transcript arrival (that's a separate pipeline concern).
- A UI for monitoring backfill progress (logs suffice for v1).

---

## Open Questions

*(To be resolved during plan phase unless otherwise noted.)*

1. Should `perPair` be keyed by `valueKey` alone or by `{ domainId, valueKey }`? Given a single `AGGREGATE` row belongs to one definition (and hence one domain + value pair), a single valueKey key is likely sufficient. Confirm with a quick look at the worker's grouping.
2. Which CLI entry point pattern to follow — the `cli/create-user.ts`-style standalone script or a `cli/normalize.ts`-style runner? Plan phase picks one.
3. For the idempotency check: does a row already contain the new shape? Simplest: look at `reliabilitySummary.perModel[<first-model>].perScenario[<first-scenario>].matches`. Plan phase confirms.

---

## Dependencies

- `cloud/apps/api/src/services/analysis/aggregate/variance.ts` must continue to expose the underlying values used by the new fields. Any refactor of `variance.ts` outside this feature must preserve the fields.
- The aggregate worker's `variance` output shape is consumed by the resolver parser in `modelsConsistencyData.ts`. Any further worker changes should coordinate with that parser.
- Canonical condition labels (`strongly`, `somewhat`, `neutral`, `opponentSomewhat`, `opponentStrongly`) must continue to be the canonical label set. Widening the label set is out of scope and would require a separate feature.
- Standard `CURRENT`/`SUPERSEDED` analysis-row semantics in the DB schema.

---

## Glossary (terms reused from the Consistency feature)

| Term | Meaning | Source |
|---|---|---|
| Repeatability | Per-model within-scenario test-retest agreement, aggregated via random-effects meta-analysis | Consistency feature plan Decision 1 |
| Coherence | Per-model fraction of value pairs with a significant monotonic pressure-response (Spearman ρ ≥ 0.8, p < 0.05) | Consistency feature plan FR-003 |
| Net pressure | `(target value appeal) − (opposing value appeal)` using canonical labels mapped to `±2 / ±1 / 0` | Consistency feature plan Decision 4 |
| Win rate (per condition) | Orientation-normalized: `(directionCounts.strongly + directionCounts.somewhat) / max(sampleCount − directionCounts.neutral, 1)`. See FR-006 for the canonical-bucket provenance and the all-neutral edge case. | This spec FR-006 |
| Matches / trials (per scenario) | Bernoulli pair used by Repeatability. `trials = C(n, 2)` = number of ordered trial pairs. `matches` = number of those pairs where both trials produced the same canonical decision bucket. Scenarios with n < 2 are omitted. | This spec FR-001, FR-002, FR-002a |
| CURRENT / SUPERSEDED | Standard analysis-row statuses used throughout the aggregate pipeline | `AnalysisResult.status` column |
