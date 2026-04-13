import { db } from '@valuerank/db';
import { NotFoundError } from '@valuerank/shared';
import { builder } from '../../../builder.js';
import {
  computeRankingShapes,
} from '../../domain-shape.js';
import { computeClusterAnalysis } from '../../domain-clustering.js';
import {
  DomainAnalysisResultRef,
  type DomainAnalysisModel,
} from '../types.js';
import {
  aggregateValueCountsFromTranscripts,
  computeFullBTScores,
  computeSmoothedLogOddsScore,
  getMissingReasonLabel,
  hydrateDefinitionAncestors,
  parseDomainAnalysisScoreMethod,
  resolveEffectiveDefaultModelIds,
  resolveSignatureRuns,
  resolveValuePairsInChunks,
  selectLatestDefinitionPerLineage,
} from '../shared.js';
import { DOMAIN_ANALYSIS_VALUE_KEYS } from '../../domain-analysis-values.js';
import type {
  DomainAnalysisValueCounts,
} from '../shared.js';
import type { DomainAnalysisValueKey } from '../../domain-analysis-values.js';

builder.queryField('domainAnalysis', (t) =>
  t.field({
    type: DomainAnalysisResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      scoreMethod: t.arg.string({ required: false }),
      signature: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = String(args.domainId);
      const scoreMethod = parseDomainAnalysisScoreMethod(args.scoreMethod);
      const requestedSignature = typeof args.signature === 'string' && args.signature.trim() !== ''
        ? args.signature.trim()
        : null;
      if (requestedSignature === null) {
        ctx.log.warn({ domainId }, 'domainAnalysis called without signature; defaulting to first vnew signature');
      }
      const domain = await db.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw new NotFoundError('Domain', domainId);

      const definitions = await db.definition.findMany({
        where: { domainId, deletedAt: null },
        select: {
          id: true,
          name: true,
          parentId: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: { modelId: true, displayName: true },
      });
      const activeModelLabelById = new Map(activeModels.map((model) => [model.modelId, model.displayName]));

      if (definitions.length === 0) {
        return {
          domainId: domain.id,
          domainName: domain.name,
          totalDefinitions: 0,
          targetedDefinitions: 0,
          coveredDefinitions: 0,
          missingDefinitionIds: [],
          missingDefinitions: [],
          definitionsWithAnalysis: 0,
          models: [],
          unavailableModels: activeModels.map((model) => ({
            model: model.modelId,
            label: model.displayName,
            reason: 'No analyzed vignettes found in this domain.',
          })),
          generatedAt: new Date(),
          rankingShapeBenchmarks: { domainMeanTopGap: 0, domainStdTopGap: null, medianSpread: 0 },
          clusterAnalysis: { clusters: [], faultLinesByPair: {}, defaultPair: null, skipped: true, skipReason: 'No vignettes found in this domain.' },
        };
      }

      const definitionsById = await hydrateDefinitionAncestors(definitions);
      const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
      const latestDefinitionIds = latestDefinitions.map((definition) => definition.id);
      const definitionNameById = new Map<string, string>(
        definitions.map((definition) => [definition.id, definition.name ?? definition.id]),
      );

      const valuePairByDefinition = await resolveValuePairsInChunks(latestDefinitionIds);
      const resolvedSignatureRuns = await resolveSignatureRuns(latestDefinitionIds, requestedSignature, await resolveEffectiveDefaultModelIds(domain.defaultModelIds));
      const filteredSourceRunIds = resolvedSignatureRuns.filteredSourceRunIds;
      const filteredSourceRunDefinitionById = resolvedSignatureRuns.filteredSourceRunDefinitionById;

      let aggregatedByModel = new Map<string, Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>>();
      let pairwiseWinsByModel = new Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>();
      let analyzedDefinitionIds = new Set<string>();
      if (filteredSourceRunIds.length > 0) {
        const transcripts = await db.transcript.findMany({
          where: {
            runId: { in: filteredSourceRunIds },
            deletedAt: null,
            summarizedAt: { not: null },
          },
          select: {
            runId: true,
            modelId: true,
            decisionCode: true,
            decisionMetadata: true,
            scenario: {
              select: {
                orientationFlipped: true,
              },
            },
          },
        });
        const aggregated = aggregateValueCountsFromTranscripts(
          transcripts,
          filteredSourceRunDefinitionById,
          valuePairByDefinition,
        );
        aggregatedByModel = aggregated.aggregatedByModel;
        pairwiseWinsByModel = aggregated.pairwiseWinsByModel;
        analyzedDefinitionIds = aggregated.analyzedDefinitionIds;
      }

      const missingReasonByDefinitionId = new Map(resolvedSignatureRuns.missingReasonByDefinitionId);
      for (const coveredDefinitionId of resolvedSignatureRuns.coveredDefinitionIds) {
        if (!analyzedDefinitionIds.has(coveredDefinitionId)) {
          missingReasonByDefinitionId.set(coveredDefinitionId, 'NO_TRANSCRIPTS');
        }
      }
      const missingDefinitionIds = latestDefinitionIds.filter((definitionId) => missingReasonByDefinitionId.has(definitionId));

      const modelsWithData = Array.from(aggregatedByModel.keys()).sort((left, right) => {
        const leftLabel = activeModelLabelById.get(left) ?? left;
        const rightLabel = activeModelLabelById.get(right) ?? right;
        return leftLabel.localeCompare(rightLabel);
      });

      const modelsSortedScores: Array<{ model: string; sortedScores: number[] }> = [];
      const modelsBase = modelsWithData.map((modelId) => {
        const valueMap = aggregatedByModel.get(modelId)
          ?? new Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>();
        const pairwiseWins = pairwiseWinsByModel.get(modelId)
          ?? new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>();
        const btScores = scoreMethod === 'FULL_BT'
          ? computeFullBTScores(DOMAIN_ANALYSIS_VALUE_KEYS, pairwiseWins)
          : null;
        const values = DOMAIN_ANALYSIS_VALUE_KEYS.map((valueKey) => {
          const counts = valueMap.get(valueKey) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
          const wins = counts.prioritized;
          const losses = counts.deprioritized;
          const score = scoreMethod === 'FULL_BT'
            ? (btScores?.get(valueKey) ?? 0)
            : computeSmoothedLogOddsScore(wins, losses);
          return {
            valueKey,
            score,
            prioritized: counts.prioritized,
            deprioritized: counts.deprioritized,
            neutral: counts.neutral,
            totalComparisons: wins + losses,
          };
        });

        const sortedScores = [...values.map((v) => v.score)].sort((a, b) => b - a);
        modelsSortedScores.push({ model: modelId, sortedScores });

        return {
          model: modelId,
          label: activeModelLabelById.get(modelId) ?? modelId,
          values,
        };
      });

      const { shapes, benchmarks: rankingShapeBenchmarks } = computeRankingShapes(modelsSortedScores);
      const models: DomainAnalysisModel[] = modelsBase.map((model) => ({
        ...model,
        rankingShape: shapes.get(model.model) ?? {
          topStructure: 'even_spread' as const,
          bottomStructure: 'no_hard_no' as const,
          topGap: 0,
          bottomGap: 0,
          spread: 0,
          steepness: 0,
          dominanceZScore: null,
        },
      }));

      const clusterModels = modelsBase.map((model) => ({
        model: model.model,
        label: model.label,
        scores: Object.fromEntries(model.values.map((value) => [value.valueKey, value.score])),
      }));
      const clusterAnalysis = computeClusterAnalysis(clusterModels);

      const unavailableModels = activeModels
        .filter((model) => !aggregatedByModel.has(model.modelId))
        .map((model) => ({
          model: model.modelId,
          label: model.displayName,
          reason: 'No aggregate transcript data available for selected domain.',
        }));
      const missingModelIds = activeModels.map((model) => model.modelId);
      const missingModelLabels = activeModels.map((model) => model.displayName ?? model.modelId);
      const missingDefinitions = missingDefinitionIds.map((definitionId) => {
        const reasonCode = missingReasonByDefinitionId.get(definitionId) ?? 'NO_SIGNATURE_MATCH';
        return {
          definitionId,
          definitionName: definitionNameById.get(definitionId) ?? definitionId,
          reasonCode,
          reasonLabel: getMissingReasonLabel(reasonCode),
          missingAllModels: true,
          missingModelIds,
          missingModelLabels,
        };
      });

      return {
        domainId: domain.id,
        domainName: domain.name,
        totalDefinitions: definitions.length,
        targetedDefinitions: latestDefinitions.length,
        coveredDefinitions: resolvedSignatureRuns.coveredDefinitionIds.size,
        missingDefinitionIds,
        missingDefinitions,
        definitionsWithAnalysis: analyzedDefinitionIds.size,
        models,
        unavailableModels,
        generatedAt: new Date(),
        rankingShapeBenchmarks,
        clusterAnalysis,
      };
    },
  }),
);
