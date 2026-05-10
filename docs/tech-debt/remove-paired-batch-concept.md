# Remove the Paired-Batch Concept

**Status:** Planning
**Last updated:** 2026-05-09
**Owner:** chrislaw

## TL;DR

We are removing the launch-time and storage-time concept of "paired batches" from the codebase. The scientific basis for paired vignettes (mirrored value tokens to cancel presentation-order bias) stays. What goes away is the explicit launch grouping (`jobChoiceBatchGroupId`, `jobChoiceLaunchMode`), the redundant `pair_key` UUID on definitions, the explicit `companionRunId` pointer, and the analyses that depend on launch-time grouping.

After this work:

- Definitions are still authored as mirrored pairs.
- Partners are found at query time by matching mirrored value tokens (already implemented in `findPairedCompanion`).
- Analysis pools data per value tradeoff, not per launch event.
- Launching no longer has a "pair-aware" mode.

## ⚠️ Methodology hold during transition

**Do not start new paired-batch trials we plan to use as production analysis data until this work lands.** The launch-side tagging is currently inconsistent (`executeLaunchRuns` does not tag pairs at all — see "Surfaces broken on first-time launch" below), the data model is changing, and analysis-layer joins are being repointed. Any trial run started now produces data whose pair-direction labels and companion pointers may be wrong, missing, or interpreted differently after the cleanup.

Safe during the transition: reviewing historical runs that completed before this work began, authoring new vignettes, editing analysis code. Risky: kicking off new paired batches and treating their output as canonical.

## Adversarial review findings (incorporated 2026-05-09)

Three reviewers (Gemini, Codex, Claude) audited an earlier draft of this doc. Findings that materially changed the plan:

1. **`companionRunId` is not a tagalong field.** It powers (a) the paired-analysis-mode transcript-comparison UI, (b) the Models Consistency / order-effect analysis report at [models-consistency.ts:44](../../cloud/apps/api/src/graphql/queries/models-consistency.ts:44), and (c) the aggregate-analysis preparation pipeline at [aggregate-preparation.ts:284](../../cloud/apps/api/src/services/analysis/aggregate/aggregate-preparation.ts:284). It also has an atomic mutual-pairing mutation ([lifecycle-helpers.ts:48 `persistPairedCompanionRunIds`](../../cloud/apps/api/src/graphql/mutations/run/lifecycle-helpers.ts:48)). See **Decision 4** below.

2. **`jobChoiceValueFirst` is read, not just stored.** [domain-coverage-utils.ts:294](../../cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts:294) and [domain-coverage.ts:284](../../cloud/apps/api/src/graphql/queries/domain-coverage.ts:284) use it to count coverage by *direction* (which side of the pair a run covered). Dropping it without a backfill silently misclassifies historical runs in coverage matrices.

3. **`runCategory` semantics change for callers.** [lifecycle.ts:105](../../cloud/apps/api/src/graphql/mutations/run/lifecycle.ts:105) defaults to `'PRODUCTION'` when `launchMode === 'PAIRED_BATCH'`. After Wave 4 deletes `launchMode`, callers that relied on this default silently produce runs with `'UNKNOWN_LEGACY'`. Treat as a breaking change in default behavior.

4. **GraphQL operation files request fields the schema-removal step would orphan.** Codegen does not catch these — queries fail at runtime. Files to edit in lockstep with each schema change: `runs.graphql`, `pressureSensitivity.graphql`, `domains.graphql`, `active-evaluation.graphql`, `modelsConsistency.graphql`, plus `cloud/tests/snapshot-baselines/queries/pressure-sensitivity.graphql`. Listed in section B below.

5. **JSON export endpoint dumps `Run.config` wholesale.** [routes/export/runs.ts:272](../../cloud/apps/api/src/routes/export/runs.ts:272) serializes the entire config blob. External consumers reading `jobChoice*` or `companionRunId` from the export see a contract change.

6. **`Definition.pairedSibling` resolver rewrite is bigger than a tweak.** The earlier draft implied a small switch; in fact [definition-paired-sibling.ts:31](../../cloud/apps/api/src/graphql/types/definition-paired-sibling.ts:31) hard-filters by `pair_key` *before* token matching runs. This is a real rewrite, not a one-line change.

7. **UI files the earlier inventory missed:** [DefinitionDetail.tsx:187](../../cloud/apps/web/src/pages/DefinitionDetail/DefinitionDetail.tsx:187) (routes paired definitions to the paired-batch start page based on `pair_key`), [DefinitionContentView.tsx:23](../../cloud/apps/web/src/pages/DefinitionDetail/DefinitionContentView.tsx:23) (uses `pair_key` to collapse shared scales), [AnalysisDetailHeader.tsx](../../cloud/apps/web/src/pages/AnalysisDetailHeader.tsx), and the entire **paired-mode transcript view** stack: [analysisTranscriptParams.ts](../../cloud/apps/web/src/utils/analysisTranscriptParams.ts), [useAnalysisTranscriptsData.ts](../../cloud/apps/web/src/hooks/useAnalysisTranscriptsData.ts), [useAnalysisTranscriptParams.ts](../../cloud/apps/web/src/hooks/useAnalysisTranscriptParams.ts), [AnalysisDetail.tsx:173,175,305](../../cloud/apps/web/src/pages/AnalysisDetail.tsx:173).

