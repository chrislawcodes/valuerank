import { ValidationError } from '@valuerank/shared';
import type { PrismaClient } from '@valuerank/db';
import {
  bootstrapKappaConfidence,
  buildEmptyAgreementResult,
  buildPositionCells,
  buildSelectedModels,
  buildUnavailableModelInfo,
  collectComparableCells,
  normalizeModelIds,
  summarizePairCells,
  summarizeTrialConsistency,
  type CellOutcome,
} from './aggregation.js';
import type {
  ModelAgreementBuildProgressShape,
  ModelAgreementResultShape,
  ModelTrialConsistencyShape,
  PairwiseAgreementRowShape,
} from '../../graphql/types/model-agreement-on-tradeoffs.js';
import {
  resolveDomainAnalysisSelection,
  type DomainAnalysisScope,
} from '../analysis/domain-analysis-scope.js';
import { groupCellsByVignette } from './aggregation.js';

const AGREEMENT_REFRESH_REASON = 'model-agreement-on-tradeoffs-page-load-missing';
const NON_BINARY_CELL_FALLBACK_COUNT = 0;
const KAPPA_BOOTSTRAP_ITERATIONS = 1000;

type LoggerLike = {
  debug(data: Record<string, unknown>, message: string): void;
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
};

type ComputeModelAgreementInput = {
  modelIds: ReadonlyArray<string | number>;
  domainId?: string | number | null;
  domainIds?: ReadonlyArray<string | number> | null;
  scope: string;
  signature: string;
};

type ResolveAgreementScopeResult = {
  scopeData: {
    latestDefinitionIds: string[];
    domain: { defaultModelIds: string[] };
  };
  resolvedSignatureRuns: {
    filteredSourceRunIds: string[];
  };
};

type ReadAgreementSnapshotResult = {
  snapshot: Record<string, CellOutcome> | null;
  buildProgress: ModelAgreementBuildProgressShape | null;
  queued: boolean;
};

type GetModelsFromDatabaseFn = (params: {
  activeOnly: boolean;
  availableOnly: boolean;
}) => Promise<Array<{ modelId: string; displayName: string }>>;

type ResolveDomainAnalysisScopeDefinitionsFn = (params: {
  scope: DomainAnalysisScope;
  domainId: string;
  domainIds: string[];
}) => Promise<ResolveAgreementScopeResult['scopeData']>;

type ResolveSignatureRunsFn = (
  latestDefinitionIds: string[],
  selectedSignature: string | null,
  defaultModelIds?: string[],
) => Promise<ResolveAgreementScopeResult['resolvedSignatureRuns']>;

type ReadModelAgreementSnapshotStateFromSnapshotFn = (
  scope: DomainAnalysisScope,
  domainId: string,
  configSignature: string,
) => Promise<{
  cellLevelOutcomes: Record<string, CellOutcome> | null;
  buildProgress: ModelAgreementBuildProgressShape | null;
  inputHash: string | null;
} | null>;

type QueueDomainAnalysisRefreshFn = (params: {
  scope: DomainAnalysisScope;
  domainId: string;
  domainIds: string[];
  signature: string;
  reason: string;
}) => Promise<boolean>;

const noopLogger: LoggerLike = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

async function defaultGetModelsFromDatabase(params: {
  activeOnly: boolean;
  availableOnly: boolean;
}): Promise<Array<{ modelId: string; displayName: string }>> {
  const { getModelsFromDatabase } = await import('../../config/models.js');
  return getModelsFromDatabase(params);
}

async function defaultResolveDomainAnalysisScopeDefinitions(params: {
  scope: DomainAnalysisScope;
  domainId: string;
  domainIds: string[];
}): Promise<ResolveAgreementScopeResult['scopeData']> {
  const { resolveDomainAnalysisScopeDefinitions } = await import('../analysis/domain-analysis-scope-loader.js');
  return resolveDomainAnalysisScopeDefinitions(params);
}

async function defaultResolveSignatureRuns(
  latestDefinitionIds: string[],
  selectedSignature: string | null,
  defaultModelIds: string[] = [],
): Promise<ResolveAgreementScopeResult['resolvedSignatureRuns']> {
  const { resolveSignatureRuns } = await import('../../graphql/queries/domain/shared.js');
  return resolveSignatureRuns(latestDefinitionIds, selectedSignature, defaultModelIds);
}

async function defaultReadModelAgreementSnapshotStateFromSnapshot(
  scope: DomainAnalysisScope,
  domainId: string,
  configSignature: string,
): Promise<{
  cellLevelOutcomes: Record<string, CellOutcome> | null;
  buildProgress: ModelAgreementBuildProgressShape | null;
  inputHash: string | null;
} | null> {
  const { readModelAgreementSnapshotStateFromSnapshot } = await import('../analysis/domain-analysis-snapshot-readers.js');
  return readModelAgreementSnapshotStateFromSnapshot(scope, domainId, configSignature);
}

