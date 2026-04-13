import type { Prisma } from '@valuerank/db';
import { db } from '@valuerank/db';
import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import { getBoss, isBossRunning } from '../../queue/boss.js';
import { DEFAULT_JOB_OPTIONS } from '../../queue/types.js';
import {
  DOMAIN_ANALYSIS_VALUE_KEYS,
  type DomainAnalysisValueKey,
} from '../../graphql/queries/domain-analysis-values.js';
import {
  computeFullBTScores,
  computeSmoothedLogOddsScore,
  getMissingReasonLabel,
  hydrateDefinitionAncestors,
  resolveSignatureRuns,
  resolveValuePairsInChunks,
  selectLatestDefinitionPerLineage,
  type DefinitionRow,
  type DomainAnalysisMissingDefinition,
  type DomainAnalysisScoreMethod,
  type DomainAnalysisValueCounts,
} from '../../graphql/queries/domain/shared.js';
import { computeRankingShapes } from '../../graphql/queries/domain-shape.js';
import { computeClusterAnalysis } from '../../graphql/queries/domain-clustering.js';
import type {
  DomainAnalysisModel,
  DomainAnalysisResult,
} from '../../graphql/queries/domain/types.js';
import { computeAggregateFingerprint } from './aggregate/aggregate-helpers.js';

const log = createLogger('analysis:domain-cache');

export const DOMAIN_ANALYSIS_CACHE_STATUS = {
  FRESH: 'FRESH',
  UPDATING: 'UPDATING',
  OUT_OF_DATE: 'OUT_OF_DATE',
} as const;

export type DomainAnalysisCacheStatus =
  (typeof DOMAIN_ANALYSIS_CACHE_STATUS)[keyof typeof DOMAIN_ANALYSIS_CACHE_STATUS];

export const DOMAIN_ANALYSIS_SNAPSHOT_TYPE = 'domain_overview';
export const DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION = '1.0.0';
const DOMAIN_ANALYSIS_ASSUMPTION_PREFIX = 'domain-analysis';
const DOMAIN_ANALYSIS_NONE_SIGNATURE = '__none__';

type SnapshotClient = typeof db | Prisma.TransactionClient;

type DomainAnalysisSnapshotModel = {
  model: string;
  counts: Record<string, DomainAnalysisValueCounts>;
  pairwiseWins: Record<string, Record<string, number>>;
};

type DomainAnalysisSnapshotOutput = {
  domainId: string;
  domainName: string;
  totalDefinitions: number;
  targetedDefinitions: number;
  coveredDefinitions: number;
  definitionsWithAnalysis: number;
  missingDefinitions: DomainAnalysisMissingDefinition[];
  models: DomainAnalysisSnapshotModel[];
};

type AnalysisFingerprintRow = {
  runId: string;
  inputHash: string;
};

type AnalysisOutputRow = {
  runId: string;
  inputHash: string;
  output: unknown;
};

type DomainAnalysisPreparedState = {
  domain: { id: string; name: string; defaultModelIds: string[] };
  definitions: DefinitionRow[];
  latestDefinitions: DefinitionRow[];
  latestDefinitionIds: string[];
  definitionNameById: Map<string, string>;
  resolvedSignatureRuns: Awaited<ReturnType<typeof resolveSignatureRuns>>;
  selectedSignature: string | null;
  configSignature: string;
  fingerprintRows: AnalysisFingerprintRow[];
  inputHash: string;
};

function buildAssumptionKey(domainId: string): string {
  return `${DOMAIN_ANALYSIS_ASSUMPTION_PREFIX}:${domainId}`;
}

function normalizeSignature(signature: string | null): string {
  return signature ?? DOMAIN_ANALYSIS_NONE_SIGNATURE;
}

function parseSnapshotOutput(raw: unknown): DomainAnalysisSnapshotOutput | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Partial<DomainAnalysisSnapshotOutput>;
  if (
    typeof candidate.domainId !== 'string'
    || typeof candidate.domainName !== 'string'
    || typeof candidate.totalDefinitions !== 'number'
    || typeof candidate.targetedDefinitions !== 'number'
    || typeof candidate.coveredDefinitions !== 'number'
    || typeof candidate.definitionsWithAnalysis !== 'number'
    || !Array.isArray(candidate.missingDefinitions)
    || !Array.isArray(candidate.models)
  ) {
    return null;
  }
  return candidate as DomainAnalysisSnapshotOutput;
}

