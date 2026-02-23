import { builder } from '../builder.js';
import { db, resolveDefinitionContent } from '@valuerank/db';
import { DomainRef } from '../types/domain.js';
import { normalizeDomainName } from '../../utils/domain-name.js';
import { estimateCost as estimateCostService } from '../../services/cost/estimate.js';
import { parseTemperature } from '../../utils/temperature.js';

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;
const VALUE_PAIR_RESOLVE_CHUNK_SIZE = 20;
const DOMAIN_TRIAL_PLAN_COST_CHUNK_SIZE = 5;
// Domain analysis visualizations are intentionally scoped to the 10-value set used by
// the current product experience. Keep this aligned with web `VALUES` and do not
// expand to all Schwartz values without corresponding UI/product updates.
const DOMAIN_ANALYSIS_VALUE_KEYS = [
  'Self_Direction_Action',
  'Universalism_Nature',
  'Benevolence_Dependability',
  'Security_Personal',
  'Power_Dominance',
  'Achievement',
  'Tradition',
  'Stimulation',
  'Hedonism',
  'Conformity_Interpersonal',
] as const;

type DomainAnalysisValueKey = (typeof DOMAIN_ANALYSIS_VALUE_KEYS)[number];
type DomainAnalysisScoreMethod = 'LOG_ODDS' | 'FULL_BT';

