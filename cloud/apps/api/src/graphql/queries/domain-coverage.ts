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
  computeBatchEquivalent,
  extractValuePair,
  findWeakestCondition,
  getCoverageDirection,
} from './domain-coverage-utils.js';
import { resolveEffectiveDefaultModelIds } from './domain/shared.js';
import {
  DomainValueCoverageResultRef,
  type DomainValueCoverageCell,
  type CoverageModelOption,
  runMatchesSignature,
} from './domain-coverage-gql-types.js';

const VALUE_PAIR_RESOLVE_CHUNK_SIZE = 20;

type CoverageTranscript = {
  modelId: string;
  scenarioId: string | null;
  sampleIndex: number;
};

type ScopedRun = {
  id: string;
  definitionId: string;
  config: unknown;
  transcripts: CoverageTranscript[];
};

type TrialMap = Map<string, Map<string, Map<string, Map<string, number>>>>;

function incrementTrialCount(
  trialsByDefAndDirection: TrialMap,
  definitionId: string,
  direction: string,
  scenarioId: string,
  modelId: string,
): void {
  const directionMap = trialsByDefAndDirection.get(definitionId) ?? new Map<string, Map<string, Map<string, number>>>();
  const scenarioMap = directionMap.get(direction) ?? new Map<string, Map<string, number>>();
  const modelMap = scenarioMap.get(scenarioId) ?? new Map<string, number>();

  modelMap.set(modelId, (modelMap.get(modelId) ?? 0) + 1);
  scenarioMap.set(scenarioId, modelMap);
  directionMap.set(direction, scenarioMap);
  trialsByDefAndDirection.set(definitionId, directionMap);
}

function mergeTrialMapsForDirection(
  defIdsForPair: readonly string[],
  direction: string,
  trialsByDefAndDirection: TrialMap,
): Map<string, Map<string, number>> {
  const merged = new Map<string, Map<string, number>>();

  for (const defId of defIdsForPair) {
    const directionMap = trialsByDefAndDirection.get(defId)?.get(direction);
    if (directionMap == null) continue;

    for (const [scenarioId, modelMap] of directionMap) {
      const mergedScenarioMap = merged.get(scenarioId) ?? new Map<string, number>();
      for (const [modelId, trialCount] of modelMap) {
        mergedScenarioMap.set(modelId, (mergedScenarioMap.get(modelId) ?? 0) + trialCount);
      }
      merged.set(scenarioId, mergedScenarioMap);
    }
  }

  return merged;
}

function sumTrialsForDefinition(
  definitionId: string,
  trialsByDefAndDirection: TrialMap,
): number {
  const directionMap = trialsByDefAndDirection.get(definitionId);
  if (directionMap == null) return 0;

  let total = 0;
  for (const scenarioMap of directionMap.values()) {
    for (const modelMap of scenarioMap.values()) {
      for (const trialCount of modelMap.values()) {
        total += trialCount;
      }
    }
  }
  return total;
}

function findDirectionalDefinitionName(
  defIdsForPair: readonly string[],
  direction: string,
  trialsByDefAndDirection: TrialMap,
  pairByDefinitionId: ReadonlyMap<string, { name: string }>,
): string | null {
  for (const defId of defIdsForPair) {
    const directionMap = trialsByDefAndDirection.get(defId)?.get(direction);
    if (directionMap != null && directionMap.size > 0) {
      return pairByDefinitionId.get(defId)?.name ?? null;
    }
  }
  return null;
}

