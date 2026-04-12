import type {
  AssumptionsOrderInvarianceLegacyQueryVariables as GeneratedOrderInvarianceLegacyQueryVariables,
  AssumptionsOrderInvarianceTranscriptsQueryVariables as GeneratedOrderInvarianceTranscriptsQueryVariables,
  AssumptionsOrderInvarianceLaunchStatusQueryVariables as GeneratedOrderInvarianceLaunchStatusQueryVariables,
  ReviewOrderInvariancePairMutationVariables as GeneratedReviewOrderInvariancePairMutationVariables,
  LaunchOrderInvarianceMutationVariables as GeneratedLaunchOrderInvarianceMutationVariables,
} from '../../generated/graphql';

// ============================================================================
// QUERIES
// ============================================================================

export { AssumptionsOrderInvarianceLegacyDocument as ORDER_INVARIANCE_LEGACY_QUERY } from '../../generated/graphql';
export { AssumptionsOrderInvarianceAnalysisDocument as ORDER_INVARIANCE_ANALYSIS_QUERY } from '../../generated/graphql';
export { AssumptionsOrderInvarianceReviewDocument as ORDER_INVARIANCE_REVIEW_QUERY } from '../../generated/graphql';
export { AssumptionsOrderInvarianceTranscriptsDocument as ORDER_INVARIANCE_TRANSCRIPTS_QUERY } from '../../generated/graphql';
export { AssumptionsOrderInvarianceLaunchStatusDocument as ORDER_INVARIANCE_LAUNCH_STATUS_QUERY } from '../../generated/graphql';

// ============================================================================
// MUTATIONS
// ============================================================================

export { ReviewOrderInvariancePairDocument as REVIEW_ORDER_INVARIANCE_PAIR_MUTATION } from '../../generated/graphql';
export { LaunchOrderInvarianceDocument as LAUNCH_ORDER_INVARIANCE_MUTATION } from '../../generated/graphql';

// ============================================================================
// MANUAL TYPES (kept manual — JSON scalars: content, runsByVariantType)
// ============================================================================

export type OrderInvarianceMismatchType =
  | 'direction_flip'
  | 'exact_flip'
  | 'missing_pair'
  | null;

export type OrderInvarianceReviewStatus = 'APPROVED' | 'REJECTED' | 'PENDING';

export type OrderInvarianceExclusionCount = {
  reason: string;
  count: number;
};

export type OrderInvarianceSummary = {
  status: 'COMPUTED' | 'INSUFFICIENT_DATA';
  matchRate: number | null;
  exactMatchRate: number | null;
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
  presentationEffectMAD: number | null;
  scaleEffectMAD: number | null;
  excludedPairs: OrderInvarianceExclusionCount[];
};

export type OrderInvarianceRow = {
  modelId: string;
  modelLabel: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  majorityVoteBaseline: number | null;
  majorityVoteFlipped: number | null;
  rawScore: number | null;
  mismatchType: OrderInvarianceMismatchType;
  ordinalDistance: number | null;
  isMatch: boolean | null;
  variantType: string | null;
};

export type OrderInvarianceTranscript = {
  id: string;
  runId: string;
  scenarioId: string;
  modelId: string;
  modelVersion: string | null;
  content: unknown;
  decisionCode: string | null;
  decisionCodeSource?: string | null;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  estimatedCost: number | null;
  createdAt: string;
  lastAccessedAt: string | null;
  orderLabel: string;
  attributeALevel: number | null;
  attributeBLevel: number | null;
};

export type OrderInvarianceTranscriptResult = {
  generatedAt: string;
  vignetteId: string;
  vignetteTitle: string;
  modelId: string;
  modelLabel: string;
  conditionKey: string;
  attributeALabel: string | null;
  attributeBLabel: string | null;
  transcripts: OrderInvarianceTranscript[];
};

export type OrderInvarianceResult = {
  generatedAt: string;
  summary: OrderInvarianceSummary;
  modelMetrics: OrderInvarianceModelMetrics[];
  rows: OrderInvarianceRow[];
};

