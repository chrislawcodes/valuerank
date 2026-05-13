import { db } from '@valuerank/db';
import { createLogger, ValidationError } from '@valuerank/shared';
import { getBoss, isBossRunning } from '../../queue/boss.js';
import { DEFAULT_JOB_OPTIONS } from '../../queue/types.js';
import {
  DOMAIN_ANALYSIS_VALUE_KEYS,
} from '../../graphql/queries/domain-analysis-values.js';
import {
  computeSmoothedLogOddsScore,
} from '../../graphql/queries/domain/shared.js';
import { computeRankingShapes } from '../../graphql/queries/domain-shape.js';
import { computeClusterAnalysis, computeAllClusterAnalyses } from '../../graphql/queries/domain-clustering.js';
import type {
  DomainAnalysisModel,
  DomainAnalysisResult,
  PairwiseWinRateModel,
} from '../../graphql/queries/domain/types.js';
import { SCHWARTZ_CIRCULAR_ORDER } from '@valuerank/shared/schwartz';
import {
  DOMAIN_ANALYSIS_CACHE_STATUS,
  DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION,
  DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
  type DomainAnalysisCacheStatus,
  type DomainAnalysisBuildProgress,
  type DomainAnalysisSnapshotOutput,
  type DomainAnalysisSnapshotModel,
  type SnapshotClient,
} from './domain-analysis-cache-types.js';
import {
  buildAssumptionKey,
  normalizeSignature,
  parseSnapshotOutput,
  prepareDomainAnalysisState,
  buildSnapshotOutput,
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

function extractWinRates(snapshotModel: DomainAnalysisSnapshotModel, valueKeys: readonly string[]): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const vk of valueKeys) {
    if (snapshotModel.valueWinRates != null && snapshotModel.valueWinRates[vk] != null) {
      // valueWinRates is stored on a 0–100 scale; normalize to [0, 1]
      result[vk] = (snapshotModel.valueWinRates[vk] ?? 0) / 100;
    } else {
      const counts = snapshotModel.counts[vk];
      if (counts == null) { result[vk] = null; continue; }
      const total = counts.prioritized + counts.deprioritized + counts.neutral;
      result[vk] = total > 0 ? counts.prioritized / total : null;
    }
  }
  return result;
}

function buildPairwiseWinRateModel(
  pairwiseWins: Record<string, Record<string, number>>,
  pairwiseNeutrals?: Record<string, Record<string, number>>,
): PairwiseWinRateModel {
  const order = [...SCHWARTZ_CIRCULAR_ORDER];
  const n = order.length;
  const winRateMatrix: Array<Array<number | null>> = [];
  const winRateExcNeutralMatrix: Array<Array<number | null>> = [];
  const trialCountMatrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const winRateRow: Array<number | null> = [];
    const excNeutralWinRateRow: Array<number | null> = [];
    const trialRow: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        winRateRow.push(null);
        excNeutralWinRateRow.push(null);
        trialRow.push(0);
        continue;
      }
      const keyI = order[i] as string;
      const keyJ = order[j] as string;
      const winsIJ = pairwiseWins[keyI]?.[keyJ] ?? 0;
      const winsJI = pairwiseWins[keyJ]?.[keyI] ?? 0;
      // Neutrals are stored from the valueA side only: keyI vs keyJ → neutrals[keyI][keyJ] when keyI < keyJ alphabetically is NOT guaranteed,
      // so check both directions and take whichever has data.
      const neutralsIJ = pairwiseNeutrals != null
        ? (pairwiseNeutrals[keyI]?.[keyJ] ?? pairwiseNeutrals[keyJ]?.[keyI] ?? 0)
        : 0;
      const total = winsIJ + winsJI + neutralsIJ;
      winRateRow.push(total > 0 ? winsIJ / total : null);
      const excNeutralTotal = winsIJ + winsJI;
      excNeutralWinRateRow.push(excNeutralTotal > 0 ? winsIJ / excNeutralTotal : null);
      trialRow.push(total);
    }
    winRateMatrix.push(winRateRow);
    winRateExcNeutralMatrix.push(excNeutralWinRateRow);
    trialCountMatrix.push(trialRow);
  }
  return { valueOrder: order, winRateMatrix, winRateExcNeutralMatrix, trialCountMatrix };
}