8. **Surfaces broken on first-time domain launch.** [executeLaunchRuns](../../cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts:50) does not currently set `jobChoiceLaunchMode` or `jobChoiceBatchGroupId`. Any feature that reads those fields (PAIR_ASYMMETRY anomaly, coverage dedup, paired-analysis mode, Models Consistency) is silently broken for first-time domain-launched runs. The cleanup plan inherits the bug as the deletion target — but during the transition it means any new paired batch on a new domain has unreliable pair metadata, which is the basis for the methodology hold above.

9. **Admin script silently breaks.** [cloud/scripts/backfill-reparse-decisions.ts](../../cloud/scripts/backfill-reparse-decisions.ts) filters historical runs by `jobChoiceLaunchMode IN ('PAIRED_BATCH', 'PAIRED_BATCH_TOPUP')`. Survives Wave 4 (the JSON value persists in old rows) but breaks if the optional Wave 5 cleanup script strips the field.

## Decisions on file

| # | Decision | Resolution | Date |
|---|---|---|---|
| 1 | Keep "launch both halves together" UX? | **No.** Drop pair-aware launch entirely. Each definition launches as an independent run. | 2026-05-09 |
| 2 | Keep PAIR_ASYMMETRY anomaly detector? | **No (Option A).** Delete. | 2026-05-09 |
| 3 | Keep PAIRED_BATCH_TOPUP feature? | **No.** Delete. If one side has fewer probes, that's the run's reality. | 2026-05-09 |
| 4 | What happens to "paired-mode" features (transcript-comparison view, Models Consistency report, aggregate-prep)? | **Repoint to `Definition.pairedSibling` (Option B).** Find the partner via mirrored value tokens at query time, drop the stored `companionRunId` pointer. Tests already exercise this fallback at [AnalysisConditionDetail.test.tsx:711](../../cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx:711) ("uses pairedSibling on the run definition to resolve the companion when companionRunId is absent"). | 2026-05-09 |

## What stays vs. what goes

### Stays (the science)

- Mirrored value tokens on definitions (`value_first.token`, `value_second.token`)
- `findPairedCompanion`, `getComponentTokens`, `areMirroredPair`, `isValidPair` in `cloud/apps/api/src/utils/auto-pair.ts`
- `paired-definition.ts` (token normalization helpers)
- The `pairedSibling` GraphQL resolver on `Definition`, but rewritten to use only token-mirror matching
- Analysis-time grouping by canonical value tokens (the `pairKey` *variable name* in analysis files like `value-win-rate-aggregation.ts` and `pressure-sensitivity/snapshot-compute.ts` — these are constructed strings, not the stored field, and they are correct as-is)
- The `RunCategory` enum and the historical run_category column

### Goes (the launch / storage grouping)

- `Definition.content.methodology.pair_key` (the UUID field)
- `Run.config.jobChoiceBatchGroupId`
- `Run.config.jobChoiceLaunchMode` (and all four values: `PAIRED_BATCH`, `PAIRED_BATCH_TOPUP`, `AD_HOC_BATCH`, `STANDARD`)
- `Run.config.jobChoiceValueFirst`
- `Run.config.methodologySafe`
- `Run.config.companionRunId`
- The GraphQL fields `Definition.pairKey`, `Run.pairedBatchGroupId`, `Run.companionRunId`, `Run.launchMode` input on `startRun`
- The PAIRED_BATCH_TOPUP launch mode and its top-up logic
- The pair-aware code paths in domain launch (`pair-grouping.ts`, the launch-mode branching in `lifecycle.ts`)
- The deprecated client-side `legacyCompanionPairedRun.ts` (already tombstoned)
- The `StartPairedBatchPage` and the launch-mode picker in the run form

## Resolved: PAIR_ASYMMETRY anomaly detector — DELETE (Option A, 2026-05-09)

**What it does today:** When a run completes, the detector finds sibling runs that share the same `jobChoiceBatchGroupId`, computes each sibling's probe-success rate, and flags the run if its rate differs from any sibling by more than `PAIR_ASYMMETRY_THRESHOLD_PCT` (currently `0` — i.e., any measurable difference). Min sample size is `PAIR_ASYMMETRY_MIN_PROBES = 10`.