type DefinitionRow = {
  id: string;
  name?: string;
  parentId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type DomainAnalysisValueCounts = {
  prioritized: number;
  deprioritized: number;
  neutral: number;
};

type DomainAnalysisValuePair = {
  valueA: DomainAnalysisValueKey;
  valueB: DomainAnalysisValueKey;
};

type DomainAnalysisValueScore = {
  valueKey: DomainAnalysisValueKey;
  score: number;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalComparisons: number;
};

type DomainAnalysisModel = {
  model: string;
  label: string;
  values: DomainAnalysisValueScore[];
};

type DomainAnalysisUnavailableModel = {
  model: string;
  label: string;
  reason: string;
};

type DomainAnalysisResult = {
  domainId: string;
  domainName: string;
  totalDefinitions: number;
  targetedDefinitions: number;
  definitionsWithAnalysis: number;
  models: DomainAnalysisModel[];
  unavailableModels: DomainAnalysisUnavailableModel[];
  generatedAt: Date;
};

type DomainAnalysisConditionDetail = {
  scenarioId: string | null;
  conditionName: string;
  dimensions: Record<string, string | number> | null;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  selectedValueWinRate: number | null;
  meanDecisionScore: number | null;
};

type DomainAnalysisVignetteDetail = {
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  aggregateRunId: string | null;
  otherValueKey: DomainAnalysisValueKey;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  selectedValueWinRate: number | null;
  conditions: DomainAnalysisConditionDetail[];
};

type DomainAnalysisValueDetailResult = {
  domainId: string;
  domainName: string;
  modelId: string;
  modelLabel: string;
  valueKey: DomainAnalysisValueKey;
  score: number;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  vignettes: DomainAnalysisVignetteDetail[];
  generatedAt: Date;
};

type DomainTrialPlanModel = {
  modelId: string;
  label: string;
  isDefault: boolean;
  supportsTemperature: boolean;
};

type DomainTrialPlanVignette = {
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  scenarioCount: number;
};

type DomainTrialPlanCellEstimate = {
  definitionId: string;
  modelId: string;
  estimatedCost: number;
};

type DomainTrialPlanResult = {
  domainId: string;
  domainName: string;
  vignettes: DomainTrialPlanVignette[];
  models: DomainTrialPlanModel[];
  cellEstimates: DomainTrialPlanCellEstimate[];
  totalEstimatedCost: number;
  existingTemperatures: number[];
  defaultTemperature: number | null;
  temperatureWarning: string | null;
};

type DomainTrialModelStatus = {
  modelId: string;
  generationCompleted: number;
  generationFailed: number;
  generationTotal: number;
  summarizationCompleted: number;
  summarizationFailed: number;
  summarizationTotal: number;
};

type DomainTrialRunStatus = {
  runId: string;
  definitionId: string;
  status: string;
  modelStatuses: DomainTrialModelStatus[];
};

type DomainAnalysisConditionTranscript = {
  id: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  decisionCode: string | null;
  decisionCodeSource: string | null;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  createdAt: Date;
  content: unknown;
};

const DomainAnalysisValueScoreRef = builder.objectRef<DomainAnalysisValueScore>('DomainAnalysisValueScore');
const DomainAnalysisModelRef = builder.objectRef<DomainAnalysisModel>('DomainAnalysisModel');
const DomainAnalysisUnavailableModelRef = builder.objectRef<DomainAnalysisUnavailableModel>('DomainAnalysisUnavailableModel');
const DomainAnalysisResultRef = builder.objectRef<DomainAnalysisResult>('DomainAnalysisResult');
const DomainAnalysisConditionDetailRef = builder.objectRef<DomainAnalysisConditionDetail>('DomainAnalysisConditionDetail');
const DomainAnalysisVignetteDetailRef = builder.objectRef<DomainAnalysisVignetteDetail>('DomainAnalysisVignetteDetail');
const DomainAnalysisValueDetailResultRef = builder.objectRef<DomainAnalysisValueDetailResult>('DomainAnalysisValueDetailResult');
const DomainAnalysisConditionTranscriptRef = builder.objectRef<DomainAnalysisConditionTranscript>('DomainAnalysisConditionTranscript');
const DomainTrialPlanModelRef = builder.objectRef<DomainTrialPlanModel>('DomainTrialPlanModel');
const DomainTrialPlanVignetteRef = builder.objectRef<DomainTrialPlanVignette>('DomainTrialPlanVignette');
const DomainTrialPlanCellEstimateRef = builder.objectRef<DomainTrialPlanCellEstimate>('DomainTrialPlanCellEstimate');
const DomainTrialPlanResultRef = builder.objectRef<DomainTrialPlanResult>('DomainTrialPlanResult');
const DomainTrialModelStatusRef = builder.objectRef<DomainTrialModelStatus>('DomainTrialModelStatus');
const DomainTrialRunStatusRef = builder.objectRef<DomainTrialRunStatus>('DomainTrialRunStatus');

builder.objectType(DomainAnalysisValueScoreRef, {
  fields: (t) => ({
    valueKey: t.exposeString('valueKey'),
    score: t.exposeFloat('score'),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalComparisons: t.exposeInt('totalComparisons'),
  }),
});

builder.objectType(DomainAnalysisModelRef, {
  fields: (t) => ({
    model: t.exposeString('model'),
    label: t.exposeString('label'),
    values: t.field({
      type: [DomainAnalysisValueScoreRef],
      resolve: (parent) => parent.values,
    }),
  }),
});

builder.objectType(DomainAnalysisUnavailableModelRef, {
  fields: (t) => ({
    model: t.exposeString('model'),
    label: t.exposeString('label'),
    reason: t.exposeString('reason'),
  }),
});

builder.objectType(DomainAnalysisResultRef, {
  fields: (t) => ({
    domainId: t.exposeID('domainId'),
    domainName: t.exposeString('domainName'),
    totalDefinitions: t.exposeInt('totalDefinitions'),
    targetedDefinitions: t.exposeInt('targetedDefinitions'),
    definitionsWithAnalysis: t.exposeInt('definitionsWithAnalysis'),
    models: t.field({
      type: [DomainAnalysisModelRef],
      resolve: (parent) => parent.models,
    }),
    unavailableModels: t.field({
      type: [DomainAnalysisUnavailableModelRef],
      resolve: (parent) => parent.unavailableModels,
    }),
    generatedAt: t.field({
      type: 'DateTime',
      resolve: (parent) => parent.generatedAt,
    }),
  }),
});

builder.objectType(DomainAnalysisConditionDetailRef, {
  fields: (t) => ({
    scenarioId: t.exposeID('scenarioId', { nullable: true }),
    conditionName: t.exposeString('conditionName'),
    dimensions: t.expose('dimensions', { type: 'JSON', nullable: true }),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalTrials: t.exposeInt('totalTrials'),
    selectedValueWinRate: t.exposeFloat('selectedValueWinRate', { nullable: true }),
    meanDecisionScore: t.exposeFloat('meanDecisionScore', { nullable: true }),
  }),
});

builder.objectType(DomainAnalysisVignetteDetailRef, {
  fields: (t) => ({
    definitionId: t.exposeID('definitionId'),
    definitionName: t.exposeString('definitionName'),
    definitionVersion: t.exposeInt('definitionVersion'),
    aggregateRunId: t.exposeID('aggregateRunId', { nullable: true }),
    otherValueKey: t.exposeString('otherValueKey'),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalTrials: t.exposeInt('totalTrials'),
    selectedValueWinRate: t.exposeFloat('selectedValueWinRate', { nullable: true }),
    conditions: t.field({
      type: [DomainAnalysisConditionDetailRef],
      resolve: (parent) => parent.conditions,
    }),
  }),
});

builder.objectType(DomainAnalysisValueDetailResultRef, {
  fields: (t) => ({
    domainId: t.exposeID('domainId'),
    domainName: t.exposeString('domainName'),
    modelId: t.exposeString('modelId'),
    modelLabel: t.exposeString('modelLabel'),
    valueKey: t.exposeString('valueKey'),
    score: t.exposeFloat('score'),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalTrials: t.exposeInt('totalTrials'),
    vignettes: t.field({
      type: [DomainAnalysisVignetteDetailRef],
      resolve: (parent) => parent.vignettes,
    }),
    generatedAt: t.field({
      type: 'DateTime',
      resolve: (parent) => parent.generatedAt,
    }),
  }),
});

builder.objectType(DomainAnalysisConditionTranscriptRef, {
  fields: (t) => ({
    id: t.exposeID('id'),
    runId: t.exposeID('runId'),
    scenarioId: t.exposeID('scenarioId', { nullable: true }),
    modelId: t.exposeString('modelId'),
    decisionCode: t.exposeString('decisionCode', { nullable: true }),
    decisionCodeSource: t.exposeString('decisionCodeSource', { nullable: true }),
    turnCount: t.exposeInt('turnCount'),
    tokenCount: t.exposeInt('tokenCount'),
    durationMs: t.exposeInt('durationMs'),
    createdAt: t.field({
      type: 'DateTime',
      resolve: (parent) => parent.createdAt,
    }),
    content: t.expose('content', { type: 'JSON' }),
  }),
});

builder.objectType(DomainTrialPlanModelRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    label: t.exposeString('label'),
    isDefault: t.exposeBoolean('isDefault'),
    supportsTemperature: t.exposeBoolean('supportsTemperature'),
  }),
});