async function defaultQueueDomainAnalysisRefresh(params: {
  scope: DomainAnalysisScope;
  domainId: string;
  domainIds: string[];
  signature: string;
  reason: string;
}): Promise<boolean> {
  const { queueDomainAnalysisRefresh } = await import('../analysis/domain-analysis-cache.js');
  return queueDomainAnalysisRefresh(params);
}

async function resolveAgreementScope(params: {
  scope: DomainAnalysisScope;
  domainId: string;
  domainIds: string[];
  signature: string;
  resolveDomainAnalysisScopeDefinitionsImpl: ResolveDomainAnalysisScopeDefinitionsFn;
  resolveSignatureRunsImpl: ResolveSignatureRunsFn;
}): Promise<ResolveAgreementScopeResult> {
  const scopeData = await params.resolveDomainAnalysisScopeDefinitionsImpl({
    scope: params.scope,
    domainId: params.domainId,
    domainIds: params.domainIds,
  });
  const resolvedSignatureRuns = await params.resolveSignatureRunsImpl(
    scopeData.latestDefinitionIds,
    params.signature,
    scopeData.domain.defaultModelIds,
  );

  if (resolvedSignatureRuns.filteredSourceRunIds.length === 0) {
    throw new ValidationError('Model agreement could not be computed because no completed runs were found for the selected scope.');
  }

  return { scopeData, resolvedSignatureRuns };
}

async function readAgreementSnapshot(params: {
  scope: DomainAnalysisScope;
  domainId: string;
  domainIds: string[];
  signature: string;
  refreshReason: string;
  log: LoggerLike;
  readModelAgreementSnapshotStateFromSnapshotImpl: ReadModelAgreementSnapshotStateFromSnapshotFn;
  queueDomainAnalysisRefreshImpl: QueueDomainAnalysisRefreshFn;
}): Promise<ReadAgreementSnapshotResult> {
  const snapshotState = await params.readModelAgreementSnapshotStateFromSnapshotImpl(
    params.scope,
    params.domainId,
    params.signature,
  );
  if (snapshotState != null) {
    return {
      snapshot: snapshotState.cellLevelOutcomes,
      buildProgress: snapshotState.buildProgress,
      queued: true,
    };
  }

  const queued = await params.queueDomainAnalysisRefreshImpl({
    scope: params.scope,
    domainId: params.domainId,
    domainIds: params.domainIds,
    signature: params.signature,
    reason: params.refreshReason,
  });
  if (queued) {
    params.log.info(
      { scope: params.scope, domainId: params.domainId, domainIds: params.domainIds, signature: params.signature },
      'Model agreement snapshot not ready - rebuild queued, returning pending',
    );
  } else {
    params.log.warn(
      { scope: params.scope, domainId: params.domainId, domainIds: params.domainIds, signature: params.signature },
      'Model agreement snapshot not ready and rebuild could not be queued',
    );
  }
  return { snapshot: null, buildProgress: null, queued };
}

