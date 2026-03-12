import { db } from '@valuerank/db';
import { builder } from '../../builder.js';
import {
  computeRankingShapes,
} from '../domain-shape.js';
import { computeClusterAnalysis } from '../domain-clustering.js';
import {
  DomainAnalysisConditionTranscriptRef,
  DomainAnalysisResultRef,
  DomainAnalysisValueDetailResultRef,
  type DomainAnalysisModel,
} from './types.js';
import {
  aggregateValueCountsFromTranscripts,
  classifyDecisionForSelectedValue,
  computeFullBTScores,
  computeSmoothedLogOddsScore,
  DOMAIN_ANALYSIS_VALUE_KEYS,
  getMissingReasonLabel,
  hydrateDefinitionAncestors,
  incrementPairwiseWin,
  isDomainAnalysisValueKey,
  parseDomainAnalysisScoreMethod,
  resolveSignatureRuns,
  resolveValuePairsInChunks,
  selectLatestDefinitionPerLineage,
} from './shared.js';
import type {
  DomainAnalysisConditionDetail,
  DomainAnalysisValueCounts,
  DomainAnalysisValueKey,
  DomainAnalysisVignetteDetail,
} from './shared.js';

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
      if (!domain) throw new Error(`Domain not found: ${domainId}`);

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
      const resolvedSignatureRuns = await resolveSignatureRuns(latestDefinitionIds, requestedSignature);
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
            decisionCode: { in: ['1', '2', '3', '4', '5'] },
          },
          select: {
            runId: true,
            modelId: true,
            decisionCode: true,
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

builder.queryField('domainAnalysisValueDetail', (t) =>
  t.field({
    type: DomainAnalysisValueDetailResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      modelId: t.arg.string({ required: true }),
      valueKey: t.arg.string({ required: true }),
      scoreMethod: t.arg.string({ required: false }),
      signature: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = String(args.domainId);
      const modelId = args.modelId;
      const rawValueKey = args.valueKey;
      const scoreMethod = parseDomainAnalysisScoreMethod(args.scoreMethod);
      const requestedSignature = typeof args.signature === 'string' && args.signature.trim() !== ''
        ? args.signature.trim()
        : null;
      if (requestedSignature === null) {
        ctx.log.warn({ domainId, modelId, valueKey: rawValueKey }, 'domainAnalysisValueDetail called without signature; defaulting to first vnew signature');
      }
      if (!isDomainAnalysisValueKey(rawValueKey)) {
        throw new Error(`Unsupported value key: ${rawValueKey}`);
      }
      const valueKey = rawValueKey;

      const domain = await db.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw new Error(`Domain not found: ${domainId}`);

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

      const modelMeta = await db.llmModel.findFirst({
        where: { modelId, status: 'ACTIVE' },
        select: { displayName: true },
      });
      const modelLabel = modelMeta?.displayName ?? modelId;

      if (definitions.length === 0) {
        return {
          domainId: domain.id,
          domainName: domain.name,
          modelId,
          modelLabel,
          valueKey,
          score: 0,
          prioritized: 0,
          deprioritized: 0,
          neutral: 0,
          totalTrials: 0,
          targetedDefinitions: 0,
          coveredDefinitions: 0,
          missingDefinitionIds: [],
          vignettes: [],
          generatedAt: new Date(),
        };
      }

      const definitionsById = await hydrateDefinitionAncestors(definitions);
      const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
      const latestDefinitionIds = latestDefinitions.map((definition) => definition.id);
      const definitionNameById = new Map(definitions.map((definition) => [definition.id, definition.name]));
      const definitionVersionById = new Map(definitions.map((definition) => [definition.id, definition.version]));

      const valuePairByDefinition = await resolveValuePairsInChunks(latestDefinitionIds);
      const targetDefinitionIds = latestDefinitionIds.filter((definitionId) => {
        const pair = valuePairByDefinition.get(definitionId);
        return pair?.valueA === valueKey || pair?.valueB === valueKey;
      });
      const scoreDefinitionIds = scoreMethod === 'FULL_BT' ? latestDefinitionIds : targetDefinitionIds;

      if (targetDefinitionIds.length === 0) {
        return {
          domainId: domain.id,
          domainName: domain.name,
          modelId,
          modelLabel,
          valueKey,
          score: 0,
          prioritized: 0,
          deprioritized: 0,
          neutral: 0,
          totalTrials: 0,
          targetedDefinitions: 0,
          coveredDefinitions: 0,
          missingDefinitionIds: [],
          vignettes: [],
          generatedAt: new Date(),
        };
      }

      const aggregateRuns = await db.run.findMany({
        where: {
          definitionId: { in: scoreDefinitionIds },
          status: 'COMPLETED',
          deletedAt: null,
          tags: {
            some: {
              tag: {
                name: 'Aggregate',
              },
            },
          },
        },
        orderBy: [{ definitionId: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          definitionId: true,
        },
      });

      const latestRunByDefinition = new Map<string, { id: string }>();
      for (const run of aggregateRuns) {
        if (latestRunByDefinition.has(run.definitionId)) continue;
        latestRunByDefinition.set(run.definitionId, { id: run.id });
      }

      const resolvedSignatureRuns = await resolveSignatureRuns(scoreDefinitionIds, requestedSignature);
      const filteredSourceRunIds = resolvedSignatureRuns.filteredSourceRunIds;
      const filteredSourceRunDefinitionById = resolvedSignatureRuns.filteredSourceRunDefinitionById;
      const targetDefinitionIdSet = new Set(targetDefinitionIds);

      type MutableCondition = {
        scenarioId: string | null;
        conditionName: string;
        dimensions: Record<string, string | number> | null;
        prioritized: number;
        deprioritized: number;
        neutral: number;
        totalTrials: number;
        decisionSum: number;
      };

      type MutableVignette = {
        definitionId: string;
        definitionName: string;
        definitionVersion: number;
        aggregateRunId: string | null;
        otherValueKey: DomainAnalysisValueKey;
        prioritized: number;
        deprioritized: number;
        neutral: number;
        totalTrials: number;
        conditions: Map<string, MutableCondition>;
      };

      const vignetteByDefinitionId = new Map<string, MutableVignette>();
      for (const definitionId of targetDefinitionIds) {
        const pair = valuePairByDefinition.get(definitionId);
        const definitionName = definitionNameById.get(definitionId);
        const definitionVersion = definitionVersionById.get(definitionId);
        if (!pair || definitionName == null || definitionVersion === undefined) continue;
        const aggregateRunId = latestRunByDefinition.get(definitionId)?.id ?? null;
        const otherValueKey = pair.valueA === valueKey ? pair.valueB : pair.valueA;
        vignetteByDefinitionId.set(definitionId, {
          definitionId,
          definitionName,
          definitionVersion,
          aggregateRunId,
          otherValueKey,
          prioritized: 0,
          deprioritized: 0,
          neutral: 0,
          totalTrials: 0,
          conditions: new Map(),
        });
      }

      let totalPrioritized = 0;
      let totalDeprioritized = 0;
      let totalNeutral = 0;
      const pairwiseWins = new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>();
      const analyzedDefinitionIds = new Set<string>();

      if (filteredSourceRunIds.length > 0) {
        const transcripts = await db.transcript.findMany({
          where: {
            runId: { in: filteredSourceRunIds },
            modelId,
            deletedAt: null,
            decisionCode: { in: ['1', '2', '3', '4', '5'] },
          },
          select: {
            runId: true,
            scenarioId: true,
            decisionCode: true,
          },
        });

        const scenarioIds = Array.from(
          new Set(
            transcripts
              .map((transcript) => transcript.scenarioId)
              .filter((scenarioId): scenarioId is string => scenarioId !== null && scenarioId !== ''),
          ),
        );

        const scenarios = scenarioIds.length === 0
          ? []
          : await db.scenario.findMany({
            where: { id: { in: scenarioIds } },
            select: { id: true, name: true, content: true },
          });
        const scenarioNameById = new Map(scenarios.map((scenario) => [scenario.id, scenario.name]));
        const scenarioDimensionsById = new Map<string, Record<string, string | number>>();
        const isDimensionValue = (value: unknown): value is string | number =>
          typeof value === 'string' || typeof value === 'number';
        for (const scenario of scenarios) {
          if (scenario.content == null || typeof scenario.content !== 'object' || Array.isArray(scenario.content)) continue;
          const content = scenario.content as Record<string, unknown>;
          const dimensions = content.dimensions;
          if (dimensions == null || typeof dimensions !== 'object' || Array.isArray(dimensions)) continue;
          const sanitized: Record<string, string | number> = {};
          for (const [key, value] of Object.entries(dimensions)) {
            if (isDimensionValue(value)) {
              sanitized[key] = value;
            }
          }
          if (Object.keys(sanitized).length > 0) {
            scenarioDimensionsById.set(scenario.id, sanitized);
          }
        }

        for (const transcript of transcripts) {
          const definitionId = filteredSourceRunDefinitionById.get(transcript.runId);
          if (definitionId == null || definitionId === '') continue;
          const pair = valuePairByDefinition.get(definitionId);
          const vignette = vignetteByDefinitionId.get(definitionId);
          if (!pair) continue;
          if (transcript.decisionCode == null || transcript.decisionCode === '') continue;

          const decision = Number.parseInt(transcript.decisionCode, 10);
          if (!Number.isFinite(decision)) continue;
          analyzedDefinitionIds.add(definitionId);

          const selectedIsValueA = pair.valueA === valueKey;
          if (decision >= 4) {
            incrementPairwiseWin(pairwiseWins, pair.valueA, pair.valueB);
          } else if (decision <= 2) {
            incrementPairwiseWin(pairwiseWins, pair.valueB, pair.valueA);
          }

          if (!targetDefinitionIdSet.has(definitionId) || !vignette) continue;

          const outcome = classifyDecisionForSelectedValue(decision, selectedIsValueA);

          if (outcome === 'prioritized') {
            totalPrioritized += 1;
            vignette.prioritized += 1;
          } else if (outcome === 'deprioritized') {
            totalDeprioritized += 1;
            vignette.deprioritized += 1;
          } else {
            totalNeutral += 1;
            vignette.neutral += 1;
          }
          vignette.totalTrials += 1;

          const scenarioKey = transcript.scenarioId ?? '__unknown__';
          const existingCondition = vignette.conditions.get(scenarioKey);
          const hasScenarioId = transcript.scenarioId !== null && transcript.scenarioId !== '';
          const scenarioId = hasScenarioId ? transcript.scenarioId : null;
          const conditionName = scenarioId === null
            ? 'Unknown Condition'
            : (scenarioNameById.get(scenarioId) ?? scenarioId);
          const condition = existingCondition ?? {
            scenarioId,
            conditionName,
            dimensions: scenarioId === null ? null : (scenarioDimensionsById.get(scenarioId) ?? null),
            prioritized: 0,
            deprioritized: 0,
            neutral: 0,
            totalTrials: 0,
            decisionSum: 0,
          };

          if (outcome === 'prioritized') condition.prioritized += 1;
          if (outcome === 'deprioritized') condition.deprioritized += 1;
          if (outcome === 'neutral') condition.neutral += 1;
          condition.totalTrials += 1;
          condition.decisionSum += decision;
          vignette.conditions.set(scenarioKey, condition);
        }
      }

      const vignettes: DomainAnalysisVignetteDetail[] = Array.from(vignetteByDefinitionId.values())
        .sort((left, right) => left.definitionName.localeCompare(right.definitionName))
        .map((vignette) => {
          const conditions: DomainAnalysisConditionDetail[] = Array.from(vignette.conditions.values())
            .sort((left, right) => left.conditionName.localeCompare(right.conditionName))
            .map((condition) => {
              const comparisonDenominator = condition.prioritized + condition.deprioritized;
              return {
                scenarioId: condition.scenarioId,
                conditionName: condition.conditionName,
                dimensions: condition.dimensions,
                prioritized: condition.prioritized,
                deprioritized: condition.deprioritized,
                neutral: condition.neutral,
                totalTrials: condition.totalTrials,
                selectedValueWinRate: comparisonDenominator === 0 ? null : condition.prioritized / comparisonDenominator,
                meanDecisionScore: condition.totalTrials === 0 ? null : condition.decisionSum / condition.totalTrials,
              };
            });

          const comparisonDenominator = vignette.prioritized + vignette.deprioritized;
          return {
            definitionId: vignette.definitionId,
            definitionName: vignette.definitionName,
            definitionVersion: vignette.definitionVersion,
            aggregateRunId: vignette.aggregateRunId,
            otherValueKey: vignette.otherValueKey,
            prioritized: vignette.prioritized,
            deprioritized: vignette.deprioritized,
            neutral: vignette.neutral,
            totalTrials: vignette.totalTrials,
            selectedValueWinRate: comparisonDenominator === 0 ? null : vignette.prioritized / comparisonDenominator,
            conditions,
          };
        });

      const missingReasonByDefinitionId = new Map(resolvedSignatureRuns.missingReasonByDefinitionId);
      for (const coveredDefinitionId of resolvedSignatureRuns.coveredDefinitionIds) {
        if (!analyzedDefinitionIds.has(coveredDefinitionId)) {
          missingReasonByDefinitionId.set(coveredDefinitionId, 'NO_TRANSCRIPTS');
        }
      }
      const missingDefinitionIds = scoreDefinitionIds.filter((id) => missingReasonByDefinitionId.has(id));

      return {
        domainId: domain.id,
        domainName: domain.name,
        modelId,
        modelLabel,
        valueKey,
        score: scoreMethod === 'FULL_BT'
          ? (computeFullBTScores(DOMAIN_ANALYSIS_VALUE_KEYS, pairwiseWins).get(valueKey) ?? 0)
          : computeSmoothedLogOddsScore(totalPrioritized, totalDeprioritized),
        prioritized: totalPrioritized,
        deprioritized: totalDeprioritized,
        neutral: totalNeutral,
        totalTrials: totalPrioritized + totalDeprioritized + totalNeutral,
        targetedDefinitions: scoreDefinitionIds.length,
        coveredDefinitions: resolvedSignatureRuns.coveredDefinitionIds.size,
        missingDefinitionIds,
        vignettes,
        generatedAt: new Date(),
      };
    },
  }),
);

builder.queryField('domainAnalysisConditionTranscripts', (t) =>
  t.field({
    type: [DomainAnalysisConditionTranscriptRef],
    args: {
      domainId: t.arg.id({ required: true }),
      modelId: t.arg.string({ required: true }),
      valueKey: t.arg.string({ required: true }),
      definitionId: t.arg.id({ required: true }),
      scenarioId: t.arg.id({ required: false }),
      limit: t.arg.int({ required: false }),
      signature: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = String(args.domainId);
      const modelId = args.modelId;
      const definitionId = String(args.definitionId);
      const rawValueKey = args.valueKey;
      if (!isDomainAnalysisValueKey(rawValueKey)) {
        throw new Error(`Unsupported value key: ${rawValueKey}`);
      }
      const valueKey = rawValueKey;
      const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
      const scenarioId = args.scenarioId != null && args.scenarioId !== '' ? String(args.scenarioId) : null;
      const requestedSignature = typeof args.signature === 'string' && args.signature.trim() !== ''
        ? args.signature.trim()
        : null;
      if (requestedSignature === null) {
        ctx.log.warn({ domainId, definitionId, modelId, valueKey }, 'domainAnalysisConditionTranscripts called without signature; defaulting to first vnew signature');
      }

      const definition = await db.definition.findFirst({
        where: { id: definitionId, domainId, deletedAt: null },
        select: { id: true },
      });
      if (!definition) return [];

      const pairMap = await resolveValuePairsInChunks([definitionId]);
      const pair = pairMap.get(definitionId);
      if (!pair) return [];
      if (pair.valueA !== valueKey && pair.valueB !== valueKey) return [];

      const resolvedSignatureRuns = await resolveSignatureRuns([definitionId], requestedSignature);
      const sourceRunIds = resolvedSignatureRuns.filteredSourceRunIds;
      if (sourceRunIds.length === 0) return [];

      return db.transcript.findMany({
        where: {
          runId: { in: sourceRunIds },
          modelId,
          ...(scenarioId === null ? {} : { scenarioId }),
          deletedAt: null,
          decisionCode: { in: ['1', '2', '3', '4', '5'] },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          runId: true,
          scenarioId: true,
          modelId: true,
          decisionCode: true,
          decisionCodeSource: true,
          turnCount: true,
          tokenCount: true,
          durationMs: true,
          createdAt: true,
          content: true,
        },
      });
    },
  }),
);