export type OrderInvarianceAnalysisResult = {
  generatedAt: string;
  modelMetrics: OrderInvarianceModelMetrics[];
  rows: Pick<
    OrderInvarianceRow,
    | 'modelId'
    | 'modelLabel'
    | 'vignetteId'
    | 'vignetteTitle'
    | 'conditionKey'
    | 'variantType'
    | 'majorityVoteBaseline'
    | 'majorityVoteFlipped'
    | 'ordinalDistance'
    | 'isMatch'
  >[];
};

export type OrderInvarianceLegacyResult = {
  generatedAt: string;
  summary: OrderInvarianceSummary;
  rows: OrderInvarianceRow[];
};

export type PairLevelMarginSummary = {
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
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

export type OrderInvarianceReviewSummary = {
  totalVignettes: number;
  reviewedVignettes: number;
  approvedVignettes: number;
  rejectedVignettes: number;
  pendingVignettes: number;
  launchReady: boolean;
};

export type OrderInvarianceReviewVignette = {
  pairId: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  conditionPairCount: number;
  sourceScenarioId: string;
  variantScenarioId: string;
  baselineName: string;
  flippedName: string;
  baselineText: string;
  flippedText: string;
  variantType: string | null;
  reviewStatus: OrderInvarianceReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
};

export type OrderInvarianceReviewResult = {
  generatedAt: string;
  summary: OrderInvarianceReviewSummary;
  vignettes: OrderInvarianceReviewVignette[];
};

export type OrderInvarianceLaunchRun = {
  runId: string;
  status: string;
  targetedTrials: number;
  completedTrials: number;
  failedTrials: number;
  percentComplete: number;
  startedAt: string | null;
  completedAt: string | null;
  isStalled: boolean;
};

export type OrderInvarianceLaunchStatus = {
  generatedAt: string;
  totalRuns: number;
  activeRuns: number;
  completedRuns: number;
  failedRuns: number;
  targetedTrials: number;
  completedTrials: number;
  failedTrials: number;
  percentComplete: number;
  isComplete: boolean;
  runs: OrderInvarianceLaunchRun[];
  stalledModels: string[];
  failureSummaries: string[];
};

export type OrderInvarianceAnalysisQueryResult = {
  assumptionsOrderInvariance: OrderInvarianceAnalysisResult;
};

export type OrderInvarianceLegacyQueryResult = {
  assumptionsOrderInvariance: OrderInvarianceLegacyResult;
};

export type OrderInvarianceReviewQueryResult = {
  assumptionsOrderInvarianceReview: OrderInvarianceReviewResult;
};

export type OrderInvarianceTranscriptsQueryResult = {
  assumptionsOrderInvarianceTranscripts: OrderInvarianceTranscriptResult;
};

export type OrderInvarianceLaunchStatusQueryResult = {
  assumptionsOrderInvarianceLaunchStatus: OrderInvarianceLaunchStatus;
};

export type OrderInvarianceQueryVariables = GeneratedOrderInvarianceLegacyQueryVariables;
export type OrderInvarianceTranscriptsQueryVariables = GeneratedOrderInvarianceTranscriptsQueryVariables;
export type OrderInvarianceLaunchStatusQueryVariables = GeneratedOrderInvarianceLaunchStatusQueryVariables;

export type ReviewOrderInvariancePairResult = {
  reviewOrderInvariancePair: {
    pairId: string;
    reviewStatus: Exclude<OrderInvarianceReviewStatus, 'PENDING'>;
    reviewedAt: string;
  };
};

export type LaunchOrderInvarianceResult = {
  launchOrderInvariance: {
    startedRuns: number;
    runsByVariantType: Record<string, number>;
    approvedPairs: number;
    modelCount: number;
    runIds: string[];
    failedDefinitionIds: string[];
  };
};

export type ReviewOrderInvariancePairVariables = GeneratedReviewOrderInvariancePairMutationVariables;
export type LaunchOrderInvarianceVariables = GeneratedLaunchOrderInvarianceMutationVariables;
