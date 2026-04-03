import { type Prisma } from '@valuerank/db';
import { AppError } from '@valuerank/shared';
import type {
  CandidateTranscript,
  ModelMetricsAccumulator,
  OrderInvarianceResult,
  OrderInvarianceModelMetrics,
  OrderInvarianceRow,
  OrderInvarianceSummary,
  PickResult,
} from './order-effect-types.js';
import {
  isOrderInvarianceModelMetrics,
  isOrderInvarianceRow,
  isOrderInvarianceSummary,
} from './order-effect-types.js';
import { parseTemperature } from '../../utils/temperature.js';
import { resolveTranscriptDecisionModel } from '../../graphql/queries/domain/shared.js';
import {
  aggregateWithinCellDisagreementRate,
  type OrderEffectStableSide,
  ORDER_EFFECT_VARIANT_METADATA,
  ORDER_EFFECT_SNAPSHOT_OUTPUT_SCHEMA_VERSION,
  type OrderEffectVariantType,
  computeCanonicalCellScore,
  computeMatch,
  computePairMarginSummary,
  computeScaleOrderPullLabel,
  computeValueOrderPullLabel,
  computeWithinCellDisagreementRate,
  classifyStableSide,
  getConsideredTrials,
  getPairedConsideredTrials,
  isOrderEffectVariantType,
} from './order-effect-statistics.js';
import type { DuplicateCurrentOrderEffectSnapshotError } from './order-effect-cache.js';

const VALID_DECISIONS = new Set(['1', '2', '3', '4', '5']);
const ORDER_EFFECT_CACHE_INVARIANT_ERROR_CODE = 'ASSUMPTION_ANALYSIS_CACHE_INVARIANT';

export type PairScenario = {
  id: string;
  name: string;
  definitionId: string;
  orientationFlipped: boolean;
};

export type PairRecord = {
  id?: string;
  variantType: string | null;
  sourceScenario: PairScenario;
  variantScenario: PairScenario;
};

export type EffectiveModel = {
  modelId: string;
  modelLabel: string;
};

export type PairLevelMarginSummary = {
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
};

export type OrderEffectComparisonRecord = {
  modelId: string;
  modelLabel: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  variantType: OrderEffectVariantType;
  baselineRawDecisions: number[];
  variantRawDecisions: number[];
  baselineNormalizedDecisions: number[];
  variantNormalizedDecisions: number[];
  baselineConsideredTrials: number[];
  variantConsideredTrials: number[];
  rawBaselineConsideredTrials: number[];
  rawVariantConsideredTrials: number[];
  baselineCellScore: number | null;
  variantCellScore: number | null;
  rawBaselineCellScore: number | null;
  rawVariantCellScore: number | null;
  baselineStableSide: OrderEffectStableSide | 'neutral' | 'missing';
  variantStableSide: OrderEffectStableSide | 'neutral' | 'missing';
  matchesBaseline: boolean | null;
  reversed: boolean | null;
  withinCellDisagreement: {
    baseline: number | null;
    variant: number | null;
  };
  pairMargin: {
    baseline: number | null;
    variant: number | null;
    limiting: number | null;
  };
};

function _parseAttributeLabels(vignetteTitle: string): { attributeALabel: string | null; attributeBLabel: string | null } {
  const match = vignetteTitle.match(/\((.+?)\s+vs\s+(.+?)\)$/);
  if (!match) {
    return { attributeALabel: null, attributeBLabel: null };
  }

  return {
    attributeALabel: match[1]?.trim() ?? null,
    attributeBLabel: match[2]?.trim() ?? null,
  };
}

function _parseConditionLevels(conditionKey: string): { attributeALevel: number | null; attributeBLevel: number | null } {
  const match = conditionKey.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { attributeALevel: null, attributeBLevel: null };
  }

  const attributeALevel = Number.parseInt(match[1] ?? '', 10);
  const attributeBLevel = Number.parseInt(match[2] ?? '', 10);

  return {
    attributeALevel: Number.isFinite(attributeALevel) ? attributeALevel : null,
    attributeBLevel: Number.isFinite(attributeBLevel) ? attributeBLevel : null,
  };
}