// A `buildProgress` snapshot whose `updatedAt` is older than this is treated
// as a dead rebuild (e.g., the API process restarted mid-rebuild). Recent
// progress means a rebuild is actively running and we should NOT supersede it
// with a new synchronous rebuild — that creates a thundering-herd loop.
const DOMAIN_ANALYSIS_BUILD_PROGRESS_FRESH_MS = 5 * 60 * 1000;

function parseBuildProgress(raw: unknown): DomainAnalysisBuildProgress | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const candidate = raw as { buildProgress?: unknown };
  const progress = candidate.buildProgress;
  if (progress == null || typeof progress !== 'object' || Array.isArray(progress)) {
    return null;
  }

  const progressCandidate = progress as Partial<DomainAnalysisBuildProgress>;
  if (
    typeof progressCandidate.completedRuns !== 'number'
    || typeof progressCandidate.totalRuns !== 'number'
    || typeof progressCandidate.updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    completedRuns: progressCandidate.completedRuns,
    totalRuns: progressCandidate.totalRuns,
    currentRunId: typeof progressCandidate.currentRunId === 'string' ? progressCandidate.currentRunId : null,
    updatedAt: progressCandidate.updatedAt,
  };
}

function buildEmptyDomainAnalysisResult(params: {
  domainId: string;
  domainName: string;
  activeModels: Array<{ modelId: string; displayName: string; isDefault: boolean }>;
  generatedAt: Date;
  cacheStatus: DomainAnalysisCacheStatus;
  unavailableReason: string;
  refreshProgress?: { completedRuns: number; totalRuns: number } | null;
}): DomainAnalysisResult {
  return {
    domainId: params.domainId,
    domainName: params.domainName,
    totalDefinitions: 0,
    targetedDefinitions: 0,
    coveredDefinitions: 0,
    missingDefinitionIds: [],
    missingDefinitions: [],
    definitionsWithAnalysis: 0,
    models: [],
    unavailableModels: params.activeModels.map((model) => ({
      model: model.modelId,
      label: model.displayName,
      reason: params.unavailableReason,
    })),
    generatedAt: params.generatedAt,
    rankingShapeBenchmarks: { domainMeanTopGap: 0, domainStdTopGap: null, medianSpread: 0 },
    clusterAnalysis: { clusters: [], faultLinesByPair: {}, defaultPair: null, skipped: true, skipReason: params.unavailableReason },
    clusterAnalysisByMethod: {},
    cacheStatus: params.cacheStatus,
    contributionSummary: [],
    excludedDataSummary: [],
    refreshProgress: params.refreshProgress ?? null,
  };
}

