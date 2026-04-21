import { db } from '@valuerank/db';
import { createLogger, ValidationError } from '@valuerank/shared';
import { getBoss, isBossRunning } from '../../queue/boss.js';
import { DEFAULT_JOB_OPTIONS } from '../../queue/types.js';
import {
  DOMAIN_ANALYSIS_VALUE_KEYS,
  type DomainAnalysisValueKey,
} from '../../graphql/queries/domain-analysis-values.js';
import {
  computeFullBTScores,
  computeSmoothedLogOddsScore,
  type DomainAnalysisScoreMethod,
} from '../../graphql/queries/domain/shared.js';
import { computeRankingShapes } from '../../graphql/queries/domain-shape.js';
import { computeClusterAnalysis } from '../../graphql/queries/domain-clustering.js';
import type {
  DomainAnalysisModel,
  DomainAnalysisResult,
} from '../../graphql/queries/domain/types.js';
import {
  DOMAIN_ANALYSIS_CACHE_STATUS,
  DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
  type DomainAnalysisCacheStatus,
  type DomainAnalysisSnapshotOutput,
  type SnapshotClient,
} from './domain-analysis-cache-types.js';
import {
  buildAssumptionKey,
  normalizeSignature,
  parseSnapshotOutput,
  prepareDomainAnalysisState,
  buildSnapshotOutput,
  writeSnapshot,
} from './domain-analysis-snapshot-builder.js';
import type { DomainAnalysisScope } from './domain-analysis-scope.js';
import { DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE } from './domain-analysis-scope.js';

const log = createLogger('analysis:domain-cache');

async function getCurrentSnapshot(
  client: SnapshotClient,
  scope: DomainAnalysisScope,
  domainId: string,
  configSignature: string,
) {
  return client.assumptionAnalysisSnapshot.findFirst({
    where: {
      assumptionKey: buildAssumptionKey(scope, domainId),
      analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
      configSignature,
      status: 'CURRENT',
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
      reason: 'No aggregate analysis data available for selected scope.',
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
    contributionSummary: params.snapshot.contributionSummary ?? [],
    excludedDataSummary: params.snapshot.excludedDataSummary ?? [],
  };
}

export async function queueDomainAnalysisRefresh(params: {
  scope: DomainAnalysisScope;
  domainId: string;
  signature: string | null;
  reason: string;
}): Promise<boolean> {
  if (!isBossRunning()) {
    log.warn({ scope: params.scope, domainId: params.domainId, signature: params.signature, reason: params.reason }, 'Domain analysis refresh skipped because queue is unavailable');
    return false;
  }

  const boss = getBoss();
  const normalizedSignature = normalizeSignature(params.signature);
  await boss.send(
    'refresh_domain_analysis_snapshot',
    {
      scope: params.scope,
      domainId: params.domainId,
      signature: params.signature,
      reason: params.reason,
    },
    {
      ...DEFAULT_JOB_OPTIONS.refresh_domain_analysis_snapshot,
      singletonKey: `domain-analysis:${params.scope}:${params.scope === 'ALL_DOMAINS' ? DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE : params.domainId}:${normalizedSignature}`,
    },
  );
  return true;
}

export async function refreshDomainAnalysisSnapshot(params: {
  scope: DomainAnalysisScope;
  domainId: string;
  requestedSignature: string | null;
}) {
  const state = await prepareDomainAnalysisState({
    scope: params.scope,
    domainId: params.domainId,
    requestedSignature: params.requestedSignature,
  });
  const output = await buildSnapshotOutput(state);
  const snapshot = await db.$transaction((tx) => writeSnapshot({
    client: tx,
    scope: state.scope,
    domainId: state.domain.id,
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
  scope: DomainAnalysisScope;
  domainId: string;
  requestedSignature: string | null;
  scoreMethod: DomainAnalysisScoreMethod;
}): Promise<DomainAnalysisResult> {
  const state = await prepareDomainAnalysisState({
    scope: params.scope,
    domainId: params.domainId,
    requestedSignature: params.requestedSignature,
  });
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
        reason: 'No analyzed vignettes found in this scope.',
      })),
      generatedAt: new Date(),
      rankingShapeBenchmarks: { domainMeanTopGap: 0, domainStdTopGap: null, medianSpread: 0 },
      clusterAnalysis: { clusters: [], faultLinesByPair: {}, defaultPair: null, skipped: true, skipReason: 'No vignettes found in this scope.' },
      cacheStatus: DOMAIN_ANALYSIS_CACHE_STATUS.FRESH,
      contributionSummary: [],
      excludedDataSummary: [],
    };
  }

  const currentSnapshot = await getCurrentSnapshot(db, state.scope, state.domain.id, state.configSignature);
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
      scope: state.scope,
      domainId: state.domain.id,
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

  const refreshed = await refreshDomainAnalysisSnapshot({
    scope: state.scope,
    domainId: state.domain.id,
    requestedSignature: state.selectedSignature,
  });
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