function _getRunAssumptionKey(config: unknown): string | null {
  if (config == null || typeof config !== 'object') {
    return null;
  }
  const value = (config as Record<string, unknown>).assumptionKey;
  return typeof value === 'string' && value !== '' ? value : null;
}

function _isAssumptionRun(tags: Array<{ tag: { name: string } }>): boolean {
  return tags.some((tag) => tag.tag.name === 'assumption-run');
}

function _isTempZeroRun(config: unknown): boolean {
  return parseTemperature((config as { temperature?: unknown } | null)?.temperature) === 0;
}

// TODO(slice-3.2): replace numeric score with canonical direction/strength throughout order-effect
function _canonicalToScore(input: {
  decisionCode: string | null;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  orientationFlipped: boolean;
}): number | null {
  const result = resolveTranscriptDecisionModel(input);
  const canonicalScore = result.legacy.canonicalScore;
  if (canonicalScore != null) {
    return canonicalScore;
  }

  if (input.decisionCode == null || !VALID_DECISIONS.has(input.decisionCode)) {
    return null;
  }

  return Number(input.decisionCode);
}

function _parseDecision(input: {
  decisionCode: string | null;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  orientationFlipped: boolean;
}): number | null {
  return _canonicalToScore(input);
}

function _pickStableTranscripts(
  candidates: CandidateTranscript[],
  requiredCount: number
): PickResult {
  if (candidates.length < requiredCount) {
    return { kind: 'insufficient' };
  }

  const sorted = [...candidates].sort((left, right) => (
    right.createdAt.getTime() - left.createdAt.getTime()
  ));
  const groups = new Map<string, CandidateTranscript[]>();
  const versionOrder: string[] = [];

  for (const candidate of sorted) {
    const key = candidate.modelVersion ?? '__NULL__';
    const existing = groups.get(key);
    if (existing != null) {
      existing.push(candidate);
      continue;
    }
    groups.set(key, [candidate]);
    versionOrder.push(key);
  }

  for (const versionKey of versionOrder) {
    const group = groups.get(versionKey) ?? [];
    if (group.length >= requiredCount) {
      return {
        kind: 'selected',
        selected: group.slice(0, requiredCount),
        modelVersion: versionKey === '__NULL__' ? null : versionKey,
      };
    }
  }

  return groups.size > 1 ? { kind: 'fragmented' } : { kind: 'insufficient' };
}

export function computeMajorityVote(values: number[], trimOutliers: boolean): number | null {
  return computeCanonicalCellScore(getConsideredTrials(values, trimOutliers));
}

export function getVariantMetadata(variantType: string | null) {
  if (!isOrderEffectVariantType(variantType)) {
    return null;
  }
  return ORDER_EFFECT_VARIANT_METADATA[variantType];
}