function buildDomainAnalysisResultFromSnapshot(params: {
  snapshot: DomainAnalysisSnapshotOutput;
  activeModels: Array<{ modelId: string; displayName: string; isDefault: boolean }>;
  generatedAt: Date;
  cacheStatus: DomainAnalysisCacheStatus;
}): DomainAnalysisResult {
  const activeModelLabelById = new Map(params.activeModels.map((model) => [model.modelId, model.displayName]));

  const modelsSortedScores: Array<{ model: string; sortedScores: number[] }> = [];
  const modelsBase = params.snapshot.models.map((model) => {
    const values = DOMAIN_ANALYSIS_VALUE_KEYS.map((valueKey) => {
      const counts = model.counts[valueKey] ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
      const wins = counts.prioritized;
      const losses = counts.deprioritized;
      const excNeutralDenom = wins + losses;
      return {
        valueKey,
        score: computeSmoothedLogOddsScore(wins, losses),
        prioritized: counts.prioritized,
        deprioritized: counts.deprioritized,
        neutral: counts.neutral,
        totalComparisons: wins + losses + counts.neutral,
        winRateExcNeutral: excNeutralDenom > 0 ? (wins / excNeutralDenom) * 100 : null,
      };
    });

    const sortedScores = [...values.map((value) => value.score)].sort((left, right) => right - left);
    modelsSortedScores.push({ model: model.model, sortedScores });
    return {
      model: model.model,
      label: activeModelLabelById.get(model.model) ?? model.model,
      values,
      pairwiseWinRateModel: buildPairwiseWinRateModel(model.pairwiseWins, model.pairwiseNeutrals),
    };
  });

  const { shapes, benchmarks } = computeRankingShapes(modelsSortedScores);
  const defaultModelIds = new Set(params.activeModels.filter((m) => m.isDefault).map((m) => m.modelId));

  // Build cluster model inputs with both log-odds scores and domain-local win rates
  const snapshotModelByModelId = new Map(params.snapshot.models.map((m) => [m.model, m]));
  const clusterModels = modelsBase
    .filter((model) => defaultModelIds.has(model.model))
    .map((model) => {
      const snapshotModel = snapshotModelByModelId.get(model.model);
      return {
        model: model.model,
        label: model.label,
        scores: Object.fromEntries(model.values.map((value) => [value.valueKey, value.score])),
        winRates: snapshotModel != null ? extractWinRates(snapshotModel, DOMAIN_ANALYSIS_VALUE_KEYS) : undefined,
      };
    });

  const clusterAnalysis = computeClusterAnalysis(clusterModels);
  const clusterAnalysisByMethod = computeAllClusterAnalyses(clusterModels);

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
    clusterAnalysisByMethod,
    cacheStatus: params.cacheStatus,
    contributionSummary: params.snapshot.contributionSummary ?? [],
    excludedDataSummary: params.snapshot.excludedDataSummary ?? [],
    refreshProgress: null,
  };
}

