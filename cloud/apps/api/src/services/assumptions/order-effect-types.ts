type PairLevelMarginSummary = {
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
};

export type OrderInvarianceStatus = 'COMPUTED' | 'INSUFFICIENT_DATA';
export type OrderInvarianceMismatchType = 'direction_flip' | 'exact_flip' | 'missing_pair' | null;

export type OrderInvarianceExclusionCount = {
  reason: string;
  count: number;
};

export type OrderInvarianceSummary = {
  status: OrderInvarianceStatus;
  matchRate: number | null;
  exactMatchRate: number | null;
  presentationEffectMAD: number | null;
  scaleEffectMAD: number | null;
  totalCandidatePairs: number;
  qualifyingPairs: number;
  missingPairs: number;
  comparablePairs: number;
  matchComparablePairs: number;
  presentationComparablePairs: number;
  scaleComparablePairs: number;
  presentationMissingPairs: number;
  scaleMissingPairs: number;
  sensitiveModelCount: number;
  sensitiveVignetteCount: number;
  excludedPairs: OrderInvarianceExclusionCount[];
};

export type OrderInvarianceRow = {
  modelId: string;
  modelLabel: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  variantType: string | null;
  majorityVoteBaseline: number | null;
  majorityVoteFlipped: number | null;
  rawScore: number | null;
  mismatchType: OrderInvarianceMismatchType;
  ordinalDistance: number | null;
  isMatch: boolean | null;
};

export type OrderInvarianceModelMetrics = {
  modelId: string;
  modelLabel: string;
  matchRate: number | null;
  matchCount: number;
  matchEligibleCount: number;
  valueOrderReversalRate: number | null;
  valueOrderEligibleCount: number;
  valueOrderExcludedCount: number;
  valueOrderPull: 'toward first-listed' | 'toward second-listed' | 'no clear pull';
  scaleOrderReversalRate: number | null;
  scaleOrderEligibleCount: number;
  scaleOrderExcludedCount: number;
  scaleOrderPull: 'toward higher numbers' | 'toward lower numbers' | 'no clear pull';
  withinCellDisagreementRate: number | null;
  pairLevelMarginSummary: PairLevelMarginSummary | null;
};

export type OrderInvarianceResult = {
  generatedAt: Date;
  summary: OrderInvarianceSummary;
  modelMetrics: OrderInvarianceModelMetrics[];
  rows: OrderInvarianceRow[];
};

export type OrderInvarianceTranscript = {
  id: string;
  runId: string;
  scenarioId: string;
  modelId: string;
  modelVersion: string | null;
  content: unknown;
  decisionCode: string | null;
  decisionCodeSource: string | null;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  estimatedCost: number | null;
  createdAt: Date;
  lastAccessedAt: Date | null;
  orderLabel: string;
  attributeALevel: number | null;
  attributeBLevel: number | null;
};

export type OrderInvarianceTranscriptResult = {
  generatedAt: Date;
  vignetteId: string;
  vignetteTitle: string;
  modelId: string;
  modelLabel: string;
  conditionKey: string;
  attributeALabel: string | null;
  attributeBLabel: string | null;
  transcripts: OrderInvarianceTranscript[];
};
export type CandidateTranscript = {
  id: string;
  scenarioId: string;
  modelId: string;
  modelVersion: string | null;
  rawDecision: number;
  decision: number;
  createdAt: Date;
};
export type PickResult =
  | {
    kind: 'selected';
    selected: CandidateTranscript[];
    modelVersion: string | null;
  }
  | {
    kind: 'insufficient';
  }
  | {
    kind: 'fragmented';
  };
export type ModelMetricsAccumulator = {
  modelId: string;
  modelLabel: string;
  matchCount: number;
  matchEligibleCount: number;
  valueOrderReversalCount: number;
  valueOrderEligibleCount: number;
  valueOrderExcludedCount: number;
  valueOrderDrifts: number[];
  scaleOrderReversalCount: number;
  scaleOrderEligibleCount: number;
  scaleOrderExcludedCount: number;
  scaleOrderDrifts: number[];
  cellDisagreementByScenario: Map<string, number>;
  limitingMargins: number[];
};
export function isOrderInvarianceSummary(value: unknown): value is OrderInvarianceSummary {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.status === 'COMPUTED' || candidate.status === 'INSUFFICIENT_DATA')
    && Array.isArray(candidate.excludedPairs)
    && typeof candidate.totalCandidatePairs === 'number'
    && typeof candidate.qualifyingPairs === 'number'
    && typeof candidate.missingPairs === 'number'
    && typeof candidate.comparablePairs === 'number'
  );
}

export function isOrderInvarianceModelMetrics(value: unknown): value is OrderInvarianceModelMetrics {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.modelId === 'string'
    && typeof candidate.modelLabel === 'string'
    && typeof candidate.matchCount === 'number'
    && typeof candidate.matchEligibleCount === 'number'
    && typeof candidate.valueOrderEligibleCount === 'number'
    && typeof candidate.scaleOrderEligibleCount === 'number'
  );
}

export function isOrderInvarianceRow(value: unknown): value is OrderInvarianceRow {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.modelId === 'string'
    && typeof candidate.modelLabel === 'string'
    && typeof candidate.vignetteId === 'string'
    && typeof candidate.vignetteTitle === 'string'
    && typeof candidate.conditionKey === 'string'
  );
}

function _fingerprintPick(key: string, pick: PickResult): string {
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
