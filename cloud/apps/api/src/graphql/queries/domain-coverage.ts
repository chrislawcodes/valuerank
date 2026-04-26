/**
 * Domain Coverage Query
 *
 * Returns a value-pair coverage matrix for a domain: how many completed
 * trial batches (runs) exist for each Schwartz value pair vignette.
 * Scoped to the same 10-value set used in domain analysis.
 */

import { builder } from '../builder.js';
import { db, resolveDefinitionContent } from '@valuerank/db';
import { AppError } from '@valuerank/shared';

import {
  COVERAGE_VALUE_KEYS,
  type CoverageValueKey,
  extractValuePair,
  getCoverageBatchGroupId,
  getCoverageDirection,
  selectPrimaryDefinitionCounts,
  computePerModelTrialCounts,
  deduplicateRunsByGroupId,
} from './domain-coverage-utils.js';
import { isRunComplete } from '../../services/run/coverage-completeness.js';
import { resolveEffectiveDefaultModelIds } from './domain/shared.js';
import {
  DomainValueCoverageResultRef,
  type DomainValueCoverageCell,
  type CoverageModelOption,
  runMatchesSignature,
} from './domain-coverage-gql-types.js';

const VALUE_PAIR_RESOLVE_CHUNK_SIZE = 20;

builder.queryField('domainValueCoverage', (t) =>
  t.field({
    type: DomainValueCoverageResultRef,
    nullable: true,
    description: `
      Returns a Schwartz value-pair coverage matrix for a domain.

      Each cell shows how many completed trial batches (runs) exist for the vignette
      that tests that pair of values in conflict. Optionally filtered to count only
      runs that included the specified model IDs.

      The matrix is symmetric: each unique value pair appears once, with the cell key
      sorted alphabetically (valueA < valueB). Diagonal cells are omitted.
    `,
    args: {
      domainId: t.arg.id({
        required: true,
        description: 'Domain to compute coverage for',
      }),
      modelIds: t.arg.stringList({
        required: false,
        description: 'If provided, only count runs that included at least one of these model IDs',
      }),
      signature: t.arg.string({
        required: false,
        description: 'If provided, only count completed runs matching this trial signature',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = String(args.domainId);
      const filterModelIds = args.modelIds?.map(String) ?? [];
      const selectedSignature = typeof args.signature === 'string' && args.signature.trim() !== ''
        ? args.signature.trim()
        : null;

      ctx.log.debug({ domainId, filterModelIds, selectedSignature }, 'Computing domain value coverage');

      const domain = await db.domain.findUnique({ where: { id: domainId }, select: { id: true, defaultModelIds: true } });
      if (!domain) return null;

      // Resolve effective model IDs: use domain-specific list if set, otherwise fall back
      // to globally defaulted models (isDefault=true, ACTIVE) from the Models settings page.
      const effectiveModelIds = await resolveEffectiveDefaultModelIds(domain.defaultModelIds);

      // Pre-fetch labels for effective models so we can populate model breakdown
      const defaultModelLabelById = new Map<string, string>();
      if (effectiveModelIds.length > 0) {
        const defaultModelRows = await db.llmModel.findMany({
          where: { modelId: { in: effectiveModelIds } },
          select: { modelId: true, displayName: true },
        });
        for (const row of defaultModelRows) {
          defaultModelLabelById.set(row.modelId, row.displayName);
        }
      }

      // Fetch all non-deleted definitions (need IDs to resolve content)
      const definitions = await db.definition.findMany({
        where: { domainId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      });

      // Map definition ID -> value pair (only those with recognized canonical pair)
      type DefValuePair = { valueA: CoverageValueKey; valueB: CoverageValueKey; name: string };
      const pairByDefinitionId = new Map<string, DefValuePair>();
      // Map directional pair key -> definition IDs (to detect multi-vignette cells)
      const definitionsByPairKey = new Map<string, string[]>();

      // Resolve definition contents in chunks to handle inheritance
      for (let offset = 0; offset < definitions.length; offset += VALUE_PAIR_RESOLVE_CHUNK_SIZE) {
        const batch = definitions.slice(offset, offset + VALUE_PAIR_RESOLVE_CHUNK_SIZE);
        const settled = await Promise.allSettled(
          batch.map(async (def) => {
            const resolvedContent = (await resolveDefinitionContent(def.id) as { resolvedContent: unknown }).resolvedContent;
            const pair = extractValuePair(resolvedContent);
            if (pair == null) return;

            pairByDefinitionId.set(def.id, { ...pair, name: def.name ?? '' });
            const key = `${pair.valueA}::${pair.valueB}`;
            const existing = definitionsByPairKey.get(key) ?? [];
            existing.push(def.id);
            definitionsByPairKey.set(key, existing);
          })
        );
        settled.forEach((result, idx) => {
          if (result.status === 'rejected') {
            ctx.log.error(
              { err: result.reason as unknown, definitionId: batch[idx]?.id },
              'Failed to resolve definition content for coverage grid'
            );
          }
        });
      }

      // Count completed runs per definition, optionally filtered by signature and model
      const definitionIds = Array.from(pairByDefinitionId.keys());
      const batchCountByDefinitionId = new Map<string, number>();
      // Per-definition map: direction token -> Set<groupKey> where groupKey is
      // the run's jobChoiceBatchGroupId (collapses retry duplicates within a
      // launch group) or "__ungrouped__:<runId>" so each ungrouped run still
      // counts once. Drives the new pairedBatchCount = min(A-first, B-first).
      const directionalGroupsByDefinitionId =
        new Map<string, Map<string, Set<string>>>();
      const latestMatchingRunIdByDefinitionId = new Map<string, string>();
      const latestAggregateRunIdByDefinitionId = new Map<string, string>();
      const incompleteBatchCountByDefinitionId = new Map<string, number>();
      const signatureScopedRunsByDefinitionId = new Map<string, Array<{
        id: string;
        definitionId: string;
        config: unknown;
        transcripts: Array<{ modelId: string; scenarioId: string | null; sampleIndex: number }>;
        scenarioIds: string[];
      }>>();
      // Non-aggregate runs per definition (for per-model trial count computation)
      const nonAggregateRunsByDefinitionId = new Map<string, Array<{
        config: unknown;
        transcripts: Array<{ modelId: string; scenarioId: string | null; sampleIndex: number }>;
        scenarioIds: string[];
      }>>();

      if (definitionIds.length > 0) {
        const completedRuns = await db.run.findMany({
          where: {
            definitionId: { in: definitionIds },
            status: 'COMPLETED',
            deletedAt: null,
          },
          orderBy: [{ definitionId: 'asc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            definitionId: true,
            createdAt: true,
            config: true,
            transcripts: {
              where: { deletedAt: null },
              select: { modelId: true, scenarioId: true, sampleIndex: true },
            },
            scenarioSelections: {
              select: { scenarioId: true },
            },
          },
        });

        const signatureScopedRuns = selectedSignature === null
          ? completedRuns
          : completedRuns.filter((run) => runMatchesSignature(run.config, selectedSignature));

        for (const run of signatureScopedRuns) {
          // Per the canonical glossary (docs/canonical-glossary.md), a `Batch` is
          // one fully-complete run -- every selected model has a transcript at
          // every (scenarioId × sampleIndex) slot. samplesPerScenario does not
          // multiply the count. Aggregate runs are excluded from both batch
          // and incomplete-batch counts (they are rollup records, not data).
          //
          // A COMPLETED run with null/malformed `config` or no `models` array
          // is a data corruption signal; surface it instead of silently
          // skipping. `samplesPerScenario` and `isAggregate` remain optional.
          if (run.config === null || typeof run.config !== 'object') {
            throw new AppError(
              `Run ${run.id} has null or non-object config; cannot compute coverage`,
              'RUN_CONFIG_INVALID',
              500,
              { runId: run.id },
            );
          }
          const config = run.config as {
            isAggregate?: boolean;
            models?: unknown;
            samplesPerScenario?: unknown;
          };
          const scenarioIds = run.scenarioSelections.map((s) => s.scenarioId);
          const runWithScenarios = {
            id: run.id,
            definitionId: run.definitionId,
            config: run.config,
            transcripts: run.transcripts,
            scenarioIds,
          };
          const existingRuns = signatureScopedRunsByDefinitionId.get(run.definitionId) ?? [];
          existingRuns.push(runWithScenarios);
          signatureScopedRunsByDefinitionId.set(run.definitionId, existingRuns);

          const models = Array.isArray(config.models)
            ? config.models.filter((m): m is string => typeof m === 'string' && m.length > 0)
            : null;
          const matchesEffectiveModelSet = effectiveModelIds.length === 0
            || (models !== null && effectiveModelIds.every((id) => models.includes(id)));
          if (!matchesEffectiveModelSet) {
            continue;
          }

          const isAggregateRun = config.isAggregate === true;
          if (isAggregateRun) {
            if (!latestAggregateRunIdByDefinitionId.has(run.definitionId)) {
              latestAggregateRunIdByDefinitionId.set(run.definitionId, run.id);
            }
            continue;
          }

          // Apply the model filter symmetrically: a run that doesn't match the
          // requested model filter contributes to neither bucket. Without this
          // the `incompleteBatchCount` view of a filtered query would mention
          // runs that `batchCount` cannot, breaking the "exactly one bucket"
          // invariant.
          const matchesModelFilter = filterModelIds.length === 0
            || run.transcripts.some((transcript) => filterModelIds.includes(transcript.modelId));
          if (!matchesModelFilter) continue;

          if (!latestMatchingRunIdByDefinitionId.has(run.definitionId)) {
            latestMatchingRunIdByDefinitionId.set(run.definitionId, run.id);
          }

          // Track non-aggregate runs for per-model trial count computation.
          const nonAggregateRuns = nonAggregateRunsByDefinitionId.get(run.definitionId) ?? [];
          nonAggregateRuns.push({ config: run.config, transcripts: run.transcripts, scenarioIds });
          nonAggregateRunsByDefinitionId.set(run.definitionId, nonAggregateRuns);

          // Determine completeness using the existing helper. A run is complete
          // iff every (scenarioId × modelId × sampleIndex) slot has at least
          // one transcript. Extra transcripts in a slot do NOT break
          // completeness; only missing slots do.
          if (models === null) {
            throw new AppError(
              `Run ${run.id} config has no models array; cannot compute coverage`,
              'RUN_CONFIG_INVALID',
              500,
              { runId: run.id },
            );
          }
          if (models.length === 0) {
            throw new AppError(
              `Run ${run.id} has empty or invalid models array`,
              'RUN_CONFIG_INVALID',
              500,
              { runId: run.id },
            );
          }
          const rawSamples = config.samplesPerScenario;
          const samplesPerScenario = typeof rawSamples === 'number' ? rawSamples : null;
          const existingTranscripts = run.transcripts
            .filter((t): t is { scenarioId: string; modelId: string; sampleIndex: number } => t.scenarioId !== null);
          const complete = isRunComplete({
            scenarioIds,
            models,
            samplesPerScenario,
            existingTranscripts,
          });

          if (!complete) {
            incompleteBatchCountByDefinitionId.set(
              run.definitionId,
              (incompleteBatchCountByDefinitionId.get(run.definitionId) ?? 0) + 1,
            );
            continue;
          }

          // Run is complete: contribute exactly 1 to batchCount regardless of
          // samplesPerScenario.
          batchCountByDefinitionId.set(
            run.definitionId,
            (batchCountByDefinitionId.get(run.definitionId) ?? 0) + 1,
          );

          // pairedBatchCount semantic: count complete A-first vs B-first runs
          // independently per the direction token in config.jobChoiceValueFirst.
          // The Set<groupKey> collapses retry duplicates that share the same
          // launch group; ungrouped runs use a unique sentinel so they each
          // count once. Runs with no recognizable direction token are skipped
          // here (they still count toward batchCount above).
          const direction = getCoverageDirection(run.config);
          if (direction !== null) {
            const launchGroupId = getCoverageBatchGroupId(run.config);
            const groupKey = launchGroupId ?? `__ungrouped__:${run.id}`;
            const defMap = directionalGroupsByDefinitionId.get(run.definitionId)
              ?? new Map<string, Set<string>>();
            const dirSet = defMap.get(direction) ?? new Set<string>();
            dirSet.add(groupKey);
            defMap.set(direction, dirSet);
            directionalGroupsByDefinitionId.set(run.definitionId, defMap);
          }
        }
      }

      const availableModelIds = new Set<string>();
      for (const runs of signatureScopedRunsByDefinitionId.values()) {
        for (const run of runs) {
          for (const transcript of run.transcripts) {
            availableModelIds.add(transcript.modelId);
          }
        }
      }

      const modelDetailRows =
        availableModelIds.size > 0
          ? await db.llmModel.findMany({
            where: { modelId: { in: Array.from(availableModelIds) } },
            select: { modelId: true, displayName: true },
            orderBy: { displayName: 'asc' },
          })
          : [];

      const availableModels: CoverageModelOption[] = modelDetailRows.map((m) => ({
        modelId: m.modelId,
        label: m.displayName,
      }));

      // Build the symmetric 45-cell matrix (one cell per unique sorted pair)
      const values = [...COVERAGE_VALUE_KEYS] as string[];
      const cells: DomainValueCoverageCell[] = [];

      for (const valueA of COVERAGE_VALUE_KEYS) {
        for (const valueB of COVERAGE_VALUE_KEYS) {
          // Only emit sorted pairs: skip diagonal and reversed pairs
          if (valueA.localeCompare(valueB) >= 0) continue;

          const key = `${valueA}::${valueB}`;
          const defIdsForPair = definitionsByPairKey.get(key) ?? [];

          if (defIdsForPair.length === 0) {
            cells.push({
              valueA,
              valueB,
              batchCount: 0,
              pairedBatchCount: 0,
              orphanedBatchCount: 0,
              aFirstBatchCount: 0,
              bFirstBatchCount: 0,
              incompleteBatchCount: 0,
              definitionId: null,
              definitionName: null,
              aggregateRunId: null,
              minTrialCount: null,
              maxTrialCount: null,
              modelBreakdown: null,
            });
          } else {
            // Use the total counts across all definitions for the visible cell, but
            // still choose one stable definition for the analysis link target.
            const {
              primaryDefinitionId,
              batchCount,
              pairedBatchCount,
              orphanedBatchCount,
              aFirstBatchCount,
              bFirstBatchCount,
            } = selectPrimaryDefinitionCounts(
              defIdsForPair,
              batchCountByDefinitionId,
              directionalGroupsByDefinitionId,
              valueA,
              valueB,
              ctx.log,
              `${valueA}::${valueB}`,
            );
            const primaryDefId = primaryDefinitionId ?? '';
            const primaryPair = pairByDefinitionId.get(primaryDefId);
            const aggregateRunId = primaryDefId === ''
              ? null
              : (latestAggregateRunIdByDefinitionId.get(primaryDefId)
                ?? latestMatchingRunIdByDefinitionId.get(primaryDefId)
                ?? null);

            // Sum incompleteBatchCount across all definitions for this pair
            const incompleteBatchCount = defIdsForPair.reduce(
              (sum, defId) => sum + (incompleteBatchCountByDefinitionId.get(defId) ?? 0),
              0,
            );

            // Compute per-model trial counts across all definitions for this pair.
            // Deduplicate by group ID first: A-first and B-first companion definitions
            // share the same jobChoiceBatchGroupId, so flatMapping across both would
            // double-count each paired batch.
            //
            // When companions have different completeness, prefer the complete one
            // for the trial-count computation. This is read-time consistency with
            // batchCount: the surviving run is the one whose data feeds analysis.
            //
            // Intentionally unchanged by the directional-pairedBatchCount refactor:
            // the trial-count path keeps the surviving-companion semantic so that
            // healthy paired batches do not double their displayed trial counts.
            // See spec §5.7 ("Per-model trial counts — intentionally unchanged").
            const allNonAggregateRunsForPair = deduplicateRunsByGroupId(
              defIdsForPair.flatMap((defId) => nonAggregateRunsByDefinitionId.get(defId) ?? []),
              (run) => {
                const configModels = (run.config as { models?: unknown } | null)?.models;
                const models = Array.isArray(configModels)
                  ? configModels.filter((m): m is string => typeof m === 'string' && m.length > 0)
                  : [];
                const rawSamples = (run.config as { samplesPerScenario?: unknown } | null)?.samplesPerScenario;
                const existing = run.transcripts
                  .filter((t): t is { scenarioId: string; modelId: string; sampleIndex: number } => t.scenarioId !== null);
                return isRunComplete({
                  scenarioIds: run.scenarioIds,
                  models,
                  samplesPerScenario: typeof rawSamples === 'number' ? rawSamples : null,
                  existingTranscripts: existing,
                });
              },
            );
            const { minTrialCount, maxTrialCount, modelBreakdown } = computePerModelTrialCounts(
              allNonAggregateRunsForPair,
              effectiveModelIds,
              defaultModelLabelById,
            );

            cells.push({
              valueA,
              valueB,
              batchCount,
              pairedBatchCount,
              orphanedBatchCount,
              aFirstBatchCount,
              bFirstBatchCount,
              incompleteBatchCount,
              definitionId: primaryDefId !== '' ? primaryDefId : null,
              definitionName: primaryPair?.name ?? null,
              aggregateRunId,
              minTrialCount,
              maxTrialCount,
              modelBreakdown,
            });
          }
        }
      }

      ctx.log.debug({ domainId, cellCount: cells.length }, 'Domain value coverage computed');
      return { domainId, values, cells, availableModels };
    },
  })
);