export async function computeModelAgreement(
  prisma: PrismaClient,
  input: ComputeModelAgreementInput,
  deps: Partial<{
    getModelsFromDatabase: GetModelsFromDatabaseFn;
    resolveDomainAnalysisScopeDefinitions: ResolveDomainAnalysisScopeDefinitionsFn;
    resolveSignatureRuns: ResolveSignatureRunsFn;
    readModelAgreementSnapshotStateFromSnapshot: ReadModelAgreementSnapshotStateFromSnapshotFn;
    queueDomainAnalysisRefresh: QueueDomainAnalysisRefreshFn;
    log: LoggerLike;
  }> = {},
): Promise<ModelAgreementResultShape> {
  void prisma;

  const log = deps.log ?? noopLogger;
  const getModelsFromDatabaseImpl = deps.getModelsFromDatabase ?? defaultGetModelsFromDatabase;
  const resolveDomainAnalysisScopeDefinitionsImpl = deps.resolveDomainAnalysisScopeDefinitions ?? defaultResolveDomainAnalysisScopeDefinitions;
  const resolveSignatureRunsImpl = deps.resolveSignatureRuns ?? defaultResolveSignatureRuns;
  const readModelAgreementSnapshotStateFromSnapshotImpl = deps.readModelAgreementSnapshotStateFromSnapshot ?? defaultReadModelAgreementSnapshotStateFromSnapshot;
  const queueDomainAnalysisRefreshImpl = deps.queueDomainAnalysisRefresh ?? defaultQueueDomainAnalysisRefresh;

  const scopeValue = String(input.scope);
  if (scopeValue !== 'DOMAIN' && scopeValue !== 'ALL_DOMAINS' && scopeValue !== 'DOMAIN_SET') {
    throw new ValidationError(`Unsupported scope: ${scopeValue}`);
  }
  const domainId = input.domainId != null ? String(input.domainId).trim() : null;
  const selection = resolveDomainAnalysisSelection({
    scope: scopeValue,
    domainId,
    domainIds: (input.domainIds ?? []).map(String),
  });
  if (scopeValue === 'DOMAIN' && selection.scope !== 'DOMAIN') {
    throw new ValidationError('domainId is required when scope is DOMAIN');
  }
  const scope: DomainAnalysisScope = selection.scope;

  const signature = String(input.signature).trim();
  if (signature.length === 0) {
    throw new ValidationError('signature is required');
  }

  const selectedModelIds = normalizeModelIds(input.modelIds.map(String));
  if (selectedModelIds.length < 2) {
    throw new ValidationError('At least two distinct modelIds are required.');
  }

  const activeModels = await getModelsFromDatabaseImpl({ activeOnly: true, availableOnly: false });
  const labelByModelId = new Map(activeModels.map((model) => [model.modelId, model.displayName] as const));
  const selectedModels = buildSelectedModels(selectedModelIds, labelByModelId);
  const selectedModelIdSet = new Set(selectedModels.map((model) => model.modelId));

  await resolveAgreementScope({
    scope,
    domainId: selection.domainId,
    domainIds: selection.domainIds,
    signature,
    resolveDomainAnalysisScopeDefinitionsImpl,
    resolveSignatureRunsImpl,
  });

  const snapshotResult = await readAgreementSnapshot({
    scope,
    domainId: selection.domainId,
    domainIds: selection.domainIds,
    signature,
    refreshReason: AGREEMENT_REFRESH_REASON,
    log,
    readModelAgreementSnapshotStateFromSnapshotImpl,
    queueDomainAnalysisRefreshImpl,
  });
  if (snapshotResult.snapshot == null) {
    return buildEmptyAgreementResult(snapshotResult.queued, snapshotResult.buildProgress);
  }

  const { positionCells, cellsObservedByModelId } = buildPositionCells(snapshotResult.snapshot, selectedModelIdSet);
  const unavailableModels = selectedModels
    .filter((model) => (cellsObservedByModelId.get(model.modelId) ?? 0) === 0)
    .map(buildUnavailableModelInfo);
  const availableModels = selectedModels.filter((model) => (cellsObservedByModelId.get(model.modelId) ?? 0) > 0);

  const pairwiseAgreementMatrix: PairwiseAgreementRowShape[] = [];
  let tiedCells = 0;

  for (let leftIndex = 0; leftIndex < availableModels.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < availableModels.length; rightIndex += 1) {
      const modelA = availableModels[leftIndex]!;
      const modelB = availableModels[rightIndex]!;
      const { cells, tiedCells: pairTiedCells } = collectComparableCells({
        positionCells,
        modelAId: modelA.modelId,
        modelBId: modelB.modelId,
      });
      tiedCells += pairTiedCells;
      const metrics = summarizePairCells(cells);
      const cellsByVignette = groupCellsByVignette(cells);
      const ci = await bootstrapKappaConfidence(cellsByVignette, metrics.cohensKappa, KAPPA_BOOTSTRAP_ITERATIONS);

      pairwiseAgreementMatrix.push({
        modelAId: modelA.modelId,
        modelALabel: modelA.label,
        modelBId: modelB.modelId,
        modelBLabel: modelB.label,
        totalCells: metrics.totalCells,
        percentAgreement: metrics.percentAgreement,
        cohensKappa: metrics.cohensKappa,
        kappaInterpretation: metrics.kappaInterpretation,
        meanAbsoluteDivergence: metrics.meanAbsoluteDivergence,
        cohensKappaConfidenceLow: ci.low,
        cohensKappaConfidenceHigh: ci.high,
        cohensKappaConfidenceIsSymmetric: ci.isSymmetric,
      });
    }
  }

  pairwiseAgreementMatrix.sort((left, right) => {
    const leftKey = `${left.modelALabel}::${left.modelBLabel}`;
    const rightKey = `${right.modelALabel}::${right.modelBLabel}`;
    return leftKey.localeCompare(rightKey);
  });

  const trialConsistency: ModelTrialConsistencyShape[] = availableModels
    .map((model) => {
      const summary = summarizeTrialConsistency({
        positionCells,
        modelId: model.modelId,
      });
      return {
        modelId: model.modelId,
        modelLabel: model.label,
        cellsObserved: summary.cellsObserved,
        meanTrialConsistency: summary.meanTrialConsistency,
        noisy:
          summary.meanTrialConsistency != null
          && summary.meanTrialConsistency < 0.7
          && summary.cellsObserved >= 5,
      };
    })
    .sort((left, right) => {
      const leftKey = `${left.modelLabel}::${left.modelId}`;
      const rightKey = `${right.modelLabel}::${right.modelId}`;
      return leftKey.localeCompare(rightKey);
    });

  log.debug(
    {
      scope,
      domainId: selection.domainId,
      domainIds: selection.domainIds,
      signature,
      selectedModelCount: selectedModels.length,
      availableModelCount: availableModels.length,
      pairCount: pairwiseAgreementMatrix.length,
    },
    'Computed model agreement on tradeoffs report',
  );

  return {
    pending: false,
    buildProgress: null,
    models: availableModels,
    unavailableModels,
    excludedNonBinaryCells: NON_BINARY_CELL_FALLBACK_COUNT,
    tiedCells,
    pairwiseAgreementMatrix,
    trialConsistency,
  };
}
