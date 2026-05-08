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
  type UnavailableModelInfoShape,
  type ValuePairDivergenceShape,
} from '../types/model-agreement-on-tradeoffs.js';
import {
  cohensKappa,
  equalWeightAggregate,
  isTied,
  kappaInterpretation,
  MIN_TRIALS_FOR_CONSISTENCY,
  percentAgreement,
} from '../../services/model-agreement/math.js';
import { resolveDomainAnalysisScopeDefinitions } from '../../services/analysis/domain-analysis-scope-loader.js';
import { resolveSignatureRuns } from '../queries/domain/shared.js';
import {
  queueDomainAnalysisRefresh,
  readCellLevelOutcomesFromSnapshot,
} from '../../services/analysis/domain-analysis-cache.js';
import type { DomainAnalysisScope } from '../../services/analysis/domain-analysis-scope.js';
import type { Context } from '../context.js';

const ALL_DOMAINS_SCOPE_ID = 'all-domains';
const AGREEMENT_REFRESH_REASON = 'model-agreement-on-tradeoffs-page-load-missing';
const DRILLDOWN_REFRESH_REASON = 'model-pair-divergence-breakdown-missing';
const NON_BINARY_CELL_FALLBACK_COUNT = 0;

type ModelSummary = {
  modelId: string;
  label: string;
};

type CellOutcome = {
  aChoices: number;
  bChoices: number;
  neutrals: number;
};

type PositionCell = {
  definitionId: string;
  canonicalA: string;
  canonicalB: string;
  ownLevel: string;
  opponentLevel: string;
  byModelId: Map<string, CellOutcome>;
};

type ComparableCell = {
  definitionId: string;
  valuePairKey: string;
  modelAProportionA: number;
  modelBProportionA: number;
  divergence: number;
  agreesBinary: boolean;
};

type PairMetrics = {
  totalCells: number;
  percentAgreement: number | null;
  cohensKappa: number | null;
  kappaInterpretation: string | null;
  meanAbsoluteDivergence: number | null;
};

function normalizeModelIds(modelIds: ReadonlyArray<string | number>): string[] {
  return [...new Set(modelIds.map((modelId) => String(modelId).trim()).filter((modelId) => modelId.length > 0))]
    .sort((left, right) => left.localeCompare(right));
}

function sortModels(models: ReadonlyArray<ModelSummary>): ModelSummary[] {
  return [...models].sort((left, right) => {
    const labelDelta = left.label.localeCompare(right.label);
    return labelDelta !== 0 ? labelDelta : left.modelId.localeCompare(right.modelId);
  });
}