export function buildComparisonRecord(params: {
  pair: PairRecord;
  modelId: string;
  modelLabel: string;
  vignetteTitle: string;
  conditionKey: string;
  baselinePick: Extract<PickResult, { kind: 'selected' }>;
  flippedPick: Extract<PickResult, { kind: 'selected' }>;
  trimOutliers: boolean;
  directionOnly: boolean;
}): OrderEffectComparisonRecord | null {
  if (!isOrderEffectVariantType(params.pair.variantType)) {
    return null;
  }

  const baselineNormalizedDecisions = params.baselinePick.selected.map((transcript) => transcript.decision);
  const variantNormalizedDecisions = params.flippedPick.selected.map((transcript) => transcript.decision);
  const baselineRawDecisions = params.baselinePick.selected.map((transcript) => transcript.rawDecision);
  const variantRawDecisions = params.flippedPick.selected.map((transcript) => transcript.rawDecision);
  const baselineConsidered = getPairedConsideredTrials(
    baselineRawDecisions,
    baselineNormalizedDecisions,
    params.trimOutliers
  );
  const variantConsidered = getPairedConsideredTrials(
    variantRawDecisions,
    variantNormalizedDecisions,
    params.trimOutliers
  );
  const baselineConsideredTrials = baselineConsidered.normalized;
  const variantConsideredTrials = variantConsidered.normalized;
  const rawBaselineConsideredTrials = baselineConsidered.raw;
  const rawVariantConsideredTrials = variantConsidered.raw;

  const baselineCellScore = computeCanonicalCellScore(baselineConsideredTrials);
  const variantCellScore = computeCanonicalCellScore(variantConsideredTrials);

  if (baselineCellScore == null || variantCellScore == null) {
    return null;
  }

  const rawBaselineCellScore = computeCanonicalCellScore(rawBaselineConsideredTrials);
  const rawVariantCellScore = computeCanonicalCellScore(rawVariantConsideredTrials);
  const baselineStableBase = classifyStableSide(baselineConsideredTrials);
  const variantStableBase = classifyStableSide(variantConsideredTrials);
  const baselineStableSide = baselineCellScore === 3 ? 'neutral' : baselineStableBase;
  const variantStableSide = variantCellScore === 3 ? 'neutral' : variantStableBase;
  const matchesBaseline = computeMatch(baselineCellScore, variantCellScore, params.directionOnly);
  const eligibleForReversal = (
    (baselineStableSide === 'lean_low' || baselineStableSide === 'lean_high')
    && (variantStableSide === 'lean_low' || variantStableSide === 'lean_high')
  );
  const reversed = eligibleForReversal
    ? baselineStableSide !== variantStableSide
    : null;
  const baselineMargin = Math.abs(baselineCellScore - 3);
  const variantMargin = Math.abs(variantCellScore - 3);

  return {
    modelId: params.modelId,
    modelLabel: params.modelLabel,
    vignetteId: params.pair.sourceScenario.definitionId,
    vignetteTitle: params.vignetteTitle,
    conditionKey: params.conditionKey,
    variantType: params.pair.variantType,
    baselineRawDecisions,
    variantRawDecisions,
    baselineNormalizedDecisions,
    variantNormalizedDecisions,
    baselineConsideredTrials,
    variantConsideredTrials,
    rawBaselineConsideredTrials,
    rawVariantConsideredTrials,
    baselineCellScore,
    variantCellScore,
    rawBaselineCellScore,
    rawVariantCellScore,
    baselineStableSide,
    variantStableSide,
    matchesBaseline,
    reversed,
    withinCellDisagreement: {
      baseline: computeWithinCellDisagreementRate(baselineConsideredTrials),
      variant: computeWithinCellDisagreementRate(variantConsideredTrials),
    },
    pairMargin: {
      baseline: baselineMargin,
      variant: variantMargin,
      limiting: Math.min(baselineMargin, variantMargin),
    },
  };
}

export function createModelMetricsAccumulator(modelId: string, modelLabel: string): ModelMetricsAccumulator {
  return {
    modelId,
    modelLabel,
    matchCount: 0,
    matchEligibleCount: 0,
    valueOrderReversalCount: 0,
    valueOrderEligibleCount: 0,
    valueOrderExcludedCount: 0,
    valueOrderDrifts: [],
    scaleOrderReversalCount: 0,
    scaleOrderEligibleCount: 0,
    scaleOrderExcludedCount: 0,
    scaleOrderDrifts: [],
    cellDisagreementByScenario: new Map<string, number>(),
    limitingMargins: [],
  };
}

