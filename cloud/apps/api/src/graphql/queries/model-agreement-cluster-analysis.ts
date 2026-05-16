import { ValidationError } from '@valuerank/shared';
import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { getModelsFromDatabase } from '../../config/models.js';
import { KappaClusterPayloadRef } from './domain/types.js';
import {
  computeKappaClusterAnalysis,
  type ClusteringMethod,
  type ClusterModelInput,
} from './domain-clustering.js';
import type { KappaClusterPayload, KappaPair } from './domain/types.js';
import {
  buildPositionCells,
  buildSelectedModels,
  collectComparableCells,
  normalizeModelIds,
  summarizePairCells,
} from '../../services/model-agreement/aggregation.js';
import { resolveDomainAnalysisScopeDefinitions } from '../../services/analysis/domain-analysis-scope-loader.js';
import { resolveSignatureRuns } from './domain/shared.js';
import {
  getDomainAnalysisResult,
  queueDomainAnalysisRefresh,
} from '../../services/analysis/domain-analysis-cache.js';
import { readModelAgreementSnapshotStateFromSnapshot } from '../../services/analysis/domain-analysis-snapshot-readers.js';
import { getModelAgreementSnapshot } from '../../services/analysis/model-agreement-snapshot/snapshot-cache.js';
import type { ModelAgreementSnapshotPayload } from '../../services/analysis/model-agreement-snapshot/snapshot-types.js';
import { getBoss } from '../../queue/boss.js';
import {
  normalizeDomainIds,
  resolveDomainAnalysisSelection,
  type DomainAnalysisScope,
} from '../../services/analysis/domain-analysis-scope.js';
import type { Context } from '../context.js';

const REFRESH_REASON = 'model-agreement-cluster-analysis-page-load-missing';

type KappaSnapshotFreshness = Pick<KappaClusterPayload, 'snapshotComputedAt' | 'snapshotSource'>;

const EMPTY_FRESHNESS: KappaSnapshotFreshness = {
  snapshotComputedAt: null,
  snapshotSource: null,
};

function emptyPayload(reason: string, freshness: KappaSnapshotFreshness = EMPTY_FRESHNESS): KappaClusterPayload {
  return {
    clusterAnalysis: {
      clusters: [],
      faultLinesByPair: {},
      defaultPair: null,
      skipped: true,
      skipReason: reason,
    },
    kappaPairs: [],
    ...freshness,
  };
}

function sameModelSelection(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

async function resolveScope(params: {
  scope: DomainAnalysisScope;
  domainId: string;
  domainIds: string[];
  signature: string;
}): Promise<void> {
  const scopeData = await resolveDomainAnalysisScopeDefinitions({
    scope: params.scope,
    domainId: params.domainId,
    domainIds: params.domainIds,
  });
  const resolvedSignatureRuns = await resolveSignatureRuns(
    scopeData.latestDefinitionIds,
    params.signature,
    scopeData.domain.defaultModelIds,
  );
  if (resolvedSignatureRuns.filteredSourceRunIds.length === 0) {
    throw new ValidationError('Kappa clustering could not be computed because no completed runs were found for the selected scope.');
  }
}

async function readAgreementSnapshot(params: {
  scope: DomainAnalysisScope;
  domainId: string;
  domainIds: string[];
  signature: string;
  ctx: Context;
}): Promise<Awaited<ReturnType<typeof readModelAgreementSnapshotStateFromSnapshot>>> {
  const snapshotState = await readModelAgreementSnapshotStateFromSnapshot(
    params.scope,
    params.domainId,
    params.signature,
  );
  if (snapshotState != null) {
    return snapshotState;
  }

  await queueDomainAnalysisRefresh({
    scope: params.scope,
    domainId: params.domainId,
    domainIds: params.domainIds,
    signature: params.signature,
    reason: REFRESH_REASON,
  });
  params.ctx.log.info(
    { scope: params.scope, domainId: params.domainId, domainIds: params.domainIds, signature: params.signature },
    'Kappa cluster analysis snapshot not ready — rebuild queued, returning pending',
  );
  return null;
}

async function buildKappaMatrix(params: {
  positionCells: ReturnType<typeof buildPositionCells>['positionCells'];
  modelIds: ReadonlyArray<string>;
}): Promise<Array<Array<number | null>>> {
  const n = params.modelIds.length;
  const matrix: Array<Array<number | null>> = Array.from({ length: n }, () => new Array<number | null>(n).fill(null));
  for (let i = 0; i < n; i += 1) {
    matrix[i]![i] = 1;
  }
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const modelAId = params.modelIds[i]!;
      const modelBId = params.modelIds[j]!;
      const { cells } = collectComparableCells({
        positionCells: params.positionCells,
        modelAId,
        modelBId,
      });
      const kappa = summarizePairCells(cells).cohensKappa;
      matrix[i]![j] = kappa;
      matrix[j]![i] = kappa;
    }
  }
  return matrix;
}