function mean(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseCellLevelOutcomeKey(key: string): {
  definitionId: string;
  modelId: string;
  canonicalA: string;
  canonicalB: string;
  ownLevel: string;
  opponentLevel: string;
} | null {
  const parts = key.split('::');
  if (parts.length !== 6) {
    return null;
  }

  const [definitionId, modelId, canonicalA, canonicalB, ownLevel, opponentLevel] = parts;
  if (
    definitionId === undefined
    || modelId === undefined
    || canonicalA === undefined
    || canonicalB === undefined
    || ownLevel === undefined
    || opponentLevel === undefined
  ) {
    return null;
  }

  return {
    definitionId,
    modelId,
    canonicalA,
    canonicalB,
    ownLevel,
    opponentLevel,
  };
}

function computeProportionA(outcome: CellOutcome): number | null {
  const total = outcome.aChoices + outcome.bChoices;
  if (total <= 0) {
    return null;
  }

  return outcome.aChoices / total;
}

function buildSelectedModels(
  modelIds: ReadonlyArray<string>,
  labelByModelId: Map<string, string>,
): ModelSummary[] {
  return sortModels(modelIds.map((modelId) => ({
    modelId,
    label: labelByModelId.get(modelId) ?? modelId,
  })));
}

function buildPositionCells(
  cellLevelOutcomes: Record<string, CellOutcome>,
  selectedModelIdSet: Set<string>,
): {
  positionCells: Map<string, PositionCell>;
  cellsObservedByModelId: Map<string, number>;
} {
  const positionCells = new Map<string, PositionCell>();
  const cellsObservedByModelId = new Map<string, number>();

  for (const [key, outcome] of Object.entries(cellLevelOutcomes)) {
    const parsed = parseCellLevelOutcomeKey(key);
    if (parsed == null || !selectedModelIdSet.has(parsed.modelId)) {
      continue;
    }

    cellsObservedByModelId.set(parsed.modelId, (cellsObservedByModelId.get(parsed.modelId) ?? 0) + 1);

    const positionKey = `${parsed.definitionId}::${parsed.canonicalA}::${parsed.canonicalB}::${parsed.ownLevel}::${parsed.opponentLevel}`;
    const existing = positionCells.get(positionKey);
    if (existing == null) {
      positionCells.set(positionKey, {
        definitionId: parsed.definitionId,
        canonicalA: parsed.canonicalA,
        canonicalB: parsed.canonicalB,
        ownLevel: parsed.ownLevel,
        opponentLevel: parsed.opponentLevel,
        byModelId: new Map([[parsed.modelId, outcome]]),
      });
    } else {
      existing.byModelId.set(parsed.modelId, outcome);
    }
  }

  return { positionCells, cellsObservedByModelId };
}

function collectComparableCells(params: {
  positionCells: ReadonlyMap<string, PositionCell>;
  modelAId: string;
  modelBId: string;
}): {
  cells: ComparableCell[];
  excludedTiedCells: number;
} {
  const cells: ComparableCell[] = [];
  let excludedTiedCells = 0;

  for (const position of params.positionCells.values()) {
    const outcomeA = position.byModelId.get(params.modelAId);
    const outcomeB = position.byModelId.get(params.modelBId);
    if (outcomeA == null || outcomeB == null) {
      continue;
    }

    const proportionA = computeProportionA(outcomeA);
    const proportionB = computeProportionA(outcomeB);
    if (proportionA == null || proportionB == null) {
      continue;
    }

    if (isTied(proportionA) || isTied(proportionB)) {
      excludedTiedCells += 1;
      continue;
    }

    cells.push({
      definitionId: position.definitionId,
      valuePairKey: `${position.canonicalA}::${position.canonicalB}`,
      modelAProportionA: proportionA,
      modelBProportionA: proportionB,
      divergence: Math.abs(proportionA - proportionB),
      agreesBinary:
        (proportionA > 0.5 && proportionB > 0.5)
        || (proportionA < 0.5 && proportionB < 0.5),
    });
  }

  return { cells, excludedTiedCells };
}

function summarizePairCells(cells: ReadonlyArray<ComparableCell>): PairMetrics {
  if (cells.length === 0) {
    return {
      totalCells: 0,
      percentAgreement: null,
      cohensKappa: null,
      kappaInterpretation: null,
      meanAbsoluteDivergence: null,
    };
  }

  const perVignetteAgreementRates = new Map<string, { matchedCells: number; totalCells: number }>();
  const perVignetteDivergences = new Map<string, number[]>();
  const perVignetteModelAProportions = new Map<string, number[]>();
  const perVignetteModelBProportions = new Map<string, number[]>();

  for (const cell of cells) {
    const agreementBucket = perVignetteAgreementRates.get(cell.definitionId) ?? { matchedCells: 0, totalCells: 0 };
    agreementBucket.totalCells += 1;
    if (cell.agreesBinary) {
      agreementBucket.matchedCells += 1;
    }
    perVignetteAgreementRates.set(cell.definitionId, agreementBucket);

    const divergenceBucket = perVignetteDivergences.get(cell.definitionId) ?? [];
    divergenceBucket.push(cell.divergence);
    perVignetteDivergences.set(cell.definitionId, divergenceBucket);

    const modelABucket = perVignetteModelAProportions.get(cell.definitionId) ?? [];
    modelABucket.push(cell.modelAProportionA);
    perVignetteModelAProportions.set(cell.definitionId, modelABucket);

    const modelBBucket = perVignetteModelBProportions.get(cell.definitionId) ?? [];
    modelBBucket.push(cell.modelBProportionA);
    perVignetteModelBProportions.set(cell.definitionId, modelBBucket);
  }

  const agreementRates = Array.from(perVignetteAgreementRates.values())
    .map((bucket) => percentAgreement(bucket.matchedCells, bucket.totalCells))
    .filter((value): value is number => value != null);
  const percentAgreementValue = mean(agreementRates);
  const modelAProportionA = equalWeightAggregate(Array.from(perVignetteModelAProportions.values()));
  const modelBProportionA = equalWeightAggregate(Array.from(perVignetteModelBProportions.values()));
  const meanAbsoluteDivergence = equalWeightAggregate(Array.from(perVignetteDivergences.values()));
  const chanceAgreement = modelAProportionA != null && modelBProportionA != null
    ? (modelAProportionA * modelBProportionA) + ((1 - modelAProportionA) * (1 - modelBProportionA))
    : null;
  const kappa = percentAgreementValue != null && chanceAgreement != null
    ? cohensKappa(percentAgreementValue, chanceAgreement)
    : null;

  return {
    totalCells: cells.length,
    percentAgreement: percentAgreementValue,
    cohensKappa: kappa,
    kappaInterpretation: kappaInterpretation(kappa),
    meanAbsoluteDivergence,
  };
}

function summarizeTrialConsistency(params: {
  positionCells: ReadonlyMap<string, PositionCell>;
  modelId: string;
}): {
  cellsObserved: number;
  meanTrialConsistency: number | null;
} {
  const perVignetteConsistencies = new Map<string, number[]>();
  let cellsObserved = 0;

  for (const position of params.positionCells.values()) {
    const outcome = position.byModelId.get(params.modelId);
    if (outcome == null) {
      continue;
    }

    const totalTrials = outcome.aChoices + outcome.bChoices;
    if (totalTrials < MIN_TRIALS_FOR_CONSISTENCY) {
      continue;
    }

    const proportionA = computeProportionA(outcome);
    if (proportionA == null) {
      continue;
    }

    const consistency = Math.max(proportionA, 1 - proportionA);
    const bucket = perVignetteConsistencies.get(position.definitionId) ?? [];
    bucket.push(consistency);
    perVignetteConsistencies.set(position.definitionId, bucket);
    cellsObserved += 1;
  }

  return {
    cellsObserved,
    meanTrialConsistency: equalWeightAggregate(Array.from(perVignetteConsistencies.values())),
  };
}

function buildUnavailableModelInfo(model: ModelSummary): UnavailableModelInfoShape {
  return {
    modelId: model.modelId,
    label: model.label,
    reason: 'No cell-level outcomes were available for the selected scope.',
  };
}

function buildEmptyAgreementResult(): ModelAgreementResultShape {
  return {
    pending: true,
    models: [],
    unavailableModels: [],
    excludedNonBinaryCells: 0,
    excludedTiedCells: 0,
    pairwiseAgreementMatrix: [],
    trialConsistency: [],
  };
}

function buildEmptyPairBreakdown(modelAId: string, modelALabel: string, modelBId: string, modelBLabel: string): PairDivergenceBreakdownShape {
  return {
    pending: false,
    modelAId,
    modelALabel,
    modelBId,
    modelBLabel,
    perValuePair: [],
  };
}

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
}): Promise<Record<string, CellOutcome> | null> {
  const snapshot = await readCellLevelOutcomesFromSnapshot(
    params.scope,
    params.domainId ?? ALL_DOMAINS_SCOPE_ID,
    params.signature,
  );
  if (snapshot != null) {
    return snapshot;
  }

  await queueDomainAnalysisRefresh({
    scope: params.scope,
    domainId: params.domainId ?? ALL_DOMAINS_SCOPE_ID,
    signature: params.signature,
    reason: params.refreshReason,
  });
  params.ctx.log.info(
    { scope: params.scope, domainId: params.domainId, signature: params.signature },
    'Model agreement snapshot not ready - rebuild queued, returning pending',
  );
  return null;
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

  await resolveAgreementScope({
    scope,
    domainId,
    signature,
  });

  const snapshot = await readAgreementSnapshot({
    scope,
    domainId,
    signature,
    refreshReason: AGREEMENT_REFRESH_REASON,
    ctx,
  });
  if (snapshot == null) {
    return buildEmptyAgreementResult();
  }

  const { positionCells, cellsObservedByModelId } = buildPositionCells(snapshot, selectedModelIdSet);
  const unavailableModels = selectedModels
    .filter((model) => (cellsObservedByModelId.get(model.modelId) ?? 0) === 0)
    .map(buildUnavailableModelInfo);
  const availableModels = selectedModels.filter((model) => (cellsObservedByModelId.get(model.modelId) ?? 0) > 0);

  const pairwiseAgreementMatrix: PairwiseAgreementRowShape[] = [];
  let excludedTiedCells = 0;

  for (let leftIndex = 0; leftIndex < availableModels.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < availableModels.length; rightIndex += 1) {
      const modelA = availableModels[leftIndex]!;
      const modelB = availableModels[rightIndex]!;
      const { cells, excludedTiedCells: pairExcludedTiedCells } = collectComparableCells({
        positionCells,
        modelAId: modelA.modelId,
        modelBId: modelB.modelId,
      });
      excludedTiedCells += pairExcludedTiedCells;
      const metrics = summarizePairCells(cells);

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
    models: availableModels,
    unavailableModels,
    excludedNonBinaryCells: NON_BINARY_CELL_FALLBACK_COUNT,
    excludedTiedCells,
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

  const snapshot = await readAgreementSnapshot({
    scope,
    domainId,
    signature,
    refreshReason: DRILLDOWN_REFRESH_REASON,
    ctx,
  });
  if (snapshot == null) {
    return buildEmptyPairBreakdown(modelAId, modelALabel, modelBId, modelBLabel);
  }

  const selectedModelIdSet = new Set([modelAId, modelBId]);
  const { positionCells, cellsObservedByModelId } = buildPositionCells(snapshot, selectedModelIdSet);
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
    if (proportionA == null || proportionB == null || isTied(proportionA) || isTied(proportionB)) {
      continue;
    }

    const cell: ComparableCell = {
      definitionId: position.definitionId,
      valuePairKey: `${position.canonicalA}::${position.canonicalB}`,
      modelAProportionA: proportionA,
      modelBProportionA: proportionB,
      divergence: Math.abs(proportionA - proportionB),
      agreesBinary:
        (proportionA > 0.5 && proportionB > 0.5)
        || (proportionA < 0.5 && proportionB < 0.5),
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
