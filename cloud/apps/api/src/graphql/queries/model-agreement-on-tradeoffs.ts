import { ValidationError } from '@valuerank/shared';
import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { getModelsFromDatabase } from '../../config/models.js';
import { getBoss } from '../../queue/boss.js';
import {
  ModelAgreementResultRef,
  PairDivergenceBreakdownRef,
  type ModelAgreementResultShape,
  type PairDivergenceBreakdownShape,
  type ValuePairDivergenceShape,
} from '../types/model-agreement-on-tradeoffs.js';
import {
  buildEmptyPairBreakdown,
  buildEmptyAgreementResult,
  buildPositionCells,
  computeProportionA,
  normalizeModelIds,
  type CellOutcome,
  type ComparableCell,
  type CellChoice,
} from '../../services/model-agreement/aggregation.js';
import {
  equalWeightAggregate,
  isTied,
} from '../../services/model-agreement/math.js';
import { computeModelAgreement } from '../../services/model-agreement/compute.js';
import { resolveDomainAnalysisScopeDefinitions } from '../../services/analysis/domain-analysis-scope-loader.js';
import { resolveSignatureRuns } from '../queries/domain/shared.js';
import { queueDomainAnalysisRefresh } from '../../services/analysis/domain-analysis-cache.js';
import { readModelAgreementSnapshotStateFromSnapshot } from '../../services/analysis/domain-analysis-snapshot-readers.js';
import { getModelAgreementSnapshot } from '../../services/analysis/model-agreement-snapshot/snapshot-cache.js';
import {
  normalizeDomainIds,
  resolveDomainAnalysisSelection,
  type DomainAnalysisScope,
} from '../../services/analysis/domain-analysis-scope.js';
import type { Context } from '../context.js';

const DRILLDOWN_REFRESH_REASON = 'model-pair-divergence-breakdown-missing';

function sameModelSelection(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function attachFreshnessFields(
  result: ModelAgreementResultShape,
  freshness: {
    snapshotComputedAt: Date | null;
    snapshotIsStale: boolean | null;
    snapshotSource: ModelAgreementResultShape['snapshotSource'];
  },
): ModelAgreementResultShape {
  return {
    ...result,
    ...freshness,
  };
}

function buildBuildingAgreementResult(): ModelAgreementResultShape {
  return attachFreshnessFields(buildEmptyAgreementResult(true), {
    snapshotComputedAt: null,
    snapshotIsStale: false,
    snapshotSource: 'BUILDING',
  });
}


async function resolveAgreementScope(params: {
  scope: DomainAnalysisScope;
  domainId: string;
  domainIds: string[];
  signature: string;
}): Promise<{
  scopeData: Awaited<ReturnType<typeof resolveDomainAnalysisScopeDefinitions>>;
  resolvedSignatureRuns: Awaited<ReturnType<typeof resolveSignatureRuns>>;
}> {
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

  const queued = await queueDomainAnalysisRefresh({
    scope: params.scope,
    domainId: params.domainId,
    domainIds: params.domainIds,
    signature: params.signature,
    reason: params.refreshReason,
  });
  if (queued) {
    params.ctx.log.info(
      { scope: params.scope, domainId: params.domainId, domainIds: params.domainIds, signature: params.signature },
      'Model agreement snapshot not ready - rebuild queued, returning pending',
    );
  } else {
    params.ctx.log.warn(
      { scope: params.scope, domainId: params.domainId, domainIds: params.domainIds, signature: params.signature },
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
    domainIds?: ReadonlyArray<string | number> | null;
    scope: string;
    signature: string;
  },
  ctx: Context,
): Promise<ModelAgreementResultShape> {
  const scopeValue = String(args.scope);
  if (scopeValue !== 'DOMAIN' && scopeValue !== 'ALL_DOMAINS' && scopeValue !== 'DOMAIN_SET') {
    throw new ValidationError(`Unsupported scope: ${scopeValue}`);
  }

  const domainId = args.domainId != null ? String(args.domainId).trim() : null;
  const selection = resolveDomainAnalysisSelection({
    scope: scopeValue,
    domainId,
    domainIds: normalizeDomainIds((args.domainIds ?? []).map(String)),
  });
  if (scopeValue === 'DOMAIN' && selection.scope !== 'DOMAIN') {
    throw new ValidationError('domainId is required when scope is DOMAIN');
  }
  const scope: DomainAnalysisScope = selection.scope;

  const signature = String(args.signature).trim();
  if (signature.length === 0) {
    throw new ValidationError('signature is required');
  }

  const selectedModelIds = normalizeModelIds(args.modelIds.map(String));
  if (selectedModelIds.length < 2) {
    throw new ValidationError('At least two distinct modelIds are required.');
  }

  const activeModels = await getModelsFromDatabase({ activeOnly: true, availableOnly: false });
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
      if (snapshotResult.source === 'BUILDING') {
        return buildBuildingAgreementResult();
      }
      const cachedPayload = snapshotResult.payload;
      if (cachedPayload == null) {
        return buildBuildingAgreementResult();
      }
      return attachFreshnessFields(cachedPayload, {
        snapshotComputedAt: snapshotResult.snapshotComputedAt,
        snapshotIsStale: snapshotResult.source === 'CACHE_HIT_STALE',
        snapshotSource: snapshotResult.source,
      });
    }
  }

  const liveResult = await computeModelAgreement(db, {
    modelIds: selectedModelIds,
    domainId: selection.domainId,
    domainIds: selection.domainIds,
    scope,
    signature,
  }, { log: ctx.log });

  return attachFreshnessFields(liveResult, {
    snapshotComputedAt: null,
    snapshotIsStale: false,
    snapshotSource: 'LIVE_NON_CANONICAL',
  });
}

export async function resolveModelPairDivergenceBreakdown(
  _root: unknown,
  args: {
    modelAId: string | number;
    modelBId: string | number;
    domainId?: string | number | null;
    domainIds?: ReadonlyArray<string | number> | null;
    scope: string;
    signature: string;
  },
  ctx: Context,
): Promise<PairDivergenceBreakdownShape> {
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
    domainId: selection.domainId,
    domainIds: selection.domainIds,
    signature,
  });

  const snapshotResult = await readAgreementSnapshot({
    scope,
    domainId: selection.domainId,
    domainIds: selection.domainIds,
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
      domainId: selection.domainId,
      domainIds: selection.domainIds,
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
      domainIds: t.arg.idList({ required: false }),
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
      domainIds: t.arg.idList({ required: false }),
      scope: t.arg.string({ required: true }),
      signature: t.arg.string({ required: true }),
    },
    resolve: resolveModelPairDivergenceBreakdown,
  }),
);