export async function resolveModelAgreementClusterAnalysis(
  _root: unknown,
  args: {
    modelIds: ReadonlyArray<string | number>;
    domainId?: string | number | null | undefined;
    domainIds?: ReadonlyArray<string | number> | null;
    scope: string;
    signature: string;
    method: string;
  },
  ctx: Context,
): Promise<KappaClusterPayload> {
  const scopeValue = String(args.scope);
  if (scopeValue !== 'DOMAIN' && scopeValue !== 'ALL_DOMAINS' && scopeValue !== 'DOMAIN_SET') {
    throw new ValidationError(`Unsupported scope: ${scopeValue}`);
  }
  const domainIds = normalizeDomainIds((args.domainIds ?? []).map(String));
  const domainId = args.domainId != null ? String(args.domainId).trim() : null;
  const selection = resolveDomainAnalysisSelection({
    scope: scopeValue,
    domainId,
    domainIds,
  });
  if (scopeValue === 'DOMAIN' && selection.scope !== 'DOMAIN') {
    throw new ValidationError('domainId is required when scope is DOMAIN');
  }
  const scope: DomainAnalysisScope = selection.scope;

  const signature = String(args.signature).trim();
  if (signature.length === 0) {
    throw new ValidationError('signature is required');
  }

  const methodValue = String(args.method);
  if (methodValue !== 'upgma' && methodValue !== 'ward') {
    throw new ValidationError(`Unsupported clustering method: ${methodValue}`);
  }
  const method: ClusteringMethod = methodValue;

  const selectedModelIds = normalizeModelIds(args.modelIds.map(String));
  if (selectedModelIds.length < 3) {
    return emptyPayload('Kappa clustering requires at least 3 distinct modelIds.');
  }

  const activeModels = await getModelsFromDatabase({ activeOnly: true, availableOnly: false });
  const labelByModelId = new Map(activeModels.map((model) => [model.modelId, model.displayName] as const));
  const selectedModels = buildSelectedModels(selectedModelIds, labelByModelId);
  const selectedModelIdSet = new Set(selectedModels.map((model) => model.modelId));

  // ----- Cache fast-path -----------------------------------------------------
  // Reuse the model-agreement snapshot cache from PR #1100 for canonical
  // selections. The clustering math is cheap once we have the kappa matrix;
  // the live path's expensive step is computing the matrix. If the cache has
  // it, skip straight to clustering.
  const defaultModelIds = normalizeModelIds(activeModels.filter((model) => model.isDefault).map((model) => model.modelId));
  const isCanonical = sameModelSelection(selectedModelIds, defaultModelIds);

  if (isCanonical) {
    const snapshotQueue = {
      send: async (
        name: string,
        data: Parameters<ReturnType<typeof getBoss>['send']>[1],
        options?: Parameters<ReturnType<typeof getBoss>['send']>[2],
      ) => getBoss().send(name, data, options),
    };
    const snapshotResult = await getModelAgreementSnapshot(
      db,
      snapshotQueue,
      {
        scope,
        domainId: selection.domainId,
        domainIds: selection.domainIds,
        signature,
        modelIds: selectedModelIds,
        isCanonical: true,
      },
    );

    if (snapshotResult != null) {
      if (snapshotResult.payload == null) {
        // BUILDING — the cache reader has already queued a refresh.
        return emptyPayload(
          'Kappa cluster analysis is rebuilding — try again in a moment.',
          { snapshotComputedAt: null, snapshotSource: 'BUILDING' },
        );
      }
      // CACHE_HIT or CACHE_HIT_STALE — build cluster analysis from the cached matrix.
      return await buildClusterAnalysisFromSnapshot({
        payload: snapshotResult.payload,
        method,
        scope,
        selection,
        signature,
        freshness: {
          snapshotComputedAt: snapshotResult.snapshotComputedAt,
          snapshotSource: snapshotResult.source,
        },
      });
    }
  }

  // ----- Live fall-through path ---------------------------------------------
  // Non-canonical selections (and any case where the canonical cache returned
  // null) run the existing live computation. Carry LIVE_NON_CANONICAL through
  // the freshness fields so the UI can suppress the "Cached as of" chip.
  const LIVE_FRESHNESS: KappaSnapshotFreshness = {
    snapshotComputedAt: null,
    snapshotSource: 'LIVE_NON_CANONICAL',
  };

  await resolveScope({
    scope,
    domainId: selection.domainId,
    domainIds: selection.domainIds,
    signature,
  });

  const snapshotState = await readAgreementSnapshot({
    scope,
    domainId: selection.domainId,
    domainIds: selection.domainIds,
    signature,
    ctx,
  });
  if (snapshotState == null) {
    return emptyPayload('Kappa cluster analysis is rebuilding — try again in a moment.', LIVE_FRESHNESS);
  }

  const cellLevelOutcomes = snapshotState.cellLevelOutcomes;
  if (cellLevelOutcomes == null) {
    return emptyPayload('Kappa cluster analysis is rebuilding — try again in a moment.', LIVE_FRESHNESS);
  }
  const { positionCells, cellsObservedByModelId } = buildPositionCells(cellLevelOutcomes, selectedModelIdSet);
  const availableModels = selectedModels.filter((model) => (cellsObservedByModelId.get(model.modelId) ?? 0) > 0);
  if (availableModels.length < 3) {
    return emptyPayload('Kappa clustering requires at least 3 models with cell-level data in the selected scope.', LIVE_FRESHNESS);
  }

  // Pull log-odds scores from the domain-analysis result so the cluster centroids
  // and fault-lines are still labeled by what each behaviorally-similar group
  // tends to value. Falls back to zeros if a model is missing from the result.
  const domainAnalysis = await getDomainAnalysisResult({
    scope,
    domainId: selection.domainId,
    domainIds: selection.domainIds,
    requestedSignature: signature,
  });
  const scoresByModelId = new Map<string, Record<string, number>>();
  for (const model of domainAnalysis.models) {
    const scoreEntries = model.values.map((entry) => [entry.valueKey, entry.score] as const);
    scoresByModelId.set(model.model, Object.fromEntries(scoreEntries));
  }
  // Discover the value-key set deterministically — every domain-analysis model
  // has the same set of values, so pull from the first model that has data.
  const sampleValueScores = scoresByModelId.values().next().value;
  if (sampleValueScores == null) {
    return emptyPayload('Kappa cluster analysis could not be computed because the domain-analysis snapshot has no model scores.', LIVE_FRESHNESS);
  }
  const valueKeys = Object.keys(sampleValueScores);
  const zeroScores: Record<string, number> = Object.fromEntries(valueKeys.map((vk) => [vk, 0]));

  const clusterInputs: ClusterModelInput[] = availableModels.map((model) => ({
    model: model.modelId,
    label: model.label,
    scores: scoresByModelId.get(model.modelId) ?? zeroScores,
  }));

  const orderedModelIds = clusterInputs.map((entry) => entry.model);
  const kappaMatrix = await buildKappaMatrix({ positionCells, modelIds: orderedModelIds });

  const clusterAnalysis = computeKappaClusterAnalysis(clusterInputs, kappaMatrix, method);

  // Build flat kappa pairs list for the frontend heatmap
  const n = orderedModelIds.length;
  const kappaPairs: KappaPair[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      kappaPairs.push({
        modelAId: orderedModelIds[i]!,
        modelBId: orderedModelIds[j]!,
        kappa: kappaMatrix[i]![j] ?? null,
      });
    }
  }

  return { clusterAnalysis, kappaPairs, ...LIVE_FRESHNESS };
}