function formatScenarioLabel(content: unknown, fallbackId: string): string {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) {
    return fallbackId.slice(0, 6);
  }

  const dimensionValues = (content as { dimension_values?: unknown }).dimension_values;
  if (dimensionValues === null || typeof dimensionValues !== 'object' || Array.isArray(dimensionValues)) {
    return fallbackId.slice(0, 6);
  }

  const entries = Object.entries(dimensionValues as Record<string, unknown>)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  const label = entries.map(([, value]) => String(value)).join('×');
  return label.length > 0 ? label : fallbackId.slice(0, 6);
}

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

      const domain = await db.domain.findUnique({
        where: { id: domainId },
        select: { id: true, defaultModelIds: true },
      });
      if (!domain) return null;

      // Resolve effective model IDs: use domain-specific list if set, otherwise fall back
      // to globally defaulted models (isDefault=true, ACTIVE) from the Models settings page.
      const effectiveModelIds = await resolveEffectiveDefaultModelIds(domain.defaultModelIds);
      const activeModelFilter = filterModelIds.length > 0 ? filterModelIds : effectiveModelIds;

      // Fetch all non-deleted definitions (need IDs to resolve content)
      const definitions = await db.definition.findMany({
        where: { domainId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      });

      // Map definition ID -> value pair (only those with recognized canonical pair)
      type DefValuePair = { valueA: CoverageValueKey; valueB: CoverageValueKey; name: string };
      const pairByDefinitionId = new Map<string, DefValuePair>();
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
          }),
        );
        settled.forEach((result, idx) => {
          if (result.status === 'rejected') {
            ctx.log.error(
              { err: result.reason as unknown, definitionId: batch[idx]?.id },
              'Failed to resolve definition content for coverage grid',
            );
          }
        });
      }

      const definitionIds = Array.from(pairByDefinitionId.keys());
      const trialsByDefAndDirection: TrialMap = new Map();
      const latestMatchingRunIdByDefinitionId = new Map<string, string>();
      const latestAggregateRunIdByDefinitionId = new Map<string, string>();
      const signatureScopedRunsByDefinitionId = new Map<string, ScopedRun[]>();

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
          };
          const scopedRun: ScopedRun = {
            id: run.id,
            definitionId: run.definitionId,
            config: run.config,
            transcripts: run.transcripts,
          };
          const existingRuns = signatureScopedRunsByDefinitionId.get(run.definitionId) ?? [];
          existingRuns.push(scopedRun);
          signatureScopedRunsByDefinitionId.set(run.definitionId, existingRuns);

          if (config.isAggregate === true) {
            if (!latestAggregateRunIdByDefinitionId.has(run.definitionId)) {
              latestAggregateRunIdByDefinitionId.set(run.definitionId, run.id);
            }
            continue;
          }

          const direction = getCoverageDirection(run.config);
          if (direction === null) {
            continue;
          }

          if (!latestMatchingRunIdByDefinitionId.has(run.definitionId)) {
            latestMatchingRunIdByDefinitionId.set(run.definitionId, run.id);
          }

          for (const transcript of run.transcripts) {
            if (transcript.scenarioId === null) {
              continue;
            }
            if (activeModelFilter.length > 0 && !activeModelFilter.includes(transcript.modelId)) {
              continue;
            }
            incrementTrialCount(
              trialsByDefAndDirection,
              run.definitionId,
              direction,
              transcript.scenarioId,
              transcript.modelId,
            );
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

      const modelDetailRows = availableModelIds.size > 0
        ? await db.llmModel.findMany({
          where: { modelId: { in: Array.from(availableModelIds) } },
          select: { modelId: true, displayName: true },
          orderBy: { displayName: 'asc' },
        })
        : [];

      const availableModels: CoverageModelOption[] = modelDetailRows.map((model) => ({
        modelId: model.modelId,
        label: model.displayName,
      }));
      const modelLabelById = new Map<string, string>(
        availableModels.map((model) => [model.modelId, model.label] as const),
      );

      const allScenarioIds = new Set<string>();
      for (const directionMap of trialsByDefAndDirection.values()) {
        for (const scenarioMap of directionMap.values()) {
          for (const scenarioId of scenarioMap.keys()) {
            allScenarioIds.add(scenarioId);
          }
        }
      }

      const scenarioLabelMap = new Map<string, string>();
      if (allScenarioIds.size > 0) {
        const scenarioRows = await db.scenario.findMany({
          where: { id: { in: [...allScenarioIds] } },
          select: { id: true, content: true },
        });

        for (const scenarioRow of scenarioRows) {
          scenarioLabelMap.set(scenarioRow.id, formatScenarioLabel(scenarioRow.content, scenarioRow.id));
        }
      }

      const values = [...COVERAGE_VALUE_KEYS] as string[];
      const cells: DomainValueCoverageCell[] = [];

      for (const valueA of COVERAGE_VALUE_KEYS) {
        for (const valueB of COVERAGE_VALUE_KEYS) {
          if (valueA.localeCompare(valueB) >= 0) continue;

          const key = `${valueA}::${valueB}`;
          const defIdsForPair = definitionsByPairKey.get(key) ?? [];

          if (defIdsForPair.length === 0) {
            cells.push({
              valueA,
              valueB,
              batchEquivalent: 0,
              aFirstBatchEquivalent: 0,
              bFirstBatchEquivalent: 0,
              aFirstDefinitionName: null,
              bFirstDefinitionName: null,
              weakestCondition: null,
              contributingDefinitionIds: [],
              definitionId: null,
              aggregateRunId: null,
            });
            continue;
          }

          const uniqueDefIdsForPair = Array.from(new Set(defIdsForPair)).sort((left, right) => left.localeCompare(right));
          const primaryDefinitionId = uniqueDefIdsForPair.reduce((best, defId) => {
            const bestCount = sumTrialsForDefinition(best, trialsByDefAndDirection);
            const thisCount = sumTrialsForDefinition(defId, trialsByDefAndDirection);
            if (thisCount > bestCount) return defId;
            if (thisCount < bestCount) return best;
            return defId.localeCompare(best) < 0 ? defId : best;
          }, uniqueDefIdsForPair[0] ?? '');
          const primaryDefinitionName = pairByDefinitionId.get(primaryDefinitionId)?.name ?? null;

          const mergedAFirstTrialMap = mergeTrialMapsForDirection(uniqueDefIdsForPair, valueA, trialsByDefAndDirection);
          const mergedBFirstTrialMap = mergeTrialMapsForDirection(uniqueDefIdsForPair, valueB, trialsByDefAndDirection);
          const aFirstBatchEquivalent = computeBatchEquivalent(mergedAFirstTrialMap, activeModelFilter);
          const bFirstBatchEquivalent = computeBatchEquivalent(mergedBFirstTrialMap, activeModelFilter);
          const batchEquivalent = Math.min(aFirstBatchEquivalent, bFirstBatchEquivalent);
          const aFirstDefinitionName = findDirectionalDefinitionName(
            uniqueDefIdsForPair,
            valueA,
            trialsByDefAndDirection,
            pairByDefinitionId,
          ) ?? primaryDefinitionName;
          const bFirstDefinitionName = findDirectionalDefinitionName(
            uniqueDefIdsForPair,
            valueB,
            trialsByDefAndDirection,
            pairByDefinitionId,
          ) ?? primaryDefinitionName;
          const weakestCondition = aFirstBatchEquivalent === bFirstBatchEquivalent
            ? null
            : findWeakestCondition(
              aFirstBatchEquivalent < bFirstBatchEquivalent ? mergedAFirstTrialMap : mergedBFirstTrialMap,
              activeModelFilter,
              scenarioLabelMap,
              modelLabelById,
            );
          const aggregateRunId = latestAggregateRunIdByDefinitionId.get(primaryDefinitionId)
            ?? latestMatchingRunIdByDefinitionId.get(primaryDefinitionId)
            ?? null;

          cells.push({
            valueA,
            valueB,
            batchEquivalent,
            aFirstBatchEquivalent,
            bFirstBatchEquivalent,
            aFirstDefinitionName,
            bFirstDefinitionName,
            weakestCondition,
            contributingDefinitionIds: uniqueDefIdsForPair,
            definitionId: primaryDefinitionId === '' ? null : primaryDefinitionId,
            aggregateRunId,
          });
        }
      }

      ctx.log.debug({ domainId, cellCount: cells.length }, 'Domain value coverage computed');
      return { domainId, values, cells, availableModels };
    },
  })
);