export function finalizeModelMetrics(accumulator: ModelMetricsAccumulator): OrderInvarianceModelMetrics {
  return {
    modelId: accumulator.modelId,
    modelLabel: accumulator.modelLabel,
    matchRate: accumulator.matchEligibleCount > 0
      ? accumulator.matchCount / accumulator.matchEligibleCount
      : null,
    matchCount: accumulator.matchCount,
    matchEligibleCount: accumulator.matchEligibleCount,
    valueOrderReversalRate: accumulator.valueOrderEligibleCount > 0
      ? accumulator.valueOrderReversalCount / accumulator.valueOrderEligibleCount
      : null,
    valueOrderEligibleCount: accumulator.valueOrderEligibleCount,
    valueOrderExcludedCount: accumulator.valueOrderExcludedCount,
    valueOrderPull: computeValueOrderPullLabel(accumulator.valueOrderDrifts),
    scaleOrderReversalRate: accumulator.scaleOrderEligibleCount > 0
      ? accumulator.scaleOrderReversalCount / accumulator.scaleOrderEligibleCount
      : null,
    scaleOrderEligibleCount: accumulator.scaleOrderEligibleCount,
    scaleOrderExcludedCount: accumulator.scaleOrderExcludedCount,
    scaleOrderPull: computeScaleOrderPullLabel(accumulator.scaleOrderDrifts),
    withinCellDisagreementRate: aggregateWithinCellDisagreementRate(
      Array.from(accumulator.cellDisagreementByScenario.values())
    ),
    pairLevelMarginSummary: computePairMarginSummary(accumulator.limitingMargins),
  };
}
export function bumpVariantExcludedCount(metrics: ModelMetricsAccumulator, variantType: string | null) {
  if (!isOrderEffectVariantType(variantType)) {
    return;
  }

  const metricFamily = ORDER_EFFECT_VARIANT_METADATA[variantType].metricFamily;
  if (metricFamily === 'value_order') {
    metrics.valueOrderExcludedCount += 1;
  } else if (metricFamily === 'scale_order') {
    metrics.scaleOrderExcludedCount += 1;
  }
}
export function buildOrderEffectCacheFailureContext(args: {
  inputHash: string;
  configSignature: string;
  codeVersion: string;
  selectionFingerprintCount: number;
  approvedPairCount: number;
  snapshotModelCount: number;
  duplicateError: DuplicateCurrentOrderEffectSnapshotError;
  phase: 'cache_read' | 'cache_repair' | 'cache_write';
}) {
  return {
    inputHash: args.inputHash,
    configSignature: args.configSignature,
    codeVersion: args.codeVersion,
    selectionFingerprintCount: args.selectionFingerprintCount,
    approvedPairCount: args.approvedPairCount,
    snapshotModelCount: args.snapshotModelCount,
    phase: args.phase,
    snapshotIds: args.duplicateError.details?.snapshotIds ?? [],
    duplicateConfigSignatures: args.duplicateError.details?.configSignatures ?? [],
    duplicateCodeVersions: args.duplicateError.details?.codeVersions ?? [],
  };
}

export function createOrderEffectCacheInvariantError(
  context: ReturnType<typeof buildOrderEffectCacheFailureContext>
) {
  return new AppError(
    'Assumptions analysis cache invariant failed. Duplicate CURRENT snapshots require manual repair.',
    ORDER_EFFECT_CACHE_INVARIANT_ERROR_CODE,
    500,
    context
  );
}
export function buildConditionKey(name: string): string {
  const match = name.match(/_(\d+)\s*\/.*_(\d+)$/);
  if (!match) {
    return name;
  }
  return `${match[1] ?? '?'}x${match[2] ?? '?'}`;
}

export function parseAttributeLabels(vignetteTitle: string): { attributeALabel: string | null; attributeBLabel: string | null } {
  const match = vignetteTitle.match(/\((.+?)\s+vs\s+(.+?)\)$/);
  if (!match) {
    return { attributeALabel: null, attributeBLabel: null };
  }

  return {
    attributeALabel: match[1]?.trim() ?? null,
    attributeBLabel: match[2]?.trim() ?? null,
  };
}

export function parseConditionLevels(conditionKey: string): { attributeALevel: number | null; attributeBLevel: number | null } {
  const match = conditionKey.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { attributeALevel: null, attributeBLevel: null };
  }

  const attributeALevel = Number.parseInt(match[1] ?? '', 10);
  const attributeBLevel = Number.parseInt(match[2] ?? '', 10);

  return {
    attributeALevel: Number.isFinite(attributeALevel) ? attributeALevel : null,
    attributeBLevel: Number.isFinite(attributeBLevel) ? attributeBLevel : null,
  };
}

export function getRunAssumptionKey(config: unknown): string | null {
  if (config == null || typeof config !== 'object') {
    return null;
  }
  const value = (config as Record<string, unknown>).assumptionKey;
  return typeof value === 'string' && value !== '' ? value : null;
}