builder.objectType(DomainTrialPlanVignetteRef, {
  fields: (t) => ({
    definitionId: t.exposeID('definitionId'),
    definitionName: t.exposeString('definitionName'),
    definitionVersion: t.exposeInt('definitionVersion'),
    scenarioCount: t.exposeInt('scenarioCount'),
  }),
});

builder.objectType(DomainTrialPlanCellEstimateRef, {
  fields: (t) => ({
    definitionId: t.exposeID('definitionId'),
    modelId: t.exposeString('modelId'),
    estimatedCost: t.exposeFloat('estimatedCost'),
  }),
});

builder.objectType(DomainTrialPlanResultRef, {
  fields: (t) => ({
    domainId: t.exposeID('domainId'),
    domainName: t.exposeString('domainName'),
    vignettes: t.field({
      type: [DomainTrialPlanVignetteRef],
      resolve: (parent) => parent.vignettes,
    }),
    models: t.field({
      type: [DomainTrialPlanModelRef],
      resolve: (parent) => parent.models,
    }),
    cellEstimates: t.field({
      type: [DomainTrialPlanCellEstimateRef],
      resolve: (parent) => parent.cellEstimates,
    }),
    totalEstimatedCost: t.exposeFloat('totalEstimatedCost'),
    existingTemperatures: t.field({
      type: ['Float'],
      resolve: (parent) => parent.existingTemperatures,
    }),
    defaultTemperature: t.exposeFloat('defaultTemperature', { nullable: true }),
    temperatureWarning: t.exposeString('temperatureWarning', { nullable: true }),
  }),
});

builder.objectType(DomainTrialModelStatusRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    generationCompleted: t.exposeInt('generationCompleted'),
    generationFailed: t.exposeInt('generationFailed'),
    generationTotal: t.exposeInt('generationTotal'),
    summarizationCompleted: t.exposeInt('summarizationCompleted'),
    summarizationFailed: t.exposeInt('summarizationFailed'),
    summarizationTotal: t.exposeInt('summarizationTotal'),
  }),
});

builder.objectType(DomainTrialRunStatusRef, {
  fields: (t) => ({
    runId: t.exposeID('runId'),
    definitionId: t.exposeID('definitionId'),
    status: t.exposeString('status'),
    modelStatuses: t.field({
      type: [DomainTrialModelStatusRef],
      resolve: (parent) => parent.modelStatuses,
    }),
  }),
});

function isDomainAnalysisValueKey(value: string): value is DomainAnalysisValueKey {
  return DOMAIN_ANALYSIS_VALUE_KEYS.includes(value as DomainAnalysisValueKey);
}

function parseDomainAnalysisScoreMethod(value: string | null | undefined): DomainAnalysisScoreMethod {
  return value === 'FULL_BT' ? 'FULL_BT' : 'LOG_ODDS';
}

function parseSourceRunIds(config: unknown): string[] {
  if (config == null || typeof config !== 'object' || Array.isArray(config)) return [];
  const sourceRunIds = (config as { sourceRunIds?: unknown }).sourceRunIds;
  if (!Array.isArray(sourceRunIds)) return [];
  return sourceRunIds.filter((id): id is string => typeof id === 'string' && id !== '');
}

function incrementValueCount(
  modelMap: Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>,
  valueKey: DomainAnalysisValueKey,
  field: 'prioritized' | 'deprioritized' | 'neutral',
): void {
  const current = modelMap.get(valueKey) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
  current[field] += 1;
  modelMap.set(valueKey, current);
}

function incrementPairwiseWin(
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
  winner: DomainAnalysisValueKey,
  loser: DomainAnalysisValueKey,
): void {
  const winnerMap = pairwiseWins.get(winner) ?? new Map<DomainAnalysisValueKey, number>();
  winnerMap.set(loser, (winnerMap.get(loser) ?? 0) + 1);
  pairwiseWins.set(winner, winnerMap);
}

function getPairwiseWinCount(
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
  winner: DomainAnalysisValueKey,
  loser: DomainAnalysisValueKey,
): number {
  return pairwiseWins.get(winner)?.get(loser) ?? 0;
}

function computeSmoothedLogOddsScore(wins: number, losses: number): number {
  return Math.log((wins + 1) / (losses + 1));
}

