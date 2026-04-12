import { db } from '@valuerank/db';
import { builder } from '../../../builder.js';
import { buildScenarioAnalysisDimensionRecord, normalizeScenarioAnalysisMetadata } from '../../../../services/analysis/scenario-metadata.js';
import {
  DomainAnalysisValueDetailResultRef,
} from '../types.js';
import {
  computeFullBTScores,
  computeSmoothedLogOddsScore,
  hydrateDefinitionAncestors,
  incrementPairwiseWin,
  isDomainAnalysisValueKey,
  parseDomainAnalysisScoreMethod,
  resolveEffectiveDefaultModelIds,
  resolveSignatureRuns,
  resolveValuePairsInChunks,
  resolveTranscriptDecisionModel,
  selectLatestDefinitionPerLineage,
} from '../shared.js';
import { DOMAIN_ANALYSIS_VALUE_KEYS } from '../../domain-analysis-values.js';
import type {
  DomainAnalysisVignetteDetail,
} from '../shared.js';
import type { DomainAnalysisValueKey } from '../../domain-analysis-values.js';
import type { MutableVignette } from './value-detail-types.js';
import { mapVignette } from './value-detail-types.js';

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

      const resolvedSignatureRuns = await resolveSignatureRuns(scoreDefinitionIds, requestedSignature, await resolveEffectiveDefaultModelIds(domain.defaultModelIds));
      const filteredSourceRunIds = resolvedSignatureRuns.filteredSourceRunIds;
      const filteredSourceRunDefinitionById = resolvedSignatureRuns.filteredSourceRunDefinitionById;
      const targetDefinitionIdSet = new Set(targetDefinitionIds);

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
          },
          select: {
            runId: true,
            scenarioId: true,
            decisionCode: true,
            decisionMetadata: true,
            scenario: {
              select: {
                orientationFlipped: true,
              },
            },
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
        for (const scenario of scenarios) {
          const metadata = normalizeScenarioAnalysisMetadata(scenario.content);
          if (metadata === null) continue;
          const dimensions = buildScenarioAnalysisDimensionRecord(metadata);
          if (Object.keys(dimensions).length > 0) {
            scenarioDimensionsById.set(scenario.id, dimensions);
          }
        }

        for (const transcript of transcripts) {
          const definitionId = filteredSourceRunDefinitionById.get(transcript.runId);
          if (definitionId == null || definitionId === '') continue;
          const pair = valuePairByDefinition.get(definitionId);
          const vignette = vignetteByDefinitionId.get(definitionId);
          if (!pair || !vignette) continue;

          const canon = resolveTranscriptDecisionModel({
            decisionCode: transcript.decisionCode,
            decisionMetadata: transcript.decisionMetadata,
            orientationFlipped: transcript.scenario?.orientationFlipped ?? null,
            pairOverride: pair,
          }).canonical;

          if (canon.direction === 'unknown') {
            const scenarioKey = transcript.scenarioId ?? '__unknown__';
            const existingCondition = vignette.conditions.get(scenarioKey);
            if (existingCondition) {
              existingCondition.unknownCount += 1;
            } else {
              const hasScenarioId = transcript.scenarioId !== null && transcript.scenarioId !== '';
              const scenarioId = hasScenarioId ? transcript.scenarioId : null;
              const conditionName = scenarioId === null
                ? 'Unknown Condition'
                : (scenarioNameById.get(scenarioId) ?? scenarioId);
              vignette.conditions.set(scenarioKey, {
                scenarioId,
                conditionName,
                dimensions: scenarioId === null ? null : (scenarioDimensionsById.get(scenarioId) ?? null),
                prioritized: 0,
                deprioritized: 0,
                neutral: 0,
                totalTrials: 0,
                strongly: 0,
                somewhat: 0,
                opponentSomewhat: 0,
                opponentStrongly: 0,
                unknownCount: 1,
              });
            }
            continue;
          }

          analyzedDefinitionIds.add(definitionId);

          if (canon.favoredValueKey) {
            incrementPairwiseWin(pairwiseWins, canon.favoredValueKey, canon.opposedValueKey!);
          }

          if (!targetDefinitionIdSet.has(definitionId) || !vignette) continue;

          const outcome = canon.direction === 'neutral'
            ? 'neutral'
            : (canon.favoredValueKey === valueKey ? 'prioritized' : 'deprioritized');

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
            strongly: 0,
            somewhat: 0,
            opponentSomewhat: 0,
            opponentStrongly: 0,
            unknownCount: 0,
          };

          if (outcome === 'prioritized') {
            condition.prioritized += 1;
            if (canon.strength === 'strong') condition.strongly += 1;
            if (canon.strength === 'lean') condition.somewhat += 1;
          }
          if (outcome === 'deprioritized') {
            condition.deprioritized += 1;
            if (canon.strength === 'strong') condition.opponentStrongly += 1;
            if (canon.strength === 'lean') condition.opponentSomewhat += 1;
          }
          if (outcome === 'neutral') {
            condition.neutral += 1;
          }
          condition.totalTrials += 1;
          vignette.conditions.set(scenarioKey, condition);
        }
      }

      const vignettes: DomainAnalysisVignetteDetail[] = Array.from(vignetteByDefinitionId.values())
        .sort((left, right) => left.definitionName.localeCompare(right.definitionName))
        .map(mapVignette);

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