**Why it exists:** Catches cases where a model succeeds on one side of a pair and fails on the other — usually a refusal pattern that depends on which value is mentioned first, or a prompt-format-sensitivity bug.

**Why it can't survive this cleanup as written:** It is keyed on `jobChoiceBatchGroupId`. If we drop that field, the detector returns `null` for every run.

**Options:**

| Option | What it does | Cost |
|---|---|---|
| A. Delete the detector | Drop the type from the enum, the detection function, the threshold constants, the audit/reconcile call sites. | Lose the signal entirely. |
| B. Rewrite to use mirrored-token sibling lookup | Find the partner via `findPairedCompanion`. Compare success rates only when both halves are pooled within some recency window. | Real engineering work; the time-window heuristic is fragile. |
| C. Replace with a definition-level signal | Rather than per-batch, compare aggregate success rates across all runs of mirrored definitions. | Different semantics; would catch persistent bias but miss transient batch-specific issues. |

**Resolution (2026-05-09):** Option A — delete. Reasoning: the detector currently fires on `>0%` delta which is noisy, and the signal it provides is already covered by `INVALID_RESPONSE_FAILURE` plus general per-model error tracking. If we want partner-level diagnostics later, we'll add a definition-level cross-mirror comparison in the analysis page (not anomaly-shaped).

## Inventory of changes

### A. Database / storage

| Field | Action | Notes |
|---|---|---|
| `Definition.content.methodology.pair_key` | Stop writing in seeds and `ensure-domain-vignette-pair`. Optional one-shot script to strip from existing rows. | JSON field — no DDL needed |
| `Run.config.jobChoiceBatchGroupId` | Stop writing in `lifecycle.ts`, `executeBackfillRuns`, `plan-slots.ts`. Optional cleanup script. | JSON field — no DDL needed |
| `Run.config.jobChoiceLaunchMode` | Stop writing. Optional cleanup script. | JSON field — no DDL needed |
| `Run.config.jobChoiceValueFirst` | **Read by coverage analysis** ([domain-coverage-utils.ts:294](../../cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts:294), [domain-coverage.ts:284](../../cloud/apps/api/src/graphql/queries/domain-coverage.ts:284)). Before stopping writes: rewrite coverage to compute direction from the run's definition value tokens. Then stop writing. | JSON field — no DDL — but coverage rewrite is required, not optional |
| `Run.config.methodologySafe` | Stop writing. | JSON field — no DDL needed |
| `Run.config.companionRunId` | Repoint readers to `Definition.pairedSibling` first (paired-mode UI, Models Consistency, aggregate-prep, the [persistPairedCompanionRunIds](../../cloud/apps/api/src/graphql/mutations/run/lifecycle-helpers.ts:48) mutation). **Then** stop writing. See Wave 3.5 below. | JSON field — no DDL — but repoint work is non-trivial |

No Prisma schema migrations required for the JSON fields. The `RunCategory` enum and the `run_category` column stay; they were already backfilled in [20260320150000_backfill_paired_batch_run_category](../../cloud/packages/db/prisma/migrations/20260320150000_backfill_paired_batch_run_category/migration.sql) so historical rows are already correct. New runs must continue to set `runCategory` directly.

### B. GraphQL schema and operation files (breaking changes)

| Field | Type / mutation | Action | Wave |
|---|---|---|---|
| `Definition.pairKey` | exposed string | Remove | 2 |
| `Definition.pairedSibling` | resolver | **Rewrite** (current resolver hard-filters by `pair_key` first; needs to be token-only) | 2 |
| `Run.pairedBatchGroupId` | exposed string | Remove | 3 |
| `Run.companionRunId` | exposed string | Remove **after** Wave 3.5 repoints consumers | 4 |
| `Run.launchMode` (on `startRun` input) | enum input | Remove or accept-and-ignore | 4 |
| `DomainEvaluationLaunchableDefinition.pairKey` | string | Remove | 2 |

GraphQL **operation files** that select these fields — must edit in lockstep with the corresponding schema change in the same wave, otherwise codegen passes but queries fail at runtime:

| File | Selects | Wave |
|---|---|---|
| [cloud/apps/web/src/api/operations/runs.graphql](../../cloud/apps/web/src/api/operations/runs.graphql) (lines 11, 13) | `companionRunId`, `pairedBatchGroupId` | 3 / 4 |
| [cloud/apps/web/src/api/operations/pressureSensitivity.graphql](../../cloud/apps/web/src/api/operations/pressureSensitivity.graphql) (lines 54, 121) | `pairKey` | 2 |
| [cloud/apps/web/src/api/operations/domains.graphql](../../cloud/apps/web/src/api/operations/domains.graphql) (line 178) | `pairKey` (paired field) | 2 / 3 |
| [cloud/apps/web/src/api/operations/active-evaluation.graphql](../../cloud/apps/web/src/api/operations/active-evaluation.graphql) (line 23) | `pairKey` (and downstream paired metadata) | 2 |
| [cloud/apps/web/src/api/operations/modelsConsistency.graphql](../../cloud/apps/web/src/api/operations/modelsConsistency.graphql) (line 54) | (verify; consumed by [models-consistency.ts](../../cloud/apps/api/src/graphql/queries/models-consistency.ts)) | 3.5 |
| [cloud/tests/snapshot-baselines/queries/pressure-sensitivity.graphql](../../cloud/tests/snapshot-baselines/queries/pressure-sensitivity.graphql) (lines 39, 95) | `pairKey` | 2 |

