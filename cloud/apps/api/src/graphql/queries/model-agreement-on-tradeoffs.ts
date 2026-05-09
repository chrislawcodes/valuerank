import { ValidationError } from '@valuerank/shared';
import { builder } from '../builder.js';
import { getModelsFromDatabase } from '../../config/models.js';
import {
  ModelAgreementResultRef,
  PairDivergenceBreakdownRef,
  type ModelAgreementResultShape,
  type PairDivergenceBreakdownShape,
  type ModelTrialConsistencyShape,
  type PairwiseAgreementRowShape,
  type ValuePairDivergenceShape,
} from '../types/model-agreement-on-tradeoffs.js';
import {
  buildEmptyAgreementResult,
  buildEmptyPairBreakdown,
  buildPositionCells,
  buildSelectedModels,
  buildUnavailableModelInfo,
  collectComparableCells,
  computePairwiseKappaWithBreakdown,
  computeProportionA,
  normalizeModelIds,
  summarizePairCells,
  summarizeTrialConsistency,
  type CellOutcome,
  type ComparableCell,
  type CellChoice,
} from '../../services/model-agreement/aggregation.js';
import {
  equalWeightAggregate,
  isTied,
} from '../../services/model-agreement/math.js';
import { resolveDomainAnalysisScopeDefinitions } from '../../services/analysis/domain-analysis-scope-loader.js';
import { resolveSignatureRuns } from '../queries/domain/shared.js';
import {
  queueDomainAnalysisRefresh,
  readModelAgreementSnapshotStateFromSnapshot,
} from '../../services/analysis/domain-analysis-cache.js';
import type { DomainAnalysisScope } from '../../services/analysis/domain-analysis-scope.js';
import type { Context } from '../context.js';

const ALL_DOMAINS_SCOPE_ID = 'all-domains';
const AGREEMENT_REFRESH_REASON = 'model-agreement-on-tradeoffs-page-load-missing';
const DRILLDOWN_REFRESH_REASON = 'model-pair-divergence-breakdown-missing';
const NON_BINARY_CELL_FALLBACK_COUNT = 0;

async function resolveAgreementScope(params: {
  scope: DomainAnalysisScope;
  domainId: string | null;
  signature: string;
}): Promise<{
  scopeData: Awaited<ReturnType<typeof resolveDomainAnalysisScopeDefinitions>>;
  resolvedSignatureRuns: Awaited<ReturnType<typeof resolveSignatureRuns>>;
}> {
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
    throw new ValidationError('Model agreement could not be computed because no completed runs were found for the selected scope.');
  }

  return { scopeData, resolvedSignatureRuns };
}

async function readAgreementSnapshot(params: {
  scope: DomainAnalysisScope;
  domainId: string | null;
  signature: string;
  refreshReason: string;
  ctx: Context;
}): Promise<{
  snapshot: Record<string, CellOutcome> | null;
  buildProgress: {
    completedRuns: number;
    totalRuns: number;
    currentRunId: string | null;
    updatedAt: string;
  } | null;
  queued: boolean;
}> {
  const snapshotState = await readModelAgreementSnapshotStateFromSnapshot(
    params.scope,
    params.domainId ?? ALL_DOMAINS_SCOPE_ID,
    params.signature,
  );
  if (snapshotState != null) {
    return {
      snapshot: snapshotState.cellLevelOutcomes,
      buildProgress: snapshotState.buildProgress,
      queued: true,
    };
  }

  const queued = await queueDomainAnalysisRefresh({
    scope: params.scope,
    domainId: params.domainId ?? ALL_DOMAINS_SCOPE_ID,
    signature: params.signature,
    reason: params.refreshReason,
  });
  if (queued) {
    params.ctx.log.info(
      { scope: params.scope, domainId: params.domainId, signature: params.signature },
      'Model agreement snapshot not ready - rebuild queued, returning pending',
    );
  } else {
    params.ctx.log.warn(
      { scope: params.scope, domainId: params.domainId, signature: params.signature },
      'Model agreement snapshot not ready and rebuild could not be queued',
    );
  }
  return { snapshot: null, buildProgress: null, queued };
}