function computeFullBTScores(
  valueKeys: readonly DomainAnalysisValueKey[],
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
): Map<DomainAnalysisValueKey, number> {
  const EPSILON = 1e-6;
  const MAX_ITERATIONS = 500;
  const TOLERANCE = 1e-8;

  const strengths = new Map<DomainAnalysisValueKey, number>(valueKeys.map((valueKey) => [valueKey, 1]));

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const nextStrengths = new Map<DomainAnalysisValueKey, number>();
    let maxLogDelta = 0;

    for (const valueKey of valueKeys) {
      const currentStrength = strengths.get(valueKey) ?? 1;
      let totalWins = 0;
      let denominator = 0;
      let hasComparisons = false;

      for (const opponent of valueKeys) {
        if (opponent === valueKey) continue;
        const wins = getPairwiseWinCount(pairwiseWins, valueKey, opponent);
        const losses = getPairwiseWinCount(pairwiseWins, opponent, valueKey);
        const matches = wins + losses;
        if (matches <= 0) continue;

        const opponentStrength = strengths.get(opponent) ?? 1;
        const sumStrength = currentStrength + opponentStrength;
        if (sumStrength <= 0) continue;

        hasComparisons = true;
        totalWins += wins;
        denominator += matches / sumStrength;
      }

      let nextStrength = currentStrength;
      if (hasComparisons && denominator > 0) {
        nextStrength = totalWins / denominator;
      }
      if (!Number.isFinite(nextStrength) || nextStrength <= 0) {
        nextStrength = EPSILON;
      }
      nextStrengths.set(valueKey, nextStrength);
    }

    const logValues = valueKeys.map((valueKey) => Math.log(Math.max(nextStrengths.get(valueKey) ?? EPSILON, EPSILON)));
    const meanLog = logValues.reduce((sum, value) => sum + value, 0) / (logValues.length || 1);
    const normalizationFactor = Math.exp(meanLog);

    for (const valueKey of valueKeys) {
      const normalized = Math.max((nextStrengths.get(valueKey) ?? EPSILON) / normalizationFactor, EPSILON);
      const prev = Math.max(strengths.get(valueKey) ?? EPSILON, EPSILON);
      const logDelta = Math.abs(Math.log(normalized) - Math.log(prev));
      if (logDelta > maxLogDelta) maxLogDelta = logDelta;
      strengths.set(valueKey, normalized);
    }

    if (maxLogDelta < TOLERANCE) break;
  }

  return new Map(
    valueKeys.map((valueKey) => {
      const strength = Math.max(strengths.get(valueKey) ?? EPSILON, EPSILON);
      return [valueKey, Math.log(strength)];
    }),
  );
}

async function resolveValuePairsInChunks(
  definitionIds: string[],
): Promise<Map<string, DomainAnalysisValuePair>> {
  const valuePairByDefinition = new Map<string, DomainAnalysisValuePair>();

  for (let offset = 0; offset < definitionIds.length; offset += VALUE_PAIR_RESOLVE_CHUNK_SIZE) {
    const batch = definitionIds.slice(offset, offset + VALUE_PAIR_RESOLVE_CHUNK_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (definitionId) => {
        const resolved = await resolveDefinitionContent(definitionId);
        const valueA = resolved.resolvedContent.dimensions[0]?.name;
        const valueB = resolved.resolvedContent.dimensions[1]?.name;
        if (valueA == null || valueA === '' || valueB == null || valueB === '') return;
        if (!isDomainAnalysisValueKey(valueA) || !isDomainAnalysisValueKey(valueB)) return;
        valuePairByDefinition.set(definitionId, { valueA, valueB });
      }),
    );
    settled.forEach(() => undefined);
  }

  return valuePairByDefinition;
}

function collectSourceRunsByDefinition(
  latestDefinitionIds: string[],
  latestRunByDefinition: Map<string, { config: unknown }>,
): { sourceRunIds: string[]; sourceRunDefinitionById: Map<string, string> } {
  const sourceRunIdSet = new Set<string>();
  const sourceRunDefinitionById = new Map<string, string>();

  for (const definitionId of latestDefinitionIds) {
    const aggregateRun = latestRunByDefinition.get(definitionId);
    if (!aggregateRun) continue;
    const sourceRunIds = parseSourceRunIds(aggregateRun.config);
    for (const sourceRunId of sourceRunIds) {
      sourceRunIdSet.add(sourceRunId);
      sourceRunDefinitionById.set(sourceRunId, definitionId);
    }
  }

  return { sourceRunIds: Array.from(sourceRunIdSet), sourceRunDefinitionById };
}

function classifyDecisionForSelectedValue(
  decision: number,
  selectedIsValueA: boolean,
): 'prioritized' | 'deprioritized' | 'neutral' {
  if (decision >= 4) return selectedIsValueA ? 'prioritized' : 'deprioritized';
  if (decision <= 2) return selectedIsValueA ? 'deprioritized' : 'prioritized';
  return 'neutral';
}