function parseCount(raw: unknown): DomainAnalysisValueCounts {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const record = raw as Record<string, unknown>;
  const prioritized = typeof record.prioritized === 'number' && Number.isFinite(record.prioritized) ? record.prioritized : 0;
  const deprioritized = typeof record.deprioritized === 'number' && Number.isFinite(record.deprioritized) ? record.deprioritized : 0;
  const neutral = typeof record.neutral === 'number' && Number.isFinite(record.neutral) ? record.neutral : 0;
  return { prioritized, deprioritized, neutral };
}

function getValueCountsFromAnalysis(output: unknown, modelId: string, valueKey: string): DomainAnalysisValueCounts {
  if (output == null || typeof output !== 'object' || Array.isArray(output)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const perModel = (output as { perModel?: unknown }).perModel;
  if (perModel == null || typeof perModel !== 'object' || Array.isArray(perModel)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const modelData = (perModel as Record<string, unknown>)[modelId];
  if (modelData == null || typeof modelData !== 'object' || Array.isArray(modelData)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const values = (modelData as { values?: unknown }).values;
  if (values == null || typeof values !== 'object' || Array.isArray(values)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const valueData = (values as Record<string, unknown>)[valueKey];
  if (valueData == null || typeof valueData !== 'object' || Array.isArray(valueData)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  return parseCount((valueData as { count?: unknown }).count);
}

function toCountsRecord(valueMap: Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>): Record<string, DomainAnalysisValueCounts> {
  const record: Record<string, DomainAnalysisValueCounts> = {};
  for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
    record[valueKey] = valueMap.get(valueKey) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  return record;
}

function toPairwiseRecord(
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
): Record<string, Record<string, number>> {
  const record: Record<string, Record<string, number>> = {};
  for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
    const winnerMap = pairwiseWins.get(valueKey) ?? new Map<DomainAnalysisValueKey, number>();
    record[valueKey] = Object.fromEntries(
      Array.from(winnerMap.entries()).map(([opponent, count]) => [opponent, count]),
    );
  }
  return record;
}

function computeInputHash(params: {
  domainId: string;
  signature: string;
  latestDefinitions: DefinitionRow[];
  fingerprints: AnalysisFingerprintRow[];
}): string {
  return computeAggregateFingerprint({
    domainId: params.domainId,
    signature: params.signature,
    definitions: params.latestDefinitions.map((definition) => ({
      id: definition.id,
      updatedAt: definition.updatedAt.toISOString(),
    })),
    analyses: params.fingerprints
      .slice()
      .sort((left, right) => left.runId.localeCompare(right.runId))
      .map((row) => ({ runId: row.runId, inputHash: row.inputHash })),
  }).slice(0, 16);
}

function addPairwiseWins(
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
  winner: DomainAnalysisValueKey,
  loser: DomainAnalysisValueKey,
  count: number,
): void {
  if (count <= 0) return;
  const winsForWinner = pairwiseWins.get(winner) ?? new Map<DomainAnalysisValueKey, number>();
  winsForWinner.set(loser, (winsForWinner.get(loser) ?? 0) + count);
  pairwiseWins.set(winner, winsForWinner);
}

async function resolvePreparedState(
  domainId: string,
  requestedSignature: string | null,
): Promise<DomainAnalysisPreparedState> {
  const domain = await db.domain.findUnique({
    where: { id: domainId },
    select: { id: true, name: true, defaultModelIds: true },
  });
  if (!domain) {
    throw new NotFoundError('Domain', domainId);
  }

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

  const definitionsById = await hydrateDefinitionAncestors(definitions);
  const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
  const latestDefinitionIds = latestDefinitions.map((definition) => definition.id);
  const definitionNameById = new Map<string, string>(
    definitions.map((definition) => [definition.id, definition.name ?? definition.id]),
  );

  const resolvedSignatureRuns = await resolveSignatureRuns(latestDefinitionIds, requestedSignature, domain.defaultModelIds);
  const selectedSignature = resolvedSignatureRuns.selectedSignature;
  const configSignature = normalizeSignature(selectedSignature);

  const fingerprintRows = resolvedSignatureRuns.filteredSourceRunIds.length === 0
    ? []
    : await db.analysisResult.findMany({
      where: {
        runId: { in: resolvedSignatureRuns.filteredSourceRunIds },
        analysisType: 'basic',
        status: 'CURRENT',
        deletedAt: null,
      },
      select: {
        runId: true,
        inputHash: true,
      },
    });

  const inputHash = computeInputHash({
    domainId,
    signature: configSignature,
    latestDefinitions,
    fingerprints: fingerprintRows,
  });

  return {
    domain,
    definitions,
    latestDefinitions,
    latestDefinitionIds,
    definitionNameById,
    resolvedSignatureRuns,
    selectedSignature,
    configSignature,
    fingerprintRows,
    inputHash,
  };
}

async function getCurrentSnapshot(
  client: SnapshotClient,
  domainId: string,
  configSignature: string,
) {
  return client.assumptionAnalysisSnapshot.findFirst({
    where: {
      assumptionKey: buildAssumptionKey(domainId),
      analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
      configSignature,
      status: 'CURRENT',
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

async function buildSnapshotOutput(
  state: DomainAnalysisPreparedState,
): Promise<DomainAnalysisSnapshotOutput> {
  const valuePairByDefinition = await resolveValuePairsInChunks(state.latestDefinitionIds);
  const analysisRows: AnalysisOutputRow[] = state.resolvedSignatureRuns.filteredSourceRunIds.length === 0
    ? []
    : await db.analysisResult.findMany({
      where: {
        runId: { in: state.resolvedSignatureRuns.filteredSourceRunIds },
        analysisType: 'basic',
        status: 'CURRENT',
        deletedAt: null,
      },
      select: {
        runId: true,
        inputHash: true,
        output: true,
      },
    });

  const aggregatedByModel = new Map<string, Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>>();
  const pairwiseWinsByModel = new Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>();
  const analyzedDefinitionIds = new Set<string>();

  for (const analysisRow of analysisRows) {
    const definitionId = state.resolvedSignatureRuns.filteredSourceRunDefinitionById.get(analysisRow.runId);
    if (definitionId == null || definitionId === '') continue;
    const pair = valuePairByDefinition.get(definitionId);
    if (!pair) continue;

    const output = analysisRow.output;
    if (output == null || typeof output !== 'object' || Array.isArray(output)) continue;
    const perModel = (output as { perModel?: unknown }).perModel;
    if (perModel == null || typeof perModel !== 'object' || Array.isArray(perModel)) continue;

    for (const modelId of Object.keys(perModel as Record<string, unknown>)) {
      let valueMap = aggregatedByModel.get(modelId);
      if (!valueMap) {
        valueMap = new Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>();
        aggregatedByModel.set(modelId, valueMap);
      }

      let pairwiseWins = pairwiseWinsByModel.get(modelId);
      if (!pairwiseWins) {
        pairwiseWins = new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>();
        pairwiseWinsByModel.set(modelId, pairwiseWins);
      }

      const firstCounts = getValueCountsFromAnalysis(output, modelId, pair.valueA);
      const secondCounts = getValueCountsFromAnalysis(output, modelId, pair.valueB);

      const existingFirst = valueMap.get(pair.valueA) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
      existingFirst.prioritized += firstCounts.prioritized;
      existingFirst.deprioritized += firstCounts.deprioritized;
      existingFirst.neutral += firstCounts.neutral;
      valueMap.set(pair.valueA, existingFirst);

      const existingSecond = valueMap.get(pair.valueB) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
      existingSecond.prioritized += secondCounts.prioritized;
      existingSecond.deprioritized += secondCounts.deprioritized;
      existingSecond.neutral += secondCounts.neutral;
      valueMap.set(pair.valueB, existingSecond);

      addPairwiseWins(pairwiseWins, pair.valueA, pair.valueB, firstCounts.prioritized);
      addPairwiseWins(pairwiseWins, pair.valueB, pair.valueA, secondCounts.prioritized);

      analyzedDefinitionIds.add(definitionId);
    }
  }

  const missingReasonByDefinitionId = new Map(state.resolvedSignatureRuns.missingReasonByDefinitionId);
  for (const coveredDefinitionId of state.resolvedSignatureRuns.coveredDefinitionIds) {
    if (!analyzedDefinitionIds.has(coveredDefinitionId)) {
      missingReasonByDefinitionId.set(coveredDefinitionId, 'NO_ANALYSIS');
    }
  }
  const missingDefinitions = state.latestDefinitionIds
    .filter((definitionId) => missingReasonByDefinitionId.has(definitionId))
    .map((definitionId) => {
      const reasonCode = missingReasonByDefinitionId.get(definitionId) ?? 'NO_SIGNATURE_MATCH';
      return {
        definitionId,
        definitionName: state.definitionNameById.get(definitionId) ?? definitionId,
        reasonCode,
        reasonLabel: getMissingReasonLabel(reasonCode),
        missingAllModels: true,
        missingModelIds: [],
        missingModelLabels: [],
      };
    });

  const models = Array.from(aggregatedByModel.entries())
    .map(([modelId, valueMap]) => ({
      model: modelId,
      counts: toCountsRecord(valueMap),
      pairwiseWins: toPairwiseRecord(
        pairwiseWinsByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>(),
      ),
    }))
    .sort((left, right) => left.model.localeCompare(right.model));

  return {
    domainId: state.domain.id,
    domainName: state.domain.name,
    totalDefinitions: state.definitions.length,
    targetedDefinitions: state.latestDefinitions.length,
    coveredDefinitions: state.resolvedSignatureRuns.coveredDefinitionIds.size,
    definitionsWithAnalysis: analyzedDefinitionIds.size,
    missingDefinitions,
    models,
  };
}

async function writeSnapshot(params: {
  client: SnapshotClient;
  domainId: string;
  configSignature: string;
  inputHash: string;
  output: DomainAnalysisSnapshotOutput;
}) {
  const current = await getCurrentSnapshot(params.client, params.domainId, params.configSignature);
  if (current != null && current.inputHash === params.inputHash) {
    return current;
  }

  await params.client.assumptionAnalysisSnapshot.updateMany({
    where: {
      assumptionKey: buildAssumptionKey(params.domainId),
      analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
      configSignature: params.configSignature,
      status: 'CURRENT',
      deletedAt: null,
    },
    data: {
      status: 'SUPERSEDED',
    },
  });

  return params.client.assumptionAnalysisSnapshot.create({
    data: {
      assumptionKey: buildAssumptionKey(params.domainId),
      analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
      inputHash: params.inputHash,
      codeVersion: DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION,
      configSignature: params.configSignature,
      config: {
        domainId: params.domainId,
        signature: params.configSignature,
      },
      output: params.output,
      status: 'CURRENT',
    },
  });
}

function buildDomainAnalysisResultFromSnapshot(params: {
  snapshot: DomainAnalysisSnapshotOutput;
  activeModels: Array<{ modelId: string; displayName: string }>;
  scoreMethod: DomainAnalysisScoreMethod;
  generatedAt: Date;
  cacheStatus: DomainAnalysisCacheStatus;
}): DomainAnalysisResult {
  const activeModelLabelById = new Map(params.activeModels.map((model) => [model.modelId, model.displayName]));

  const modelsSortedScores: Array<{ model: string; sortedScores: number[] }> = [];
  const modelsBase = params.snapshot.models.map((model) => {
    const pairwiseWins = new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>(
      Object.entries(model.pairwiseWins).map(([winner, opponents]) => [
        winner as DomainAnalysisValueKey,
        new Map(Object.entries(opponents).map(([loser, count]) => [loser as DomainAnalysisValueKey, count])),
      ]),
    );
    const btScores = params.scoreMethod === 'FULL_BT'
      ? computeFullBTScores(DOMAIN_ANALYSIS_VALUE_KEYS, pairwiseWins)
      : null;
    const values = DOMAIN_ANALYSIS_VALUE_KEYS.map((valueKey) => {
      const counts = model.counts[valueKey] ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
      const wins = counts.prioritized;
      const losses = counts.deprioritized;
      const score = params.scoreMethod === 'FULL_BT'
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

    const sortedScores = [...values.map((value) => value.score)].sort((left, right) => right - left);
    modelsSortedScores.push({ model: model.model, sortedScores });
    return {
      model: model.model,
      label: activeModelLabelById.get(model.model) ?? model.model,
      values,
    };
  });

  const { shapes, benchmarks } = computeRankingShapes(modelsSortedScores);
  const clusterModels = modelsBase.map((model) => ({
    model: model.model,
    label: model.label,
    scores: Object.fromEntries(model.values.map((value) => [value.valueKey, value.score])),
  }));
  const clusterAnalysis = computeClusterAnalysis(clusterModels);

  const models: DomainAnalysisModel[] = modelsBase.map((model) => ({
    ...model,
    rankingShape: shapes.get(model.model) ?? {
      topStructure: 'even_spread',
      bottomStructure: 'no_hard_no',
      topGap: 0,
      bottomGap: 0,
      spread: 0,
      steepness: 0,
      dominanceZScore: null,
    },
  }));

  const unavailableModels = params.activeModels
    .filter((model) => !params.snapshot.models.some((entry) => entry.model === model.modelId))
    .map((model) => ({
      model: model.modelId,
      label: model.displayName,
      reason: 'No aggregate analysis data available for selected domain.',
    }));

  const missingDefinitions = params.snapshot.missingDefinitions.map((missing) => ({
    ...missing,
    missingModelIds: params.activeModels.map((model) => model.modelId),
    missingModelLabels: params.activeModels.map((model) => model.displayName ?? model.modelId),
  }));

  return {
    domainId: params.snapshot.domainId,
    domainName: params.snapshot.domainName,
    totalDefinitions: params.snapshot.totalDefinitions,
    targetedDefinitions: params.snapshot.targetedDefinitions,
    coveredDefinitions: params.snapshot.coveredDefinitions,
    missingDefinitionIds: missingDefinitions.map((missing) => missing.definitionId),
    missingDefinitions,
    definitionsWithAnalysis: params.snapshot.definitionsWithAnalysis,
    models,
    unavailableModels,
    generatedAt: params.generatedAt,
    rankingShapeBenchmarks: benchmarks,
    clusterAnalysis,
    cacheStatus: params.cacheStatus,
  };
}

export async function queueDomainAnalysisRefresh(params: {
  domainId: string;
  signature: string | null;
  reason: string;
}): Promise<boolean> {
  if (!isBossRunning()) {
    log.warn({ domainId: params.domainId, signature: params.signature, reason: params.reason }, 'Domain analysis refresh skipped because queue is unavailable');
    return false;
  }

  const boss = getBoss();
  const normalizedSignature = normalizeSignature(params.signature);
  await boss.send(
    'refresh_domain_analysis_snapshot',
    {
      domainId: params.domainId,
      signature: params.signature,
      reason: params.reason,
    },
    {
      ...DEFAULT_JOB_OPTIONS.refresh_domain_analysis_snapshot,
      singletonKey: `domain-analysis:${params.domainId}:${normalizedSignature}`,
    },
  );
  return true;
}

export async function refreshDomainAnalysisSnapshot(domainId: string, requestedSignature: string | null) {
  const state = await resolvePreparedState(domainId, requestedSignature);
  const output = await buildSnapshotOutput(state);
  const snapshot = await db.$transaction((tx) => writeSnapshot({
    client: tx,
    domainId,
    configSignature: state.configSignature,
    inputHash: state.inputHash,
    output,
  }));
  return {
    snapshot,
    selectedSignature: state.selectedSignature,
    configSignature: state.configSignature,
  };
}

export async function getDomainAnalysisResult(params: {
  domainId: string;
  requestedSignature: string | null;
  scoreMethod: DomainAnalysisScoreMethod;
}): Promise<DomainAnalysisResult> {
  const state = await resolvePreparedState(params.domainId, params.requestedSignature);
  const activeModels = await db.llmModel.findMany({
    where: { status: 'ACTIVE' },
    select: { modelId: true, displayName: true },
  });

  if (state.definitions.length === 0) {
    return {
      domainId: state.domain.id,
      domainName: state.domain.name,
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
      cacheStatus: DOMAIN_ANALYSIS_CACHE_STATUS.FRESH,
    };
  }

  const currentSnapshot = await getCurrentSnapshot(db, params.domainId, state.configSignature);
  const parsedCurrent = currentSnapshot != null ? parseSnapshotOutput(currentSnapshot.output) : null;

  if (currentSnapshot != null && parsedCurrent != null && currentSnapshot.inputHash === state.inputHash) {
    return buildDomainAnalysisResultFromSnapshot({
      snapshot: parsedCurrent,
      activeModels,
      scoreMethod: params.scoreMethod,
      generatedAt: currentSnapshot.createdAt,
      cacheStatus: DOMAIN_ANALYSIS_CACHE_STATUS.FRESH,
    });
  }

  if (currentSnapshot != null && parsedCurrent != null) {
    const queued = await queueDomainAnalysisRefresh({
      domainId: params.domainId,
      signature: state.selectedSignature,
      reason: 'page-load-stale',
    });
    return buildDomainAnalysisResultFromSnapshot({
      snapshot: parsedCurrent,
      activeModels,
      scoreMethod: params.scoreMethod,
      generatedAt: currentSnapshot.createdAt,
      cacheStatus: queued ? DOMAIN_ANALYSIS_CACHE_STATUS.UPDATING : DOMAIN_ANALYSIS_CACHE_STATUS.OUT_OF_DATE,
    });
  }

  const refreshed = await refreshDomainAnalysisSnapshot(params.domainId, state.selectedSignature);
  const parsedFresh = parseSnapshotOutput(refreshed.snapshot.output);
  if (parsedFresh == null) {
    throw new ValidationError('Domain analysis snapshot could not be parsed after refresh');
  }
  return buildDomainAnalysisResultFromSnapshot({
    snapshot: parsedFresh,
    activeModels,
    scoreMethod: params.scoreMethod,
    generatedAt: refreshed.snapshot.createdAt,
    cacheStatus: DOMAIN_ANALYSIS_CACHE_STATUS.FRESH,
  });
}