export async function resolveModelAgreementOnTradeoffs(
  _root: unknown,
  args: {
    modelIds: ReadonlyArray<string | number>;
    domainId?: string | number | null;
    scope: string;
    signature: string;
  },
  ctx: Context,
): Promise<ModelAgreementResultShape> {
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

  const selectedModelIds = normalizeModelIds(args.modelIds.map(String));
  if (selectedModelIds.length < 2) {
    throw new ValidationError('At least two distinct modelIds are required.');
  }

  const activeModels = await getModelsFromDatabase({ activeOnly: true, availableOnly: false });
  const labelByModelId = new Map(activeModels.map((model) => [model.modelId, model.displayName] as const));
  const selectedModels = buildSelectedModels(selectedModelIds, labelByModelId);
  const selectedModelIdSet = new Set(selectedModels.map((model) => model.modelId));

  const { scopeData } = await resolveAgreementScope({
    scope,
    domainId,
    signature,
  });
  const domainsById = new Map(
    scopeData.domains.map((domain) => [domain.id, { id: domain.id, name: domain.name }] as const),
  );

  const snapshotResult = await readAgreementSnapshot({
    scope,
    domainId,
    signature,
    refreshReason: AGREEMENT_REFRESH_REASON,
    ctx,
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
      const breakdown = computePairwiseKappaWithBreakdown(
        cells,
        scopeData.definitionDomainIdById,
        domainsById,
      );

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
        kappaByDomain: breakdown.kappaByDomain,
        kappaSpread: breakdown.spread,
        domainCount: breakdown.domainCount,
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

  ctx.log.debug(
    {
      scope,
      domainId,
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

export async function resolveModelPairDivergenceBreakdown(
  _root: unknown,
  args: {
    modelAId: string | number;
    modelBId: string | number;
    domainId?: string | number | null;
    scope: string;
    signature: string;
  },
  ctx: Context,
): Promise<PairDivergenceBreakdownShape> {
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

  const modelAId = String(args.modelAId).trim();
  const modelBId = String(args.modelBId).trim();
  if (modelAId.length === 0 || modelBId.length === 0) {
    throw new ValidationError('modelAId and modelBId are required');
  }
  if (modelAId === modelBId) {
    throw new ValidationError('modelAId and modelBId must be different');
  }

  const activeModels = await getModelsFromDatabase({ activeOnly: true, availableOnly: false });
  const labelByModelId = new Map(activeModels.map((model) => [model.modelId, model.displayName] as const));
  const modelALabel = labelByModelId.get(modelAId) ?? modelAId;
  const modelBLabel = labelByModelId.get(modelBId) ?? modelBId;

  await resolveAgreementScope({
    scope,
    domainId,
    signature,
  });

  const snapshotResult = await readAgreementSnapshot({
    scope,
    domainId,
    signature,
    refreshReason: DRILLDOWN_REFRESH_REASON,
    ctx,
  });
  if (snapshotResult.snapshot == null) {
    return buildEmptyPairBreakdown(modelAId, modelALabel, modelBId, modelBLabel, snapshotResult.buildProgress);
  }

  const selectedModelIdSet = new Set([modelAId, modelBId]);
  const { positionCells, cellsObservedByModelId } = buildPositionCells(snapshotResult.snapshot, selectedModelIdSet);
  if ((cellsObservedByModelId.get(modelAId) ?? 0) === 0 || (cellsObservedByModelId.get(modelBId) ?? 0) === 0) {
    return buildEmptyPairBreakdown(modelAId, modelALabel, modelBId, modelBLabel);
  }

  const cellsByValuePair = new Map<string, Map<string, ComparableCell[]>>();
  for (const position of positionCells.values()) {
    const outcomeA = position.byModelId.get(modelAId);
    const outcomeB = position.byModelId.get(modelBId);
    if (outcomeA == null || outcomeB == null) {
      continue;
    }

    const proportionA = computeProportionA(outcomeA);
    const proportionB = computeProportionA(outcomeB);
    if (proportionA == null || proportionB == null) {
      continue;
    }

    const modelAChoice: CellChoice = isTied(proportionA) ? 'TIED' : (proportionA > 0.5 ? 'A' : 'B');
    const modelBChoice: CellChoice = isTied(proportionB) ? 'TIED' : (proportionB > 0.5 ? 'A' : 'B');

    const cell: ComparableCell = {
      definitionId: position.definitionId,
      valuePairKey: `${position.canonicalA}::${position.canonicalB}`,
      modelAProportionA: proportionA,
      modelBProportionA: proportionB,
      modelAChoice,
      modelBChoice,
      divergence: Math.abs(proportionA - proportionB),
      agrees: modelAChoice === modelBChoice,
    };

    const byDefinition = cellsByValuePair.get(cell.valuePairKey) ?? new Map<string, ComparableCell[]>();
    const cellsForVignette = byDefinition.get(cell.definitionId) ?? [];
    cellsForVignette.push(cell);
    byDefinition.set(cell.definitionId, cellsForVignette);
    cellsByValuePair.set(cell.valuePairKey, byDefinition);
  }

  const perValuePair: ValuePairDivergenceShape[] = [];
  for (const [valuePairKey, byDefinition] of cellsByValuePair.entries()) {
    const [valueA, valueB] = valuePairKey.split('::');
    if (valueA === undefined || valueB === undefined) {
      continue;
    }

    const cellsCompared = Array.from(byDefinition.values()).reduce((sum, cells) => sum + cells.length, 0);
    if (cellsCompared === 0) {
      continue;
    }

    const divergences = Array.from(byDefinition.values()).map((cells) => cells.map((cell) => cell.divergence));
    const modelAProportions = Array.from(byDefinition.values()).map((cells) => cells.map((cell) => cell.modelAProportionA));
    const modelBProportions = Array.from(byDefinition.values()).map((cells) => cells.map((cell) => cell.modelBProportionA));

    perValuePair.push({
      valueA,
      valueB,
      cellsCompared,
      meanAbsoluteDivergence: equalWeightAggregate(divergences),
      modelAProportionA: equalWeightAggregate(modelAProportions),
      modelBProportionA: equalWeightAggregate(modelBProportions),
    });
  }

  perValuePair.sort((left, right) => {
    const divergenceDelta = (right.meanAbsoluteDivergence ?? -1) - (left.meanAbsoluteDivergence ?? -1);
    if (divergenceDelta !== 0) {
      return divergenceDelta;
    }
    const leftKey = `${left.valueA}::${left.valueB}`;
    const rightKey = `${right.valueA}::${right.valueB}`;
    return leftKey.localeCompare(rightKey);
  });

  ctx.log.debug(
    {
      scope,
      domainId,
      signature,
      modelAId,
      modelBId,
      valuePairCount: perValuePair.length,
    },
    'Computed model pair divergence breakdown',
  );

  return {
    pending: false,
    buildProgress: null,
    modelAId,
    modelALabel,
    modelBId,
    modelBLabel,
    perValuePair,
  };
}

builder.queryField('modelAgreementOnTradeoffs', (t) =>
  t.field({
    type: ModelAgreementResultRef,
    args: {
      modelIds: t.arg.idList({ required: true }),
      domainId: t.arg.id({ required: false }),
      scope: t.arg.string({ required: true }),
      signature: t.arg.string({ required: true }),
    },
    resolve: resolveModelAgreementOnTradeoffs,
  }),
);

builder.queryField('modelPairDivergenceBreakdown', (t) =>
  t.field({
    type: PairDivergenceBreakdownRef,
    args: {
      modelAId: t.arg.id({ required: true }),
      modelBId: t.arg.id({ required: true }),
      domainId: t.arg.id({ required: false }),
      scope: t.arg.string({ required: true }),
      signature: t.arg.string({ required: true }),
    },
    resolve: resolveModelPairDivergenceBreakdown,
  }),
);
