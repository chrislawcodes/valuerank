import { db, resolveDefinitionContent } from '@valuerank/db';
import { formatTrialSignature, formatVnewLabel, formatVnewSignature, isVnewSignature, parseVnewTemperature } from '@valuerank/shared/trial-signature';
import { parseTemperature } from '../../../utils/temperature.js';
import { parseDefinitionVersion } from '../../../utils/definition-version.js';

export { formatVnewLabel, formatVnewSignature };

export const MAX_LIMIT = 500;
export const DEFAULT_LIMIT = 50;
const VALUE_PAIR_RESOLVE_CHUNK_SIZE = 20;

// Domain analysis visualizations are intentionally scoped to the 10-value set used by
// the current product experience. Keep this aligned with web `VALUES` and do not
// expand to all Schwartz values without corresponding UI/product updates.
export const DOMAIN_ANALYSIS_VALUE_KEYS = [
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

export type DomainAnalysisValueKey = (typeof DOMAIN_ANALYSIS_VALUE_KEYS)[number];
export type DomainAnalysisScoreMethod = 'LOG_ODDS' | 'FULL_BT';

export type DefinitionRow = {
  id: string;
  name?: string;
  parentId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type DomainAnalysisValueCounts = {
  prioritized: number;
  deprioritized: number;
  neutral: number;
};

export type DomainAnalysisValuePair = {
  valueA: DomainAnalysisValueKey;
  valueB: DomainAnalysisValueKey;
};

export type DomainAnalysisValueScore = {
  valueKey: DomainAnalysisValueKey;
  score: number;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalComparisons: number;
};

export type DomainAnalysisUnavailableModel = {
  model: string;
  label: string;
  reason: string;
};

export type DomainAnalysisMissingDefinition = {
  definitionId: string;
  definitionName: string;
  reasonCode: DomainAnalysisMissingReasonCode;
  reasonLabel: string;
  missingAllModels: boolean;
  missingModelIds: string[];
  missingModelLabels: string[];
};

export type DomainAnalysisConditionDetail = {
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

export type DomainAnalysisVignetteDetail = {
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

export type DomainAnalysisValueDetailResult = {
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
  targetedDefinitions: number;
  coveredDefinitions: number;
  missingDefinitionIds: string[];
  vignettes: DomainAnalysisVignetteDetail[];
  generatedAt: Date;
};

export type DomainAvailableSignature = {
  signature: string;
  label: string;
  isVirtual: boolean;
  temperature: number | null;
};

export type DomainTrialPlanModel = {
  modelId: string;
  label: string;
  isDefault: boolean;
  supportsTemperature: boolean;
};

export type DomainTrialPlanVignette = {
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  signature: string;
  scenarioCount: number;
};

export type DomainTrialPlanCellEstimate = {
  definitionId: string;
  modelId: string;
  estimatedCost: number;
};

export type DomainEvaluationEstimateConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type DomainEvaluationEstimateModel = {
  modelId: string;
  label: string;
  isDefault: boolean;
  supportsTemperature: boolean;
  estimatedCost: number;
  basedOnSampleCount: number;
  isUsingFallback: boolean;
};

export type DomainEvaluationEstimateDefinition = {
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  signature: string;
  scenarioCount: number;
  estimatedCost: number;
  basedOnSampleCount: number;
  isUsingFallback: boolean;
};

export type DomainEvaluationCostEstimate = {
  domainId: string;
  domainName: string;
  scopeCategory: string;
  targetedDefinitions: number;
  totalScenarioCount: number;
  totalEstimatedCost: number;
  basedOnSampleCount: number;
  isUsingFallback: boolean;
  fallbackReason: string | null;
  estimateConfidence: DomainEvaluationEstimateConfidence;
  knownExclusions: string[];
  models: DomainEvaluationEstimateModel[];
  definitions: DomainEvaluationEstimateDefinition[];
  existingTemperatures: number[];
  defaultTemperature: number | null;
  temperatureWarning: string | null;
};

export type DomainTrialPlanResult = {
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

export type DomainTrialModelStatus = {
  modelId: string;
  generationCompleted: number;
  generationFailed: number;
  generationTotal: number;
  summarizationCompleted: number;
  summarizationFailed: number;
  summarizationTotal: number;
  latestErrorMessage: string | null;
};

export type DomainTrialRunStatus = {
  runId: string;
  definitionId: string;
  status: string;
  modelStatuses: DomainTrialModelStatus[];
};

export type DomainAnalysisConditionTranscript = {
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

export type DomainAnalysisMissingReasonCode = 'NO_COMPLETED_RUNS' | 'NO_SIGNATURE_MATCH' | 'NO_TRANSCRIPTS';

type SignatureResolutionResult = {
  selectedSignature: string | null;
  filteredSourceRunIds: string[];
  filteredSourceRunDefinitionById: Map<string, string>;
  coveredDefinitionIds: Set<string>;
  missingReasonByDefinitionId: Map<string, DomainAnalysisMissingReasonCode>;
};

export function isDomainAnalysisValueKey(value: string): value is DomainAnalysisValueKey {
  return DOMAIN_ANALYSIS_VALUE_KEYS.includes(value as DomainAnalysisValueKey);
}

export function parseDomainAnalysisScoreMethod(value: string | null | undefined): DomainAnalysisScoreMethod {
  return value === 'FULL_BT' ? 'FULL_BT' : 'LOG_ODDS';
}

export function formatRunSignature(config: unknown): string {
  const runConfig = config as {
    definitionSnapshot?: {
      _meta?: { definitionVersion?: unknown };
      version?: unknown;
    };
    temperature?: unknown;
  } | null;
  const definitionVersion =
    parseDefinitionVersion(runConfig?.definitionSnapshot?._meta?.definitionVersion) ??
    parseDefinitionVersion(runConfig?.definitionSnapshot?.version);
  const temperature = parseTemperature(runConfig?.temperature);
  return formatTrialSignature(definitionVersion, temperature);
}

export function getMissingReasonLabel(reasonCode: DomainAnalysisMissingReasonCode): string {
  switch (reasonCode) {
    case 'NO_COMPLETED_RUNS':
      return 'No completed runs were found for this vignette.';
    case 'NO_SIGNATURE_MATCH':
      return 'Completed runs exist, but none matched the selected signature.';
    case 'NO_TRANSCRIPTS':
      return 'Matching runs exist, but no analyzed transcripts were found for this signature.';
    default:
      return 'No compatible runs were found for this vignette.';
  }
}

function selectDefaultVnewSignature(completedRuns: Array<{ config: unknown }>): string | null {
  if (completedRuns.length === 0) return null;
  const temperatureCounts = new Map<string, { temperature: number | null; count: number }>();

  for (const run of completedRuns) {
    const runConfig = run.config as { temperature?: unknown } | null;
    const temperature = parseTemperature(runConfig?.temperature);
    const key = temperature === null ? 'd' : temperature.toString();
    const existing = temperatureCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      temperatureCounts.set(key, { temperature, count: 1 });
    }
  }

  const winner = Array.from(temperatureCounts.values())
    .sort((left, right) => {
      const leftIsZero = left.temperature === 0;
      const rightIsZero = right.temperature === 0;
      if (leftIsZero !== rightIsZero) return leftIsZero ? -1 : 1;
      if (left.count !== right.count) return right.count - left.count;
      if (left.temperature === null) return 1;
      if (right.temperature === null) return -1;
      return left.temperature - right.temperature;
    })[0];

  if (!winner) return null;
  return formatVnewSignature(winner.temperature);
}

function runMatchesSignature(runConfig: unknown, signature: string): boolean {
  if (isVnewSignature(signature)) {
    return parseTemperature((runConfig as { temperature?: unknown } | null)?.temperature) === parseVnewTemperature(signature);
  }
  return formatRunSignature(runConfig) === signature;
}

export async function resolveSignatureRuns(
  latestDefinitionIds: string[],
  selectedSignature: string | null,
): Promise<SignatureResolutionResult> {
  if (latestDefinitionIds.length === 0) {
    return {
      selectedSignature,
      filteredSourceRunIds: [],
      filteredSourceRunDefinitionById: new Map(),
      coveredDefinitionIds: new Set<string>(),
      missingReasonByDefinitionId: new Map<string, DomainAnalysisMissingReasonCode>(),
    };
  }

  const completedRuns = await db.run.findMany({
    where: {
      definitionId: { in: latestDefinitionIds },
      status: 'COMPLETED',
      deletedAt: null,
    },
    orderBy: [{ definitionId: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      definitionId: true,
      config: true,
    },
  });

  const effectiveSignature = selectedSignature ?? selectDefaultVnewSignature(completedRuns);
  const runsByDefinitionId = new Map<string, Array<{ id: string; definitionId: string; config: unknown }>>();
  for (const run of completedRuns) {
    const current = runsByDefinitionId.get(run.definitionId) ?? [];
    current.push(run);
    runsByDefinitionId.set(run.definitionId, current);
  }

  const filteredSourceRunIds: string[] = [];
  const filteredSourceRunDefinitionById = new Map<string, string>();
  const coveredDefinitionIds = new Set<string>();
  const missingReasonByDefinitionId = new Map<string, DomainAnalysisMissingReasonCode>();

  for (const definitionId of latestDefinitionIds) {
    const runs = runsByDefinitionId.get(definitionId) ?? [];
    if (runs.length === 0) {
      missingReasonByDefinitionId.set(definitionId, 'NO_COMPLETED_RUNS');
      continue;
    }

    const matchedRuns = effectiveSignature === null
      ? runs
      : runs.filter((run) => runMatchesSignature(run.config, effectiveSignature));
    if (matchedRuns.length === 0) {
      missingReasonByDefinitionId.set(definitionId, 'NO_SIGNATURE_MATCH');
      continue;
    }

    for (const matchedRun of matchedRuns) {
      filteredSourceRunIds.push(matchedRun.id);
      filteredSourceRunDefinitionById.set(matchedRun.id, definitionId);
    }
    coveredDefinitionIds.add(definitionId);
  }

  return {
    selectedSignature: effectiveSignature,
    filteredSourceRunIds,
    filteredSourceRunDefinitionById,
    coveredDefinitionIds,
    missingReasonByDefinitionId,
  };
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

export function incrementPairwiseWin(
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

export function computeSmoothedLogOddsScore(wins: number, losses: number): number {
  return Math.log((wins + 1) / (losses + 1));
}

export function computeFullBTScores(
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

export async function resolveValuePairsInChunks(
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

export function classifyDecisionForSelectedValue(
  decision: number,
  selectedIsValueA: boolean,
): 'prioritized' | 'deprioritized' | 'neutral' {
  if (decision >= 4) return selectedIsValueA ? 'prioritized' : 'deprioritized';
  if (decision <= 2) return selectedIsValueA ? 'deprioritized' : 'prioritized';
  return 'neutral';
}

export function aggregateValueCountsFromTranscripts(
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

export function supportsTemperature(apiConfig: unknown): boolean {
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

export function selectLatestDefinitionPerLineage(
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

export async function hydrateDefinitionAncestors(definitions: DefinitionRow[]): Promise<Map<string, DefinitionRow>> {
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