Run `npm run codegen --workspace @valuerank/web` after each schema change. Do not let the web generated types drift.

### B.1. Public API contract surface

| Surface | Change | Wave |
|---|---|---|
| [routes/export/runs.ts:272](../../cloud/apps/api/src/routes/export/runs.ts:272) JSON export | Serializes `run.config` whole; external consumers reading `jobChoice*` or `companionRunId` from the export see a contract change. | 4 — call out in changelog/release notes |
| `runCategory` default for `startRun` callers ([lifecycle.ts:105](../../cloud/apps/api/src/graphql/mutations/run/lifecycle.ts:105)) | After Wave 4, `parsedRunCategory ?? (launchMode === 'PAIRED_BATCH' ? 'PRODUCTION' : undefined)` becomes `parsedRunCategory ?? undefined`. Callers that relied on PAIRED_BATCH defaulting to PRODUCTION must pass `runCategory: 'PRODUCTION'` explicitly. | 4 |

### C. Backend services and queue handlers

| File | Change | Wave |
|---|---|---|
| [auto-pair.ts](../../cloud/apps/api/src/utils/auto-pair.ts) | Keep — pure value-token logic, no `pair_key` reads | — |
| [paired-definition.ts](../../cloud/apps/api/src/utils/paired-definition.ts) | Keep | — |
| [pressure-sensitivity/snapshot-builder.ts](../../cloud/apps/api/src/services/pressure-sensitivity/snapshot-builder.ts) | Drop `pair_key` prefilter (lines ~267–285); query by `domainId` and let `findPairedCompanion` do the matching. **NB:** unlike other analysis files, this one really does read the stored `methodology.pair_key` field (Prisma `path` filter at line 283) — a real rewrite, not a tweak | 2 |
| [definition-paired-sibling.ts](../../cloud/apps/api/src/graphql/types/definition-paired-sibling.ts) | **Rewrite** the resolver. Current code hard-filters by `pair_key` *before* token matching runs; must become token-only. Drop the `pair_key` `where` clause; iterate domain candidates and match by mirrored tokens | 2 |
| [ensure-domain-vignette-pair.ts](../../cloud/apps/api/src/graphql/mutations/ensure-domain-vignette-pair.ts) | Stop generating and writing `pair_key` UUIDs | 2 |
| `cloud/scripts/seed-*-pairs.ts` (multiple) | Stop writing `pair_key`. Audit each script. | 2 |
| [anomaly-detection.ts — `detectPairAsymmetry`](../../cloud/apps/api/src/services/run/anomaly-detection.ts) | Delete (per Option A above; revisit if Decision 2 changes) | 3 |
| [anomaly-thresholds.ts](../../cloud/apps/api/src/services/run/anomaly-thresholds.ts) | Drop `PAIR_ASYMMETRY_THRESHOLD_PCT`, `PAIR_ASYMMETRY_MIN_PROBES` | 3 |
| [run-anomaly.ts](../../cloud/apps/api/src/graphql/types/run-anomaly.ts) | Drop `'PAIR_ASYMMETRY'` from `RunAnomalyTypeEnum` and the label map | 3 |
| [run-state-reconcile.ts](../../cloud/apps/api/src/queue/handlers/run-state-reconcile.ts) | Remove the two `detectPairAsymmetry` call sites and their `syncAnomalies` lines | 3 |
| [run-state-audit.ts](../../cloud/apps/api/src/queue/handlers/run-state-audit.ts) | Remove `'PAIR_ASYMMETRY'` from `scannedTypes` | 3 |
| [domain-coverage-utils.ts — `deduplicateRunsByGroupId`, `getCoverageBatchGroupId`](../../cloud/apps/api/src/graphql/queries/domain-coverage-utils.ts) | Replace dedup-by-batchGroupId with dedup-by-mirror-pair (find each run's mirror partner, treat both as one coverage unit). Remove `getCoverageBatchGroupId`. | 3 |
| [domain-coverage-utils.ts:294 + domain-coverage.ts:284](../../cloud/apps/api/src/graphql/queries/domain-coverage.ts:284) | Replace `config.jobChoiceValueFirst` reads with direction computed from the run's definition value tokens. Required before `jobChoiceValueFirst` writes can stop, otherwise historical-run direction labels are lost. | 3 |
| [models-consistency.ts](../../cloud/apps/api/src/graphql/queries/models-consistency.ts) | **Repoint** to `Definition.pairedSibling` for run pairing. Currently joins runs by `companionRunId` for order-effect analysis. After Wave 3.5: find partner via mirrored definition + same model + same window. | 3.5 |
| [aggregate-preparation.ts](../../cloud/apps/api/src/services/analysis/aggregate/aggregate-preparation.ts) | Stop reading `companionRunId` from template config. Use `pairedSibling` resolver to derive partner if needed. | 3.5 |
| [lifecycle-helpers.ts — `persistPairedCompanionRunIds`, `mergeCompanionRunId`, `getConfiguredCompanionRunId`](../../cloud/apps/api/src/graphql/mutations/run/lifecycle-helpers.ts) | Delete after Wave 3.5 repoints consumers. The atomic mutual-pairing mutation is no longer needed once pairing is derived from value tokens. | 4 |
| [pair-grouping.ts](../../cloud/apps/api/src/graphql/mutations/domain/launch/pair-grouping.ts) — `groupDefinitionsByPairKey`, `extractPairedMethodology` | Delete entirely. Domain launch becomes "launch each definition independently." | 3 |
| [execute-runs.ts — `executeLaunchRuns`](../../cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts) | Drop the `LaunchSlot.configExtras` plumbing for pair info. Each run launches without a group ID. | 3 |
| [execute-runs.ts — `executeBackfillRuns`](../../cloud/apps/api/src/graphql/mutations/domain/launch/execute-runs.ts) | Drop the `jobChoiceLaunchMode: 'PAIRED_BATCH'` and `batchGroupId` stamping (line ~143) | 3 |
| [plan-slots.ts](../../cloud/apps/api/src/graphql/mutations/domain/launch/plan-slots.ts) | Drop pair-grouped slot allocation; treat each definition as a single slot | 3 |
| [plan-backfill.ts](../../cloud/apps/api/src/graphql/mutations/domain/launch/plan-backfill.ts) | Same | 3 |
| [resolve-backfill.ts](../../cloud/apps/api/src/graphql/mutations/domain/launch/resolve-backfill.ts) | Audit `runMatchesSingleModel`; remove pair-aware branches | 3 |
| [backfill-orchestrator.ts](../../cloud/apps/api/src/graphql/mutations/domain/launch/backfill-orchestrator.ts) | Drop pair-aware backfill mode | 3 |
| [launch-orchestrator.ts](../../cloud/apps/api/src/graphql/mutations/domain/launch/launch-orchestrator.ts) | Drop the `groupDefinitionsByPairKey` call (lines ~97–103) and the `incompletePairKeys` warning | 3 |
| [run/lifecycle.ts](../../cloud/apps/api/src/graphql/mutations/run/lifecycle.ts) | Remove the `launchMode` input handling (lines 87, 105, 117–204). Single mutation path: launch this definition. | 4 |
| [paired-vignette-helpers.ts](../../cloud/apps/api/src/graphql/mutations/paired-vignette-helpers.ts) | Audit; likely retained for paired-authoring helpers, drop any `pair_key` reads | 2 |
| [start.ts](../../cloud/apps/api/src/services/run/start.ts) | Audit `configExtras` flow; remove pair fields from sanitization | 4 |
| [active-run-check.ts](../../cloud/apps/api/src/graphql/mutations/domain/launch/active-run-check.ts) | No change (already uses `definitionId`) | — |
| Top-up handler — `PAIRED_BATCH_TOPUP` paths in [top-up-probes.ts](../../cloud/apps/api/src/queue/handlers/top-up-probes.ts) | Delete the pair-aware top-up. Keep generic top-up for individual runs. | 4 |

### D. Web (UI)

| File | Change | Wave |
|---|---|---|
| [legacyCompanionPairedRun.ts](../../cloud/apps/web/src/utils/legacyCompanionPairedRun.ts) | Delete (already `@deprecated` tombstone) | 5 |
| [methodology.ts](../../cloud/apps/web/src/utils/methodology.ts) | Drop `pair_key` parsing, the `methodology.pair_key` field, the `pair_key` validity helper | 2 |
| [DefinitionDetail.tsx:187](../../cloud/apps/web/src/pages/DefinitionDetail/DefinitionDetail.tsx:187) | Drop `pair_key`-based routing to the paired-batch start page | 2 |
| [DefinitionContentView.tsx:23](../../cloud/apps/web/src/pages/DefinitionDetail/DefinitionContentView.tsx:23) | Drop `pair_key`-based shared-scale collapse logic; use mirrored value tokens to detect pair-membership instead | 2 |
| [AnalysisDetailHeader.tsx](../../cloud/apps/web/src/pages/AnalysisDetailHeader.tsx) | Audit; remove pair-batch references | 4 |
| [AnalysisDetail.tsx:173,175,305](../../cloud/apps/web/src/pages/AnalysisDetail.tsx:173) | Replace `run.companionRunId` reads with `Definition.pairedSibling` lookups (or sibling-run derived from server) | 3.5 |
| **Paired-mode transcript view stack** — [analysisTranscriptParams.ts](../../cloud/apps/web/src/utils/analysisTranscriptParams.ts), [useAnalysisTranscriptsData.ts](../../cloud/apps/web/src/hooks/useAnalysisTranscriptsData.ts), [useAnalysisTranscriptParams.ts](../../cloud/apps/web/src/hooks/useAnalysisTranscriptParams.ts), [pairedScopeAdapter.ts](../../cloud/apps/web/src/utils/pairedScopeAdapter.ts) | Repoint all `companionRunId` reads to derive partner from `Definition.pairedSibling`. Keep the URL parameter `mode=paired&companionRunId=Y` working as a transitional input but compute it from the sibling resolver if missing. ~76 references across web. | 3.5 |
| Paired-analysis tests — [AnalysisTranscripts.test.tsx](../../cloud/apps/web/tests/pages/AnalysisTranscripts.test.tsx), [AnalysisConditionDetail.test.tsx](../../cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx) | Update fixtures to assert sibling-derived companion (the test at AnalysisConditionDetail.test.tsx:711 already covers the absent-companionRunId fallback path) | 3.5 |
| [PressureSensitivityDetail.tsx](../../cloud/apps/web/src/components/models/PressureSensitivityDetail.tsx), [PressureSensitivitySanityCheck.tsx](../../cloud/apps/web/src/components/models/PressureSensitivitySanityCheck.tsx) and their tests | These display constructed `pairKey` values from the analysis API response — the field name overlaps but the values are local sort keys. Verify after Wave 2's GraphQL changes that these still receive the constructed string, not the deleted UUID. | 2 (verify) |
| [run-json-types.ts](../../cloud/apps/web/src/api/run-json-types.ts) | Drop `jobChoiceLaunchMode`, `jobChoiceBatchGroupId` from `RunConfig` types | 4 |
| [pairedScopeAdapter.ts](../../cloud/apps/web/src/utils/pairedScopeAdapter.ts) | Audit. Likely keep for analysis-level pair scoping (which uses value tokens), drop any reads of stored pair fields | 4 |
| [StartPairedBatchPage.tsx](../../cloud/apps/web/src/pages/DefinitionDetail/StartPairedBatchPage.tsx) | Delete or rename to a generic "StartBatchPage" without launch-mode | 4 |
| [RunForm.tsx](../../cloud/apps/web/src/components/runs/RunForm.tsx), [useRunForm.ts](../../cloud/apps/web/src/components/runs/useRunForm.ts) | Drop `launchMode` state, the picker, and the conditional rendering tied to `PAIRED_BATCH` | 4 |
| [RunDetail.tsx](../../cloud/apps/web/src/pages/RunDetail/RunDetail.tsx) | Drop `launchMode`-derived labels and the "Start topup batch" button (lines ~32–40, 109, 206) | 4 |
| [AnalysisDetail.tsx](../../cloud/apps/web/src/pages/AnalysisDetail.tsx) | Drop the `PAIRED_BATCH`-conditional subtitle / interpretation logic (lines ~59–65, 305–306) | 4 |
| [PairedRunComparisonCard.tsx](../../cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx) | Rewrite: find partner via `Definition.pairedSibling` resolver, drop `batchGroupId` lookup | 4 |
| [RunCard.tsx](../../cloud/apps/web/src/components/runs/RunCard.tsx) | Drop the paired-batch badge (line ~112) | 4 |
| Domain trial launch UI under [components/domains/domainTrials/](../../cloud/apps/web/src/components/domains/domainTrials/) | Audit `launch-state.ts` and related — remove pair-aware launch paths | 4 |
| `cloud/apps/web/src/generated/graphql.ts` | Regenerated by codegen — never edit by hand | — |

### E. Tests

| Area | Change | Wave |
|---|---|---|
| [auto-pair.test.ts](../../cloud/apps/api/tests/utils/auto-pair.test.ts) | Keep | — |
| [paired-vignette.test.ts](../../cloud/apps/web/src/api/operations/paired-vignette.ts) tests | Audit | 2 |
| [pairedScopeAdapter.test.ts](../../cloud/apps/web/tests/utils/pairedScopeAdapter.test.ts) | Audit | 4 |
| [job-choice-bridge-report.test.ts](../../cloud/scripts/__tests__/job-choice-bridge-report.test.ts) | Delete with the script | 5 |
| Anomaly tests covering `PAIR_ASYMMETRY` | Delete | 3 |
| Run lifecycle tests asserting `launchMode` | Update or delete | 4 |
| Domain coverage tests asserting dedup-by-batchGroupId | Rewrite to assert dedup-by-mirror-pair | 3 |
| Snapshot baselines in `cloud/tests/snapshot-baselines/` referencing `pairKey` | Refresh with new query shape | per wave |

### F. Scripts and tools

| File | Change | Wave |
|---|---|---|
| `cloud/scripts/seed-*-pairs.ts` | Stop generating `pair_key` UUIDs | 2 |
| [job-choice-bridge-report.ts](../../cloud/scripts/job-choice-bridge-report.ts) | Delete (legacy bridge report; reads `launchMode` from old runs) | 5 |
| [backfill-reparse-decisions.ts](../../cloud/scripts/backfill-reparse-decisions.ts) | Filters by `jobChoiceLaunchMode IN ('PAIRED_BATCH','PAIRED_BATCH_TOPUP')`. Survives Wave 4 (the JSON value persists) but breaks if the optional Wave 5 cleanup script strips fields. If we want this script preserved, replace its filter with a definition-based one before Wave 5 cleanup ships. | 5 (decide before cleanup migration) |
| MCP tools under `cloud/apps/api/src/mcp/tools/` | Audit each: `get-run-results.ts`, `get-run-summary.ts`, others — remove pair fields from outputs | 4 |
| Optional cleanup migration script: strip `pair_key` from `Definition.content.methodology` and `jobChoice*` from `Run.config` | Decide whether to ship | post-5 |

### G. Documentation

| Doc | Change |
|---|---|
| [docs/backend/paired-batch-run-flow.md](../backend/paired-batch-run-flow.md) | Delete after Wave 4 ships |
| [docs/canonical-glossary.md](../canonical-glossary.md) | Remove "paired batch" entry; update "vignette" entry to mention mirrored-token pairing |
| [docs/valuerank_prd.yaml](../valuerank_prd.yaml) | Remove paired-batch flow description |
| [docs/tech-debt/dedup-inventory.md](dedup-inventory.md) | Add a back-reference to this doc |
| `cloud/CLAUDE.md`, repo-root `AGENTS.md` | Audit for paired-batch mentions |
| `MEMORY.md` (auto-memory index) | Audit and prune |
| `docs/workflow/feature-runs/*` for past paired features | Mark obsolete; do not delete history |

## Wave plan

Each wave should be ship-able on its own. Main stays green throughout.

### Wave 1 — ADR sign-off

This document. Lands first as a planning doc. Decision 2 (PAIR_ASYMMETRY) gets resolved here before Wave 3 starts.

**Ships:** this file plus glossary stub.

### Wave 2 — Drop `methodology.pair_key`

The cheapest deletion. Only one read site (`pressure-sensitivity` prefilter) plus a few writers.

**Ships:**
- Pressure-sensitivity snapshot-builder uses token-mirror only
- `definition-paired-sibling.ts` resolver uses token-mirror only
- `ensure-domain-vignette-pair` stops writing `pair_key`
- Seed scripts stop writing `pair_key`
- GraphQL schema: remove `Definition.pairKey`, `DomainEvaluationLaunchableDefinition.pairKey`
- Web `methodology.ts` drops `pair_key` parsing
- Codegen run

**Risk:** Low. The token-mirror logic already exists; we're just removing a redundant pre-filter.

### Wave 3 — Drop `jobChoiceBatchGroupId` and PAIR_ASYMMETRY

The biggest wave. Closes out the launch-time grouping concept and the analyses that depended on it.

**Ships:**
- Delete `detectPairAsymmetry` (or rewrite per Decision 2)
- Drop `PAIR_ASYMMETRY` from anomaly enum, label map, audit, reconcile
- Replace `deduplicateRunsByGroupId` and `getCoverageBatchGroupId` with mirror-pair dedup
- Drop `pair-grouping.ts` and the `incompletePairKeys` warning
- Domain launch (`executeLaunchRuns`, `executeBackfillRuns`, `plan-slots`, `plan-backfill`, `backfill-orchestrator`) stops writing `batchGroupId` and `launchMode: 'PAIRED_BATCH'`
- GraphQL schema: remove `Run.pairedBatchGroupId`, `Run.companionRunId`
- Codegen run

**Risk:** Medium. Coverage dedup needs careful rewrite — historical data still has `batchGroupId`, and the new dedup must produce equivalent counts on old data so reports don't shift.

### Wave 3.5 — Repoint paired-mode features to `Definition.pairedSibling`

Sibling-derive the companion at query time so we can drop the explicit pointers in Wave 4 without losing features.

**Ships:**
- Paired-mode transcript view stack (`analysisTranscriptParams.ts`, `useAnalysisTranscriptsData.ts`, `useAnalysisTranscriptParams.ts`, `pairedScopeAdapter.ts`, `AnalysisDetail.tsx`) reads partner from `Definition.pairedSibling` when `companionRunId` is absent (the test fallback at [AnalysisConditionDetail.test.tsx:711](../../cloud/apps/web/tests/pages/AnalysisConditionDetail.test.tsx:711) already exercises this)
- `models-consistency.ts` order-effect analysis joins runs via mirrored definitions instead of `companionRunId`
- `aggregate-preparation.ts` derives partner from `pairedSibling` instead of reading `companionRunId`
- `lifecycle-helpers.ts` `persistPairedCompanionRunIds` is no longer called from any new launch path (still defined but dead)
- Tests updated to assert sibling-derived companion behavior

**Risk:** High. This is the riskiest wave — it touches the analysis surface that produces the data the product is about. Verify against historical runs in staging before shipping.

### Wave 4 — Drop `jobChoiceLaunchMode`, `companionRunId`, and PAIRED_BATCH_TOPUP

UI cleanup plus the top-up logic plus the now-orphaned companion pointer.

**Ships:**
- Delete the top-up handler's `PAIRED_BATCH_TOPUP` paths
- Drop the `launchMode` input from `startRun`
- GraphQL schema: remove `Run.companionRunId` (Wave 3.5 already moved consumers off it)
- Delete `lifecycle-helpers.ts` `persistPairedCompanionRunIds`, `mergeCompanionRunId`, `getConfiguredCompanionRunId` (now-dead)
- Web: drop `StartPairedBatchPage`, the launch-mode picker, `RunForm`/`useRunForm` mode handling, the topup button on `RunDetail`, the badge on `RunCard`
- Web: rewrite `PairedRunComparisonCard` to use `pairedSibling` resolver
- Update `runs.graphql` to drop `companionRunId` selection
- Address `runCategory` default-change: any caller that relied on `launchMode === 'PAIRED_BATCH' ? 'PRODUCTION' : undefined` must pass `runCategory: 'PRODUCTION'` explicitly
- MCP tool outputs drop pair-related fields
- Codegen run
- Changelog entry calling out the JSON export contract change

**Risk:** Medium. UI surface area is wide; needs preview-server verification on each page that referenced launch mode.

### Wave 5 — Tombstones and historical cleanup

**Ships:**
- Delete `legacyCompanionPairedRun.ts`
- Delete `job-choice-bridge-report.ts` and its test
- Delete `docs/backend/paired-batch-run-flow.md`
- Decide on the optional JSON-stripping cleanup script; ship if approved
- Glossary and PRD updates

**Risk:** Low.

## Migration / historical-data concerns

| Concern | Resolution |
|---|---|
| Old runs in DB have `jobChoiceBatchGroupId`, `jobChoiceLaunchMode`, etc. set | Stays in JSON. Harmless once no code reads it. |
| Old definitions have `methodology.pair_key` | Same. |
| `run_category` was backfilled from `launchMode` ([20260320150000](../../cloud/packages/db/prisma/migrations/20260320150000_backfill_paired_batch_run_category/migration.sql)) | Already applied. Verify Wave 3+ launch paths still set `runCategory` directly so new rows continue to have correct values. |
| Cached analysis snapshots that joined on batchGroupId | Invalidate after Wave 3 deploys. Tables: `domainAnalysisSnapshot`, `pressureSensitivitySnapshot`. |
| In-flight runs at deploy time of any wave | Should be safe — dependent code is removed in lock-step. Old runs remain queryable but no new anomalies / coverage entries fire against them. |

## Open questions

- **Cleanup migration:** ship the optional JSON-stripping script in Wave 5, or leave stale fields in old rows forever? Default: leave them. Re-evaluate if any future feature is confused by them.
- **Pair-asymmetry replacement signal:** if anyone misses the detector after Wave 3, what's the right replacement report? (Likely a per-definition cross-mirror success-rate comparison surfaced in the analysis page, not as an anomaly.)

## Sign-off log

| Wave | Approved by | Date | Notes |
|---|---|---|---|
| 1 (this doc) | | | |
| 2 | | | |
| 3 | | | |
| 3.5 | | | high-risk: paired-mode analysis repoint |
| 4 | | | |
| 5 | | | |

## Related

- [Run-state PENDING fix (PR #1017)](https://github.com/chrislawcodes/valuerank/pull/1017) — closed the PENDING → RUNNING gap; informs Wave 3's launch-flow rewrite
- [docs/backend/paired-batch-run-flow.md](../backend/paired-batch-run-flow.md) — the legacy flow trace; obsolete after Wave 4
- [docs/tech-debt/dedup-inventory.md](dedup-inventory.md) — the canonical dedup catalog