export async function queueDomainAnalysisRefresh(params: {
  scope: DomainAnalysisScope;
  domainId: string;
  domainIds?: string[];
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
      domainIds: params.domainIds,
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
  domainIds?: string[];
  requestedSignature: string | null;
}) {
  const refreshStartedAt = Date.now();
  log.info({ scope: params.scope, domainId: params.domainId, requestedSignature: params.requestedSignature }, 'refreshDomainAnalysisSnapshot: start');

  const prepareStartedAt = Date.now();
  const state = await prepareDomainAnalysisState({
    scope: params.scope,
    domainId: params.domainId,
    domainIds: params.domainIds,
    requestedSignature: params.requestedSignature,
  });
  const prepareDurationMs = Date.now() - prepareStartedAt;
  log.info({
    scope: params.scope,
    domainId: params.domainId,
    prepareDurationMs,
    configSignature: state.configSignature,
    inputHash: state.inputHash,
    totalSourceRuns: state.resolvedSignatureRuns.filteredSourceRunIds.length,
  }, 'refreshDomainAnalysisSnapshot: prepare complete');

  const totalRuns = state.resolvedSignatureRuns.filteredSourceRunIds.length;
  const supersedeStartedAt = Date.now();
  const supersedeResult = await db.assumptionAnalysisSnapshot.updateMany({
    where: {
      assumptionKey: buildAssumptionKey(state.scope, state.domain.id),
      analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
      status: 'CURRENT',
      deletedAt: null,
      OR: [
        { configSignature: state.configSignature },
        { inputHash: state.inputHash },
      ],
    },
    data: {
      status: 'SUPERSEDED',
    },
  });
  log.info({
    scope: params.scope,
    domainId: params.domainId,
    durationMs: Date.now() - supersedeStartedAt,
    supersededCount: supersedeResult.count,
  }, 'refreshDomainAnalysisSnapshot: supersede done');

  const progressSnapshot = await db.assumptionAnalysisSnapshot.create({
    data: {
      assumptionKey: buildAssumptionKey(state.scope, state.domain.id),
      analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
      inputHash: state.inputHash,
      codeVersion: DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION,
      configSignature: state.configSignature,
      config: {
        scope: state.scope,
        domainId: state.domain.id,
        domainIds: state.domainIds,
        signature: state.configSignature,
      },
      output: {
        buildProgress: {
          completedRuns: 0,
          totalRuns,
          currentRunId: null,
          updatedAt: new Date().toISOString(),
        } satisfies DomainAnalysisBuildProgress,
      },
      status: 'CURRENT',
    },
  });
  log.info({
    scope: params.scope,
    domainId: params.domainId,
    progressSnapshotId: progressSnapshot.id,
  }, 'refreshDomainAnalysisSnapshot: progress snapshot created');

  try {
    const buildStartedAt = Date.now();
    const { output, excNeutralValueWinRatesByModel } = await buildSnapshotOutput(state, {
      onProgress: async (buildProgress) => {
        await db.assumptionAnalysisSnapshot.update({
          where: { id: progressSnapshot.id },
          data: {
            output: {
              buildProgress,
            },
          },
        });
      },
    });
    const buildDurationMs = Date.now() - buildStartedAt;
    log.info({
      scope: params.scope,
      domainId: params.domainId,
      progressSnapshotId: progressSnapshot.id,
      buildDurationMs,
    }, 'refreshDomainAnalysisSnapshot: buildSnapshotOutput complete');

    // Check if we got superseded during build (thundering herd detection)
    const preWriteCheck = await db.assumptionAnalysisSnapshot.findUnique({
      where: { id: progressSnapshot.id },
      select: { status: true },
    });
    if (preWriteCheck?.status !== 'CURRENT') {
      log.warn({
        scope: params.scope,
        domainId: params.domainId,
        progressSnapshotId: progressSnapshot.id,
        actualStatus: preWriteCheck?.status,
      }, 'refreshDomainAnalysisSnapshot: progress snapshot was superseded during build (thundering herd)');
    }

    const snapshot = await db.assumptionAnalysisSnapshot.update({
      where: { id: progressSnapshot.id },
      data: {
        output,
      },
    });

    // Phase 2: write exc-neutral rates to the snapshot, conditional on it still being CURRENT.
    const mergedModels = output.models.map((m) => {
      const excNeutralRates = excNeutralValueWinRatesByModel.get(m.model);
      if (excNeutralRates == null || Object.keys(excNeutralRates).length === 0) return m;
      return { ...m, valueWinRatesExcNeutral: excNeutralRates };
    });
    const mergedOutput = { ...output, models: mergedModels };
    const phase2Result = await db.assumptionAnalysisSnapshot.updateMany({
      where: { id: progressSnapshot.id, status: 'CURRENT' },
      data: { output: mergedOutput },
    });
    if (phase2Result.count === 0) {
      log.warn({
        scope: params.scope,
        domainId: params.domainId,
        snapshotId: progressSnapshot.id,
        totalRefreshDurationMs: Date.now() - refreshStartedAt,
      }, 'Phase 2 exc-neutral write skipped — snapshot superseded');
    } else {
      log.info({
        scope: params.scope,
        domainId: params.domainId,
        snapshotId: progressSnapshot.id,
        totalRefreshDurationMs: Date.now() - refreshStartedAt,
      }, 'refreshDomainAnalysisSnapshot: phase 2 write succeeded');
    }
    const finalSnapshot = phase2Result.count > 0 ? { ...snapshot, output: mergedOutput } : snapshot;

    return {
      snapshot: finalSnapshot,
      selectedSignature: state.selectedSignature,
      configSignature: state.configSignature,
    };
  } catch (error) {
    await db.assumptionAnalysisSnapshot.update({
      where: { id: progressSnapshot.id },
      data: {
        status: 'SUPERSEDED',
      },
    });
    throw error;
  }
}