export function isAssumptionRun(tags: Array<{ tag: { name: string } }>): boolean {
  return tags.some((tag) => tag.tag.name === 'assumption-run');
}

export function isTempZeroRun(config: unknown): boolean {
  return parseTemperature((config as { temperature?: unknown } | null)?.temperature) === 0;
}

export function parseDecision(input: {
  decisionCode: string | null;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  orientationFlipped: boolean;
}): number | null {
  return _canonicalToScore(input);
}

export function pickStableTranscripts(
  candidates: CandidateTranscript[],
  requiredCount: number
): PickResult {
  if (candidates.length < requiredCount) {
    return { kind: 'insufficient' };
  }

  const sorted = [...candidates].sort((left, right) => (
    right.createdAt.getTime() - left.createdAt.getTime()
  ));
  const groups = new Map<string, CandidateTranscript[]>();
  const versionOrder: string[] = [];

  for (const candidate of sorted) {
    const key = candidate.modelVersion ?? '__NULL__';
    const existing = groups.get(key);
    if (existing != null) {
      existing.push(candidate);
      continue;
    }
    groups.set(key, [candidate]);
    versionOrder.push(key);
  }

  for (const versionKey of versionOrder) {
    const group = groups.get(versionKey) ?? [];
    if (group.length >= requiredCount) {
      return {
        kind: 'selected',
        selected: group.slice(0, requiredCount),
        modelVersion: versionKey === '__NULL__' ? null : versionKey,
      };
    }
  }

  return groups.size > 1 ? { kind: 'fragmented' } : { kind: 'insufficient' };
}

export function fingerprintPick(key: string, pick: PickResult): string {
  if (pick.kind !== 'selected') {
    return `${key}::${pick.kind}`;
  }

  return [
    key,
    'selected',
    pick.modelVersion ?? '__NULL__',
    ...pick.selected.map((transcript) => (
      [
        transcript.id,
        transcript.scenarioId,
        transcript.modelId,
        transcript.modelVersion ?? '__NULL__',
        transcript.rawDecision,
        transcript.decision,
        transcript.createdAt.toISOString(),
      ].join(':')
    )),
  ].join('::');
}

export function serializeOrderInvarianceSnapshotOutput(result: OrderInvarianceResult): Prisma.InputJsonValue {
  return {
    schemaVersion: ORDER_EFFECT_SNAPSHOT_OUTPUT_SCHEMA_VERSION,
    summary: result.summary,
    modelMetrics: result.modelMetrics,
    rows: result.rows,
  };
}

export function deserializeOrderInvarianceSnapshotOutput(snapshot: {
  createdAt: Date;
  output: unknown;
}): OrderInvarianceResult | null {
  if (snapshot.output == null || typeof snapshot.output !== 'object' || Array.isArray(snapshot.output)) {
    return null;
  }

  const candidate = snapshot.output as {
    schemaVersion?: unknown;
    summary?: OrderInvarianceSummary;
    modelMetrics?: OrderInvarianceModelMetrics[];
    rows?: OrderInvarianceRow[];
  };

  if (
    candidate.schemaVersion !== ORDER_EFFECT_SNAPSHOT_OUTPUT_SCHEMA_VERSION
    || !isOrderInvarianceSummary(candidate.summary)
    || !Array.isArray(candidate.modelMetrics)
    || !candidate.modelMetrics.every((entry) => isOrderInvarianceModelMetrics(entry))
    || !Array.isArray(candidate.rows)
    || !candidate.rows.every((entry) => isOrderInvarianceRow(entry))
  ) {
    return null;
  }

  return {
    generatedAt: snapshot.createdAt,
    summary: candidate.summary,
    modelMetrics: candidate.modelMetrics,
    rows: candidate.rows,
  };
}

export type { OrderInvarianceStatus, OrderInvarianceMismatchType, OrderInvarianceExclusionCount, OrderInvarianceSummary, OrderInvarianceRow, OrderInvarianceModelMetrics, OrderInvarianceResult, OrderInvarianceTranscript, OrderInvarianceTranscriptResult } from './order-effect-types.js';
export { getOrderInvarianceAnalysisResult } from './order-effect-queries.js';
