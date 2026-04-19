import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { runMatchesSignature } from './domain-coverage-gql-types.js';
import { resolveTranscriptDecisionModel } from './domain/shared.js';
import { ModelsConsistencyResultRef, type ModelsConsistencyShape } from '../types/models-consistency.js';
import { computeOrderEffect } from '../../services/consistency/orderEffectPairing.js';
import {
  computeRepeatability,
  parsePairList,
  parseScenarioList,
  readConsistencySummary,
  type ConsistencyParsedPair,
  type ConsistencyParsedScenario,
} from '../../services/consistency/modelsConsistencyData.js';

type ModelRow = {
  modelId: string;
  displayName: string;
  providerId: string;
  provider: { id: string; name: string; displayName: string | null };
};

type RunRow = {
  id: string;
  config: unknown;
  definition: { domainId: string | null; domain: { name: string } | null } | null;
  analysisResults: Array<{
    analysisType: string;
    status: string;
    output: unknown;
  }>;
};

type ParsedModelData = {
  scenarios: ConsistencyParsedScenario[];
  pairs: ConsistencyParsedPair[];
  invalidShape: boolean;
};

function toString(value: unknown): string {
  return String(value);
}

function getCompanionRunId(config: unknown): string | null {
  if (config === null || typeof config !== 'object') return null;
  const companionRunId = (config as { companionRunId?: unknown }).companionRunId;
  return typeof companionRunId === 'string' && companionRunId.trim() !== '' ? companionRunId : null;
}

function buildParsedModelData(runs: RunRow[], modelId: string): ParsedModelData {
  const scenarios: ConsistencyParsedScenario[] = [];
  const pairs: ConsistencyParsedPair[] = [];
  let invalidShape = false;

  for (const run of runs) {
    for (const analysis of run.analysisResults) {
      if (analysis.analysisType !== 'AGGREGATE' || analysis.status !== 'CURRENT') continue;
      const rawSummary = readConsistencySummary(analysis.output);
      const rawModel = rawSummary?.perModel;
      const rawEntry = rawModel != null ? rawModel[modelId] : null;
      if (rawEntry == null || typeof rawEntry !== 'object') {
        continue;
      }

      const perScenario = parseScenarioList((rawEntry as { perScenario?: unknown }).perScenario);
      if (perScenario.length === 0) {
        invalidShape = true;
        continue;
      }

      scenarios.push(
        ...perScenario.map((scenario) => ({
          ...scenario,
          domainId: run.definition?.domainId ?? scenario.domainId,
          domainName: run.definition?.domain?.name ?? scenario.domainName,
        })),
      );

      pairs.push(...parsePairList((rawEntry as { perPair?: unknown }).perPair));
    }
  }

  return { scenarios, pairs, invalidShape };
}

function buildRepeatabilitySummary(scenarios: ConsistencyParsedScenario[]): ModelsConsistencyShape['models'][number]['repeatability'] {
  const repeatability = computeRepeatability(scenarios);
  const perDomainMap = new Map<string, ConsistencyParsedScenario[]>();
  for (const scenario of scenarios) {
    const key = `${scenario.domainId}::${scenario.domainName}`;
    const list = perDomainMap.get(key) ?? [];
    list.push(scenario);
    perDomainMap.set(key, list);
  }

  return {
    ...repeatability,
    perDomain: [...perDomainMap.entries()]
      .map(([key, rows]) => {
        const [domainId, domainName] = key.split('::');
        const pooled = computeRepeatability(rows);
        return {
          domainId,
          domainName: domainName ?? 'Unknown domain',
          value: pooled.value,
          ciLow: pooled.ciLow,
          ciHigh: pooled.ciHigh,
          scenariosMeasured: rows.length,
        };
      })
      .sort((left, right) => right.scenariosMeasured - left.scenariosMeasured || left.domainName.localeCompare(right.domainName)),
  };
}

function buildCoherenceSummary(pairs: ConsistencyParsedPair[]): ModelsConsistencyShape['models'][number]['coherence'] {
  const perPair = pairs.map((pair) => ({
    domainId: pair.domainId,
    valueKey: pair.valueKey,
    rho: pair.rho,
    pValue: pair.pValue,
    coherent: pair.coherent ?? false,
    determinate: pair.determinate ?? false,
    targetAnalysisRunId: pair.targetAnalysisRunId,
    targetCompanionRunId: pair.targetCompanionRunId,
    primaryConditionIds: pair.primaryConditionIds,
    companionConditionIds: pair.companionConditionIds,
    perCondition: pair.perCondition.map((condition) => ({
      netPressureRank: condition.netPressureRank,
      winRate: condition.winRate,
      matches: condition.matches,
      trials: condition.trials,
      scenarioId: condition.scenarioId,
    })),
  }));

  const determinatePairs = perPair.filter((pair) => pair.determinate).length;
  const coherentPairs = perPair.filter((pair) => pair.determinate && pair.coherent).length;
  const indeterminatePairs = perPair.filter((pair) => !pair.determinate).length;

  return {
    value: determinatePairs === 0 ? 0 : coherentPairs / determinatePairs,
    coherentPairs,
    determinatePairs,
    indeterminatePairs,
    perPair,
  };
}

type OrderEffectTranscriptRow = {
  runId: string;
  scenarioId: string | null;
  modelId: string;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  scenario: { orientationFlipped: boolean } | null;
};

