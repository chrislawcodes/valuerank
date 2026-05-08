import { ValidationError } from '@valuerank/shared';
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
  readModelAgreementSnapshotStateFromSnapshot,
} from '../../services/analysis/domain-analysis-cache.js';
import type { DomainAnalysisScope } from '../../services/analysis/domain-analysis-scope.js';
import type { Context } from '../context.js';

const ALL_DOMAINS_SCOPE_ID = 'all-domains';
const REFRESH_REASON = 'model-agreement-cluster-analysis-page-load-missing';

function emptyPayload(reason: string): KappaClusterPayload {
  return {
    clusterAnalysis: {
      clusters: [],
      faultLinesByPair: {},
      defaultPair: null,
      skipped: true,
      skipReason: reason,
    },
    kappaPairs: [],
  };
}

async function resolveScope(params: {
  scope: DomainAnalysisScope;
  domainId: string | null;
  signature: string;
}): Promise<void> {
  const scopeData = await resolveDomainAnalysisScopeDefinitions({
    scope: params.scope,
    domainId: params.domainId ?? ALL_DOMAINS_SCOPE_ID,
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
  domainId: string | null;
  signature: string;
  ctx: Context;
}): Promise<Awaited<ReturnType<typeof readModelAgreementSnapshotStateFromSnapshot>>> {
  const snapshotState = await readModelAgreementSnapshotStateFromSnapshot(
    params.scope,
    params.domainId ?? ALL_DOMAINS_SCOPE_ID,
    params.signature,
  );
  if (snapshotState != null) {
    return snapshotState;
  }

  await queueDomainAnalysisRefresh({
    scope: params.scope,
    domainId: params.domainId ?? ALL_DOMAINS_SCOPE_ID,
    signature: params.signature,
    reason: REFRESH_REASON,
  });
  params.ctx.log.info(
    { scope: params.scope, domainId: params.domainId, signature: params.signature },
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
    scope: string;
    signature: string;
    method: string;
  },
  ctx: Context,
): Promise<KappaClusterPayload> {
  const scopeValue = String(args.scope);
  if (scopeValue !== 'DOMAIN' && scopeValue !== 'ALL_DOMAINS') {
    throw new ValidationError(`Unsupported scope: ${scopeValue}`);
  }
  const scope: DomainAnalysisScope = scopeValue;

  const domainId = args.domainId != null ? String(args.domainId).trim() : null;
  if (scope === 'DOMAIN' && (domainId == null || domainId.length === 0)) {
    throw new ValidationError('domainId is required when scope is DOMAIN');
  }

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

  await resolveScope({ scope, domainId, signature });

  const snapshotState = await readAgreementSnapshot({ scope, domainId, signature, ctx });
  if (snapshotState == null) {
    return emptyPayload('Kappa cluster analysis is rebuilding — try again in a moment.');
  }

  const cellLevelOutcomes = snapshotState.cellLevelOutcomes;
  if (cellLevelOutcomes == null) {
    return emptyPayload('Kappa cluster analysis is rebuilding — try again in a moment.');
  }
  const { positionCells, cellsObservedByModelId } = buildPositionCells(cellLevelOutcomes, selectedModelIdSet);
  const availableModels = selectedModels.filter((model) => (cellsObservedByModelId.get(model.modelId) ?? 0) > 0);
  if (availableModels.length < 3) {
    return emptyPayload('Kappa clustering requires at least 3 models with cell-level data in the selected scope.');
  }

  // Pull log-odds scores from the domain-analysis result so the cluster centroids
  // and fault-lines are still labeled by what each behaviorally-similar group
  // tends to value. Falls back to zeros if a model is missing from the result.
  const domainAnalysis = await getDomainAnalysisResult({
    scope,
    domainId: domainId ?? ALL_DOMAINS_SCOPE_ID,
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
    return emptyPayload('Kappa cluster analysis could not be computed because the domain-analysis snapshot has no model scores.');
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

  return { clusterAnalysis, kappaPairs };
}

builder.queryField('modelAgreementClusterAnalysis', (t) =>
  t.field({
    type: KappaClusterPayloadRef,
    args: {
      modelIds: t.arg.idList({ required: true }),
      domainId: t.arg.id({ required: false }),
      scope: t.arg.string({ required: true }),
      signature: t.arg.string({ required: true }),
      method: t.arg.string({ required: true }),
    },
    resolve: resolveModelAgreementClusterAnalysis,
  }),
);