export async function getDomainAnalysisResult(params: {
  scope: DomainAnalysisScope;
  domainId: string;
  domainIds?: string[];
  requestedSignature: string | null;
}): Promise<DomainAnalysisResult> {
  const state = await prepareDomainAnalysisState({
    scope: params.scope,
    domainId: params.domainId,
    domainIds: params.domainIds,
    requestedSignature: params.requestedSignature,
  });
  const activeModels = await db.llmModel.findMany({
    where: { status: 'ACTIVE' },
    select: { modelId: true, displayName: true, isDefault: true },
  });

  if (state.definitions.length === 0) {
    return buildEmptyDomainAnalysisResult({
      domainId: state.domain.id,
      domainName: state.domain.name,
      activeModels,
      generatedAt: new Date(),
      cacheStatus: DOMAIN_ANALYSIS_CACHE_STATUS.FRESH,
      unavailableReason: 'No analyzed vignettes found in this scope.',
    });
  }

  const currentSnapshot = await getCurrentSnapshot(db, state.scope, state.domain.id, state.configSignature);
  const parsedCurrent = currentSnapshot != null ? parseSnapshotOutput(currentSnapshot.output) : null;

  if (currentSnapshot != null && parsedCurrent != null && currentSnapshot.inputHash === state.inputHash) {
    return buildDomainAnalysisResultFromSnapshot({
      snapshot: parsedCurrent,
      activeModels,
      generatedAt: currentSnapshot.createdAt,
      cacheStatus: DOMAIN_ANALYSIS_CACHE_STATUS.FRESH,
    });
  }

  if (currentSnapshot != null && parsedCurrent != null) {
    const totalRuns = state.resolvedSignatureRuns.filteredSourceRunIds.length;
    const queued = await queueDomainAnalysisRefresh({
      scope: state.scope,
      domainId: state.domain.id,
      domainIds: state.domainIds,
      signature: state.selectedSignature,
      reason: 'page-load-stale',
    });
    const result = buildDomainAnalysisResultFromSnapshot({
      snapshot: parsedCurrent,
      activeModels,
      generatedAt: currentSnapshot.createdAt,
      cacheStatus: queued ? DOMAIN_ANALYSIS_CACHE_STATUS.UPDATING : DOMAIN_ANALYSIS_CACHE_STATUS.OUT_OF_DATE,
    });
    if (queued) {
      result.refreshProgress = { completedRuns: 0, totalRuns };
    }
    return result;
  }

  // A CURRENT snapshot may exist but only contain `buildProgress` — i.e., a
  // prior request kicked off a synchronous rebuild and that rebuild is still
  // running (or recently died). Falling through to refreshDomainAnalysisSnapshot
  // here would supersede the in-progress snapshot and start a NEW rebuild,
  // creating a thundering-herd loop where every page load stomps on the
  // previous rebuild and never finishes. Instead: if buildProgress is recent
  // (last DOMAIN_ANALYSIS_BUILD_PROGRESS_FRESH_MS), return UPDATING and let
  // the existing rebuild finish. Only fall through to refresh if the prior
  // rebuild has gone stale (likely died from a process restart).
  if (currentSnapshot != null) {
    const buildProgress = parseBuildProgress(currentSnapshot.output);
    if (buildProgress != null) {
      const progressAgeMs = Date.now() - new Date(buildProgress.updatedAt).getTime();
      if (Number.isFinite(progressAgeMs) && progressAgeMs < DOMAIN_ANALYSIS_BUILD_PROGRESS_FRESH_MS) {
        return buildEmptyDomainAnalysisResult({
          domainId: state.domain.id,
          domainName: state.domain.name,
          activeModels,
          generatedAt: currentSnapshot.createdAt,
          cacheStatus: DOMAIN_ANALYSIS_CACHE_STATUS.UPDATING,
          unavailableReason: `Domain analysis is rebuilding (${buildProgress.completedRuns}/${buildProgress.totalRuns} runs processed). Refresh in a moment.`,
          refreshProgress: { completedRuns: buildProgress.completedRuns, totalRuns: buildProgress.totalRuns },
        });
      }
    }
  }

  const refreshed = await refreshDomainAnalysisSnapshot({
    scope: state.scope,
    domainId: state.domain.id,
    domainIds: state.domainIds,
    requestedSignature: state.selectedSignature,
  });
  const parsedFresh = parseSnapshotOutput(refreshed.snapshot.output);
  if (parsedFresh == null) {
    throw new ValidationError('Domain analysis snapshot could not be parsed after refresh');
  }
  return buildDomainAnalysisResultFromSnapshot({
    snapshot: parsedFresh,
    activeModels,
    generatedAt: refreshed.snapshot.createdAt,
    cacheStatus: DOMAIN_ANALYSIS_CACHE_STATUS.FRESH,
  });
}