function aggregateValueCountsFromTranscripts(
  transcripts: Array<{ runId: string; modelId: string; decisionCode: string | null }>,
  sourceRunDefinitionById: Map<string, string>,
  valuePairByDefinition: Map<string, DomainAnalysisValuePair>,
): {
  aggregatedByModel: Map<string, Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>>;
  pairwiseWinsByModel: Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>;
  analyzedDefinitionIds: Set<string>;
} {
  const aggregatedByModel = new Map<string, Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>>();
  const pairwiseWinsByModel = new Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>();
  const analyzedDefinitionIds = new Set<string>();

  for (const transcript of transcripts) {
    const definitionId = sourceRunDefinitionById.get(transcript.runId);
    if (definitionId == null || definitionId === '') continue;
    const pair = valuePairByDefinition.get(definitionId);
    if (!pair) continue;
    if (transcript.decisionCode == null || transcript.decisionCode === '') continue;
    const decision = Number.parseInt(transcript.decisionCode, 10);
    if (!Number.isFinite(decision)) continue;

    let valueMap = aggregatedByModel.get(transcript.modelId);
    if (!valueMap) {
      valueMap = new Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>();
      aggregatedByModel.set(transcript.modelId, valueMap);
    }

    let pairwiseWins = pairwiseWinsByModel.get(transcript.modelId);
    if (!pairwiseWins) {
      pairwiseWins = new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>();
      pairwiseWinsByModel.set(transcript.modelId, pairwiseWins);
    }

    if (decision >= 4) {
      incrementValueCount(valueMap, pair.valueA, 'prioritized');
      incrementValueCount(valueMap, pair.valueB, 'deprioritized');
      incrementPairwiseWin(pairwiseWins, pair.valueA, pair.valueB);
    } else if (decision <= 2) {
      incrementValueCount(valueMap, pair.valueA, 'deprioritized');
      incrementValueCount(valueMap, pair.valueB, 'prioritized');
      incrementPairwiseWin(pairwiseWins, pair.valueB, pair.valueA);
    } else {
      incrementValueCount(valueMap, pair.valueA, 'neutral');
      incrementValueCount(valueMap, pair.valueB, 'neutral');
    }

    analyzedDefinitionIds.add(definitionId);
  }

  return { aggregatedByModel, pairwiseWinsByModel, analyzedDefinitionIds };
}

function getLineageRootId(definition: DefinitionRow, definitionsById: Map<string, DefinitionRow>): string {
  let current = definition;
  const visited = new Set<string>([current.id]);

  while (current.parentId !== null) {
    const parent = definitionsById.get(current.parentId);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
  }

  return current.id;
}

function supportsTemperature(apiConfig: unknown): boolean {
  if (apiConfig === null || typeof apiConfig !== 'object') return true;
  const candidate = (apiConfig as Record<string, unknown>).supportsTemperature;
  if (typeof candidate === 'boolean') return candidate;
  return true;
}

function isNewerDefinition(left: DefinitionRow, right: DefinitionRow): boolean {
  if (left.version !== right.version) return left.version > right.version;
  const leftUpdated = left.updatedAt.getTime();
  const rightUpdated = right.updatedAt.getTime();
  if (leftUpdated !== rightUpdated) return leftUpdated > rightUpdated;
  return left.createdAt.getTime() > right.createdAt.getTime();
}

function selectLatestDefinitionPerLineage(
  definitions: DefinitionRow[],
  definitionsById: Map<string, DefinitionRow> = new Map(definitions.map((definition) => [definition.id, definition])),
): DefinitionRow[] {
  const latestByLineage = new Map<string, DefinitionRow>();

  for (const definition of definitions) {
    const lineageRootId = getLineageRootId(definition, definitionsById);
    const existing = latestByLineage.get(lineageRootId);
    if (!existing || isNewerDefinition(definition, existing)) {
      latestByLineage.set(lineageRootId, definition);
    }
  }

  return Array.from(latestByLineage.values());
}