function toOrderEffectTranscript(row: OrderEffectTranscriptRow) {
  const decisionModelV2 = resolveTranscriptDecisionModel({
    decisionMetadata: row.decisionMetadata,
    definitionSnapshot: row.definitionSnapshot,
    orientationFlipped: row.scenario?.orientationFlipped ?? null,
  });

  return {
    scenarioId: row.scenarioId,
    decisionModelV2: { canonical: decisionModelV2.canonical },
  };
}

builder.queryField('modelsConsistency', (t) =>
  t.field({
    type: ModelsConsistencyResultRef,
    args: {
      domainId: t.arg.id({ required: false }),
      providerId: t.arg.id({ required: false }),
      minScenarios: t.arg.int({ required: false }),
      signature: t.arg.string({ required: true }),
    },
    resolve: async (_root, args) => {
      const domainId = args.domainId != null ? toString(args.domainId) : null;
      const providerId = args.providerId != null ? toString(args.providerId) : null;
      const minScenarios = args.minScenarios ?? 1;
      const signature = toString(args.signature);

      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        include: { provider: true },
      });
      const models = providerId == null
        ? activeModels
        : activeModels.filter((model) => model.providerId === providerId || model.provider.id === providerId);

      const runs = await db.run.findMany({
        where: {
          status: 'COMPLETED',
          deletedAt: null,
          tags: { some: { tag: { name: 'Aggregate' } } },
          ...(domainId != null ? { definition: { domainId } } : {}),
        },
        include: {
          definition: {
            select: {
              domainId: true,
              domain: { select: { name: true } },
            },
          },
          analysisResults: {
            where: { status: 'CURRENT' },
            select: { analysisType: true, status: true, output: true },
          },
        },
      }) as RunRow[];

      const scopedRuns = runs.filter((run) => runMatchesSignature(run.config, signature));
      const runMap = new Map(scopedRuns.map((run) => [run.id, run] as const));
      const pairedRunPairs: Array<{ primaryRunId: string; companionRunId: string }> = [];
      const seenPairKeys = new Set<string>();
      for (const run of scopedRuns) {
        const companionRunId = getCompanionRunId(run.config);
        if (companionRunId == null || !runMap.has(companionRunId)) continue;
        const pairKey = [run.id, companionRunId].sort().join('::');
        if (seenPairKeys.has(pairKey)) continue;
        seenPairKeys.add(pairKey);
        pairedRunPairs.push({ primaryRunId: run.id, companionRunId });
      }

      const pairedRunIds = [...new Set(pairedRunPairs.flatMap((pair) => [pair.primaryRunId, pair.companionRunId]))];
      const orderEffectRows = pairedRunIds.length === 0
        ? []
        : await db.transcript.findMany({
            where: {
              runId: { in: pairedRunIds },
              deletedAt: null,
            },
            orderBy: { createdAt: 'asc' },
            select: {
              runId: true,
              scenarioId: true,
              modelId: true,
              decisionMetadata: true,
              definitionSnapshot: true,
              scenario: {
                select: {
                  orientationFlipped: true,
                },
              },
            },
          }) as OrderEffectTranscriptRow[];

      const orderEffectRowsByRun = new Map<string, OrderEffectTranscriptRow[]>();
      for (const row of orderEffectRows) {
        const list = orderEffectRowsByRun.get(row.runId) ?? [];
        list.push(row);
        orderEffectRowsByRun.set(row.runId, list);
      }

      const insufficient: ModelsConsistencyShape['insufficient'] = [];
      const outputModels: ModelsConsistencyShape['models'] = [];

      for (const model of models as ModelRow[]) {
        const { scenarios, pairs, invalidShape } = buildParsedModelData(scopedRuns, model.modelId);

        if (invalidShape) {
          insufficient.push({
            modelId: model.modelId,
            label: model.displayName,
            providerName: model.provider.displayName ?? model.provider.name,
            reason: 'invalid-summary-shape',
          });
          continue;
        }

        if (scenarios.length === 0) {
          insufficient.push({
            modelId: model.modelId,
            label: model.displayName,
            providerName: model.provider.displayName ?? model.provider.name,
            reason: 'no-repeat-coverage',
          });
          continue;
        }

        if (scenarios.length < minScenarios) {
          insufficient.push({
            modelId: model.modelId,
            label: model.displayName,
            providerName: model.provider.displayName ?? model.provider.name,
            reason: 'below-min-scenarios',
          });
          continue;
        }

        const repeatability = buildRepeatabilitySummary(scenarios);
        const coherence = buildCoherenceSummary(pairs);
        const primaryTranscripts = pairedRunPairs.flatMap((pair) =>
          (orderEffectRowsByRun.get(pair.primaryRunId) ?? [])
            .filter((row) => row.modelId === model.modelId)
            .map(toOrderEffectTranscript),
        );
        const companionTranscripts = pairedRunPairs.flatMap((pair) =>
          (orderEffectRowsByRun.get(pair.companionRunId) ?? [])
            .filter((row) => row.modelId === model.modelId)
            .map(toOrderEffectTranscript),
        );
        const orderEffect = computeOrderEffect(primaryTranscripts, companionTranscripts);

        outputModels.push({
          modelId: model.modelId,
          label: model.displayName,
          providerName: model.provider.displayName ?? model.provider.name,
          repeatability,
          coherence,
          orderEffect,
        });
      }

      return { models: outputModels, insufficient };
    },
  }),
);