/**
 * On startup, queue background refreshes for any domain whose analysis snapshot is stale.
 * Runs non-blocking after the queue orchestrator is ready. Skips domains with no snapshot
 * (built on first page load) and domains whose rebuild is already in progress.
 */
export async function queueStaleAnalysesOnStartup(): Promise<void> {
  const domains = await db.domain.findMany({
    select: { id: true },
  });

  let queued = 0;
  for (const domain of domains) {
    try {
      const state = await prepareDomainAnalysisState({
        scope: 'DOMAIN',
        domainId: domain.id,
        requestedSignature: null,
      });

      if (state.definitions.length === 0) continue;

      const currentSnapshot = await getCurrentSnapshot(db, state.scope, domain.id, state.configSignature);
      if (currentSnapshot == null) continue;

      const parsedCurrent = parseSnapshotOutput(currentSnapshot.output);
      if (parsedCurrent == null) continue; // rebuild already in progress

      if (currentSnapshot.inputHash === state.inputHash) continue; // already fresh

      const didQueue = await queueDomainAnalysisRefresh({
        scope: state.scope,
        domainId: domain.id,
        signature: state.selectedSignature,
        reason: 'startup-stale',
      });
      if (didQueue) queued += 1;
    } catch (err) {
      log.warn({ err, domainId: domain.id }, 'startup stale check failed for domain');
    }
  }

  log.info({ queued, total: domains.length }, 'Startup domain analysis stale check complete');
}

/**
 * Read the pre-computed per-(definitionId::modelId::canonicalA::canonicalB::ownLevel::opponentLevel)
 * cell-level outcomes from the current domain-analysis snapshot. Returns null if no CURRENT
 * snapshot exists or if the snapshot pre-dates v1.12.0 (i.e. does not include `cellLevelOutcomes`).
 *
 * Used by the modelAgreementOnTradeoffs resolver to compute Cohen's kappa, percent
 * agreement, and divergence metrics with equal-weight aggregation.
 */
export async function readCellLevelOutcomesFromSnapshot(
  scope: DomainAnalysisScope,
  domainId: string,
  configSignature: string,
): Promise<Record<string, { aChoices: number; bChoices: number; neutrals: number }> | null> {
  const snapshot = await getCurrentSnapshot(db, scope, domainId, configSignature);
  if (snapshot == null) return null;
  const parsed = parseSnapshotOutput(snapshot.output);
  return parsed?.cellLevelOutcomes ?? null;
}

export async function readModelAgreementSnapshotStateFromSnapshot(
  scope: DomainAnalysisScope,
  domainId: string,
  configSignature: string,
): Promise<{
  cellLevelOutcomes: Record<string, { aChoices: number; bChoices: number; neutrals: number }> | null;
  buildProgress: DomainAnalysisBuildProgress | null;
  inputHash: string | null;
} | null> {
  const snapshot = await getCurrentSnapshot(db, scope, domainId, configSignature);
  if (snapshot == null) {
    return null;
  }

  const parsed = parseSnapshotOutput(snapshot.output);
  if (parsed?.cellLevelOutcomes != null) {
    return {
      cellLevelOutcomes: parsed.cellLevelOutcomes,
      buildProgress: null,
      inputHash: snapshot.inputHash,
    };
  }

  return {
    cellLevelOutcomes: null,
    buildProgress: parseBuildProgress(snapshot.output),
    inputHash: snapshot.inputHash,
  };
}