async function hydrateDefinitionAncestors(definitions: DefinitionRow[]): Promise<Map<string, DefinitionRow>> {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));

  let missingParentIds = new Set(
    definitions
      .map((definition) => definition.parentId)
      .filter((parentId): parentId is string => parentId !== null && !definitionsById.has(parentId)),
  );

  while (missingParentIds.size > 0) {
    const parentIdsBatch = Array.from(missingParentIds);
    missingParentIds = new Set<string>();

    const missingParents = await db.definition.findMany({
      where: { id: { in: parentIdsBatch } },
      select: {
        id: true,
        parentId: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    for (const parent of missingParents) {
      if (definitionsById.has(parent.id)) continue;
      definitionsById.set(parent.id, parent);
      if (parent.parentId !== null && !definitionsById.has(parent.parentId)) {
        missingParentIds.add(parent.parentId);
      }
    }
  }

  return definitionsById;
}

builder.queryField('domains', (t) =>
  t.field({
    type: [DomainRef],
    args: {
      search: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
    },
    resolve: async (_root, args) => {
      const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = args.offset ?? 0;
      const search = args.search?.trim();
      const hasSearch = search !== undefined && search !== null && search !== '';
      const normalizedSearch = hasSearch ? normalizeDomainName(search).normalizedName : undefined;

      const domains = await db.domain.findMany({
        where: hasSearch ? { normalizedName: { contains: normalizedSearch ?? '' } } : undefined,
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      });

      if (domains.length === 0) {
        return domains;
      }

      const definitionCounts = await db.definition.groupBy({
        by: ['domainId'],
        where: {
          deletedAt: null,
          domainId: {
            in: domains.map((domain) => domain.id),
          },
        },
        _count: {
          _all: true,
        },
      });

      const countByDomainId = new Map<string, number>(
        definitionCounts
          .filter((row): row is typeof row & { domainId: string } => row.domainId !== null)
          .map((row) => [row.domainId, row._count._all])
      );

      return domains.map((domain) => ({
        ...domain,
        definitionCount: countByDomainId.get(domain.id) ?? 0,
      }));
    },
  })
);

builder.queryField('domain', (t) =>
  t.field({
    type: DomainRef,
    nullable: true,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args) => {
      return db.domain.findUnique({ where: { id: String(args.id) } });
    },
  })
);

builder.queryField('domainTrialsPlan', (t) =>
  t.field({
    type: DomainTrialPlanResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      temperature: t.arg.float({ required: false }),
    },
    resolve: async (_root, args) => {
      const domainId = String(args.domainId);
      const domain = await db.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw new Error(`Domain not found: ${domainId}`);

      const definitions = await db.definition.findMany({
        where: { domainId, deletedAt: null },
        select: {
          id: true,
          name: true,
          version: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (definitions.length === 0) {
        return {
          domainId,
          domainName: domain.name,
          vignettes: [],
          models: [],
          cellEstimates: [],
          totalEstimatedCost: 0,
          existingTemperatures: [],
          defaultTemperature: args.temperature ?? null,
          temperatureWarning: null,
        };
      }

      const definitionsById = await hydrateDefinitionAncestors(definitions);
      const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
      const latestDefinitionIds = latestDefinitions.map((definition) => definition.id);

      const scenarioCounts = await db.scenario.groupBy({
        by: ['definitionId'],
        where: { definitionId: { in: latestDefinitionIds }, deletedAt: null },
        _count: { _all: true },
      });
      const scenarioCountByDefinition = new Map(
        scenarioCounts.map((row) => [row.definitionId, row._count._all])
      );

      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: {
          modelId: true,
          displayName: true,
          isDefault: true,
          apiConfig: true,
        },
        orderBy: { displayName: 'asc' },
      });
      const defaultModels = activeModels.filter((model) => model.isDefault);
      const selectedModels = defaultModels.length > 0 ? defaultModels : activeModels;

      const modelIds = selectedModels.map((model) => model.modelId);
      const cellEstimates: DomainTrialPlanCellEstimate[] = [];
      let totalEstimatedCost = 0;

      if (modelIds.length > 0) {
        for (let offset = 0; offset < latestDefinitions.length; offset += DOMAIN_TRIAL_PLAN_COST_CHUNK_SIZE) {
          const chunk = latestDefinitions.slice(offset, offset + DOMAIN_TRIAL_PLAN_COST_CHUNK_SIZE);
          const estimates = await Promise.all(
            chunk.map(async (definition) => {
              const estimate = await estimateCostService({
                definitionId: definition.id,
                modelIds,
                samplePercentage: 100,
                samplesPerScenario: 1,
              });
              return { definitionId: definition.id, estimate };
            })
          );

          for (const { definitionId, estimate } of estimates) {
            for (const modelEstimate of estimate.perModel) {
              cellEstimates.push({
                definitionId,
                modelId: modelEstimate.modelId,
                estimatedCost: modelEstimate.totalCost,
              });
              totalEstimatedCost += modelEstimate.totalCost;
            }
          }
        }
      }

      const existingRuns = await db.run.findMany({
        where: {
          definitionId: { in: latestDefinitionIds },
          deletedAt: null,
        },
        select: { config: true },
      });
      const existingTemperatureSet = new Set<number>();
      for (const run of existingRuns) {
        const config = run.config as { temperature?: unknown } | null;
        const parsed = parseTemperature(config?.temperature);
        if (parsed !== null) {
          existingTemperatureSet.add(parsed);
        }
      }
      const existingTemperatures = Array.from(existingTemperatureSet.values()).sort((a, b) => a - b);

      const selectedTemperature = args.temperature ?? null;
      let temperatureWarning: string | null = null;
      if (existingTemperatures.length > 0) {
        if (selectedTemperature === null) {
          temperatureWarning = 'Existing domain trials include explicit temperatures. Running with provider default may produce separate versions.';
        } else if (!existingTemperatures.includes(selectedTemperature)) {
          temperatureWarning = `Selected temperature (${selectedTemperature}) differs from existing temperatures (${existingTemperatures.join(', ')}).`;
        }
      }

      return {
        domainId,
        domainName: domain.name,
        vignettes: latestDefinitions.map((definition) => ({
          definitionId: definition.id,
          definitionName: definition.name ?? 'Untitled vignette',
          definitionVersion: definition.version,
          scenarioCount: scenarioCountByDefinition.get(definition.id) ?? 0,
        })),
        models: selectedModels.map((model) => ({
          modelId: model.modelId,
          label: model.displayName,
          isDefault: model.isDefault,
          supportsTemperature: supportsTemperature(model.apiConfig),
        })),
        cellEstimates,
        totalEstimatedCost,
        existingTemperatures,
        defaultTemperature: selectedTemperature,
        temperatureWarning,
      };
    },
  })
);

builder.queryField('domainTrialRunsStatus', (t) =>
  t.field({
    type: [DomainTrialRunStatusRef],
    args: {
      runIds: t.arg.idList({ required: true }),
    },
    resolve: async (_root, args) => {
      const runIds = args.runIds.map(String);
      if (runIds.length === 0) return [];

      const runs = await db.run.findMany({
        where: {
          id: { in: runIds },
          deletedAt: null,
        },
        select: {
          id: true,
          definitionId: true,
          status: true,
          config: true,
        },
      });

      const probeRows = await db.probeResult.groupBy({
        by: ['runId', 'modelId', 'status'],
        where: { runId: { in: runIds } },
        _count: { _all: true },
      });
      const transcripts = await db.transcript.groupBy({
        by: ['runId', 'modelId'],
        where: { runId: { in: runIds }, deletedAt: null },
        _count: { _all: true },
      });
      const summarizedRows = await db.transcript.groupBy({
        by: ['runId', 'modelId'],
        where: { runId: { in: runIds }, deletedAt: null, summarizedAt: { not: null } },
        _count: { _all: true },
      });
      const summarizeFailedRows = await db.transcript.groupBy({
        by: ['runId', 'modelId'],
        where: { runId: { in: runIds }, deletedAt: null, decisionCode: 'error' },
        _count: { _all: true },
      });
      const selectedScenarioCounts = await db.runScenarioSelection.groupBy({
        by: ['runId'],
        where: { runId: { in: runIds } },
        _count: { _all: true },
      });

      const probeByKey = new Map<string, { completed: number; failed: number }>();
      for (const row of probeRows) {
        const key = `${row.runId}::${row.modelId}`;
        const existing = probeByKey.get(key) ?? { completed: 0, failed: 0 };
        if (row.status === 'SUCCESS') {
          existing.completed = row._count._all;
        } else if (row.status === 'FAILED') {
          existing.failed = row._count._all;
        }
        probeByKey.set(key, existing);
      }

      const transcriptTotalByKey = new Map<string, number>();
      for (const row of transcripts) {
        transcriptTotalByKey.set(`${row.runId}::${row.modelId}`, row._count._all);
      }
      const summarizedByKey = new Map<string, number>();
      for (const row of summarizedRows) {
        summarizedByKey.set(`${row.runId}::${row.modelId}`, row._count._all);
      }
      const summarizeFailedByKey = new Map<string, number>();
      for (const row of summarizeFailedRows) {
        summarizeFailedByKey.set(`${row.runId}::${row.modelId}`, row._count._all);
      }

      const scenarioCountByRun = new Map(
        selectedScenarioCounts.map((row) => [row.runId, row._count._all])
      );

      return runs.map((run) => {
        const runConfig = run.config as { models?: unknown; samplesPerScenario?: unknown } | null;
        const models = Array.isArray(runConfig?.models)
          ? runConfig.models.filter((model): model is string => typeof model === 'string')
          : [];
        const samplesPerScenario = typeof runConfig?.samplesPerScenario === 'number' && Number.isFinite(runConfig.samplesPerScenario)
          ? runConfig.samplesPerScenario
          : 1;
        const generationTotal = (scenarioCountByRun.get(run.id) ?? 0) * samplesPerScenario;

        const modelStatuses = models.map((modelId) => {
          const key = `${run.id}::${modelId}`;
          const probe = probeByKey.get(key) ?? { completed: 0, failed: 0 };
          const summarizationTotal = transcriptTotalByKey.get(key) ?? 0;
          return {
            modelId,
            generationCompleted: probe.completed,
            generationFailed: probe.failed,
            generationTotal,
            summarizationCompleted: summarizedByKey.get(key) ?? 0,
            summarizationFailed: summarizeFailedByKey.get(key) ?? 0,
            summarizationTotal,
          };
        });

        return {
          runId: run.id,
          definitionId: run.definitionId,
          status: run.status,
          modelStatuses,
        };
      });
    },
  })
);

builder.queryField('domainAnalysis', (t) =>
  t.field({
    type: DomainAnalysisResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      scoreMethod: t.arg.string({ required: false }),
    },
    resolve: async (_root, args) => {
      const domainId = String(args.domainId);
      const scoreMethod = parseDomainAnalysisScoreMethod(args.scoreMethod);
      const domain = await db.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw new Error(`Domain not found: ${domainId}`);

      const definitions = await db.definition.findMany({
        where: { domainId, deletedAt: null },
        select: {
          id: true,
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
          definitionsWithAnalysis: 0,
          models: [],
          unavailableModels: activeModels.map((model) => ({
            model: model.modelId,
            label: model.displayName,
            reason: 'No analyzed vignettes found in this domain.',
          })),
          generatedAt: new Date(),
        };
      }

      const definitionsById = await hydrateDefinitionAncestors(definitions);
      const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
      const latestDefinitionIds = latestDefinitions.map((definition) => definition.id);

      const aggregateRuns = await db.run.findMany({
        where: {
          definitionId: { in: latestDefinitionIds },
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
          definitionId: true,
          config: true,
        },
      });

      const latestRunByDefinition = new Map<string, { config: unknown }>();
      for (const run of aggregateRuns) {
        if (latestRunByDefinition.has(run.definitionId)) continue;
        latestRunByDefinition.set(run.definitionId, { config: run.config });
      }

      const valuePairByDefinition = await resolveValuePairsInChunks(latestDefinitionIds);
      const { sourceRunIds, sourceRunDefinitionById } = collectSourceRunsByDefinition(
        latestDefinitionIds,
        latestRunByDefinition,
      );

      let aggregatedByModel = new Map<string, Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>>();
      let pairwiseWinsByModel = new Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>();
      let analyzedDefinitionIds = new Set<string>();
      if (sourceRunIds.length > 0) {
        const transcripts = await db.transcript.findMany({
          where: {
            runId: { in: sourceRunIds },
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
          sourceRunDefinitionById,
          valuePairByDefinition,
        );
        aggregatedByModel = aggregated.aggregatedByModel;
        pairwiseWinsByModel = aggregated.pairwiseWinsByModel;
        analyzedDefinitionIds = aggregated.analyzedDefinitionIds;
      }

      const modelsWithData = Array.from(aggregatedByModel.keys()).sort((left, right) => {
        const leftLabel = activeModelLabelById.get(left) ?? left;
        const rightLabel = activeModelLabelById.get(right) ?? right;
        return leftLabel.localeCompare(rightLabel);
      });

      const models: DomainAnalysisModel[] = modelsWithData.map((modelId) => {
        const valueMap = aggregatedByModel.get(modelId)
          ?? new Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>();
        const pairwiseWins = pairwiseWinsByModel.get(modelId)
          ?? new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>();
        const btScores = scoreMethod === 'FULL_BT'
          ? computeFullBTScores(DOMAIN_ANALYSIS_VALUE_KEYS, pairwiseWins)
          : null;
        const values: DomainAnalysisValueScore[] = DOMAIN_ANALYSIS_VALUE_KEYS.map((valueKey) => {
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

        return {
          model: modelId,
          label: activeModelLabelById.get(modelId) ?? modelId,
          values,
        };
      });

      const unavailableModels = activeModels
        .filter((model) => !aggregatedByModel.has(model.modelId))
        .map((model) => ({
          model: model.modelId,
          label: model.displayName,
          reason: 'No aggregate transcript data available for selected domain.',
        }));

      return {
        domainId: domain.id,
        domainName: domain.name,
        totalDefinitions: definitions.length,
        targetedDefinitions: latestDefinitions.length,
        definitionsWithAnalysis: analyzedDefinitionIds.size,
        models,
        unavailableModels,
        generatedAt: new Date(),
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
    },
    resolve: async (_root, args) => {
      const domainId = String(args.domainId);
      const modelId = args.modelId;
      const rawValueKey = args.valueKey;
      const scoreMethod = parseDomainAnalysisScoreMethod(args.scoreMethod);
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
          config: true,
        },
      });

      const latestRunByDefinition = new Map<string, { id: string; config: unknown }>();
      for (const run of aggregateRuns) {
        if (latestRunByDefinition.has(run.definitionId)) continue;
        latestRunByDefinition.set(run.definitionId, { id: run.id, config: run.config });
      }

      const { sourceRunIds, sourceRunDefinitionById } = collectSourceRunsByDefinition(
        scoreDefinitionIds,
        latestRunByDefinition,
      );
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

      if (sourceRunIds.length > 0) {
        const transcripts = await db.transcript.findMany({
          where: {
            runId: { in: sourceRunIds },
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
          const definitionId = sourceRunDefinitionById.get(transcript.runId);
          if (definitionId == null || definitionId === '') continue;
          const pair = valuePairByDefinition.get(definitionId);
          const vignette = vignetteByDefinitionId.get(definitionId);
          if (!pair || !vignette) continue;
          if (transcript.decisionCode == null || transcript.decisionCode === '') continue;

          const decision = Number.parseInt(transcript.decisionCode, 10);
          if (!Number.isFinite(decision)) continue;

          const selectedIsValueA = pair.valueA === valueKey;
          if (decision >= 4) {
            incrementPairwiseWin(pairwiseWins, pair.valueA, pair.valueB);
          } else if (decision <= 2) {
            incrementPairwiseWin(pairwiseWins, pair.valueB, pair.valueA);
          }

          if (!targetDefinitionIdSet.has(definitionId)) continue;

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
    },
    resolve: async (_root, args) => {
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

      const definition = await db.definition.findFirst({
        where: { id: definitionId, domainId, deletedAt: null },
        select: { id: true },
      });
      if (!definition) return [];

      const pairMap = await resolveValuePairsInChunks([definitionId]);
      const pair = pairMap.get(definitionId);
      if (!pair) return [];
      if (pair.valueA !== valueKey && pair.valueB !== valueKey) return [];

      const aggregateRun = await db.run.findFirst({
        where: {
          definitionId,
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
        orderBy: { createdAt: 'desc' },
        select: { config: true },
      });
      if (!aggregateRun) return [];

      const sourceRunIds = parseSourceRunIds(aggregateRun.config);
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