// Build cluster analysis from a cached snapshot. Skips the per-pair kappa
// computation (which the live path runs in `buildKappaMatrix`) and instead
// pulls the already-computed pair kappas out of the snapshot payload.
async function buildClusterAnalysisFromSnapshot(params: {
  payload: ModelAgreementSnapshotPayload;
  method: ClusteringMethod;
  scope: DomainAnalysisScope;
  selection: { domainId: string; domainIds: string[] };
  signature: string;
  freshness: KappaSnapshotFreshness;
}): Promise<KappaClusterPayload> {
  const { payload, method, scope, selection, signature, freshness } = params;

  if (payload.models.length < 3) {
    return emptyPayload(
      'Kappa clustering requires at least 3 models with cell-level data in the selected scope.',
      freshness,
    );
  }

  // Pull log-odds scores from the domain-analysis result so the cluster
  // centroids and fault-lines are labeled the same way the live path labels
  // them.
  const domainAnalysis = await getDomainAnalysisResult({
    scope,
    domainId: selection.domainId,
    domainIds: selection.domainIds,
    requestedSignature: signature,
  });
  const scoresByModelId = new Map<string, Record<string, number>>();
  for (const model of domainAnalysis.models) {
    const scoreEntries = model.values.map((entry) => [entry.valueKey, entry.score] as const);
    scoresByModelId.set(model.model, Object.fromEntries(scoreEntries));
  }
  const sampleValueScores = scoresByModelId.values().next().value;
  if (sampleValueScores == null) {
    return emptyPayload(
      'Kappa cluster analysis could not be computed because the domain-analysis snapshot has no model scores.',
      freshness,
    );
  }
  const valueKeys = Object.keys(sampleValueScores);
  const zeroScores: Record<string, number> = Object.fromEntries(valueKeys.map((vk) => [vk, 0]));

  const clusterInputs: ClusterModelInput[] = payload.models.map((model) => ({
    model: model.modelId,
    label: model.label,
    scores: scoresByModelId.get(model.modelId) ?? zeroScores,
  }));

  // Build a symmetric N×N kappa matrix indexed by `orderedModelIds`, sourced
  // from the snapshot's flat pairwise list.
  const orderedModelIds = clusterInputs.map((entry) => entry.model);
  const n = orderedModelIds.length;
  const kappaByPair = new Map<string, number | null>();
  for (const row of payload.pairwiseAgreementMatrix) {
    const keyAB = `${row.modelAId} ${row.modelBId}`;
    const keyBA = `${row.modelBId} ${row.modelAId}`;
    kappaByPair.set(keyAB, row.cohensKappa);
    kappaByPair.set(keyBA, row.cohensKappa);
  }

  const kappaMatrix: Array<Array<number | null>> = Array.from({ length: n }, () => new Array<number | null>(n).fill(null));
  for (let i = 0; i < n; i += 1) {
    kappaMatrix[i]![i] = 1;
    for (let j = i + 1; j < n; j += 1) {
      const key = `${orderedModelIds[i]} ${orderedModelIds[j]}`;
      const value = kappaByPair.get(key) ?? null;
      kappaMatrix[i]![j] = value;
      kappaMatrix[j]![i] = value;
    }
  }

  const clusterAnalysis = computeKappaClusterAnalysis(clusterInputs, kappaMatrix, method);

  const kappaPairs: KappaPair[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      kappaPairs.push({
        modelAId: orderedModelIds[i]!,
        modelBId: orderedModelIds[j]!,
        kappa: kappaMatrix[i]![j] ?? null,
      });
    }
  }

  return { clusterAnalysis, kappaPairs, ...freshness };
}

builder.queryField('modelAgreementClusterAnalysis', (t) =>
  t.field({
    type: KappaClusterPayloadRef,
    args: {
      modelIds: t.arg.idList({ required: true }),
      domainId: t.arg.id({ required: false }),
      domainIds: t.arg.idList({ required: false }),
      scope: t.arg.string({ required: true }),
      signature: t.arg.string({ required: true }),
      method: t.arg.string({ required: true }),
    },
    resolve: resolveModelAgreementClusterAnalysis,
  }),
);
