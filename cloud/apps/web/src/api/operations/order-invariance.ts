import { gql } from 'urql';

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

export type OrderInvarianceQueryResult = {
  assumptionsOrderInvariance: OrderInvarianceResult;
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

export type OrderInvarianceQueryVariables = {
  directionOnly?: boolean;
  trimOutliers?: boolean;
};

export type OrderInvarianceTranscriptsQueryVariables = {
  vignetteId: string;
  modelId: string;
  conditionKey: string;
};

export type OrderInvarianceLaunchStatusQueryVariables = {
  runIds: string[];
};

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

export type ReviewOrderInvariancePairVariables = {
  pairId: string;
  reviewStatus: Exclude<OrderInvarianceReviewStatus, 'PENDING'>;
  reviewNotes?: string | null;
};

export type LaunchOrderInvarianceVariables = {
  force?: boolean | null;
};

export const ORDER_INVARIANCE_QUERY = gql`
  query AssumptionsOrderInvariance($directionOnly: Boolean, $trimOutliers: Boolean) {
    assumptionsOrderInvariance(directionOnly: $directionOnly, trimOutliers: $trimOutliers) {
      generatedAt
      summary {
        status
        matchRate
        exactMatchRate
        totalCandidatePairs
        qualifyingPairs
        missingPairs
        comparablePairs
        sensitiveModelCount
        sensitiveVignetteCount
        presentationEffectMAD
        scaleEffectMAD
        excludedPairs {
          reason
          count
        }
      }
      modelMetrics {
        modelId
        modelLabel
        matchRate
        matchCount
        matchEligibleCount
        valueOrderReversalRate
        valueOrderEligibleCount
        valueOrderExcludedCount
        valueOrderPull
        scaleOrderReversalRate
        scaleOrderEligibleCount
        scaleOrderExcludedCount
        scaleOrderPull
        withinCellDisagreementRate
        pairLevelMarginSummary {
          mean
          median
          p25
          p75
        }
      }
      rows {
        modelId
        modelLabel
        vignetteId
        vignetteTitle
        conditionKey
        majorityVoteBaseline
        majorityVoteFlipped
        mismatchType
        ordinalDistance
        isMatch
        variantType
      }
    }
  }
`;

export const ORDER_INVARIANCE_LEGACY_QUERY = gql`
  query AssumptionsOrderInvarianceLegacy($directionOnly: Boolean, $trimOutliers: Boolean) {
    assumptionsOrderInvariance(directionOnly: $directionOnly, trimOutliers: $trimOutliers) {
      generatedAt
      summary {
        status
        matchRate
        exactMatchRate
        totalCandidatePairs
        qualifyingPairs
        missingPairs
        comparablePairs
        sensitiveModelCount
        sensitiveVignetteCount
        presentationEffectMAD
        scaleEffectMAD
        excludedPairs {
          reason
          count
        }
      }
      rows {
        modelId
        modelLabel
        vignetteId
        vignetteTitle
        conditionKey
        majorityVoteBaseline
        majorityVoteFlipped
        mismatchType
        ordinalDistance
        isMatch
        variantType
      }
    }
  }
`;

export const ORDER_INVARIANCE_ANALYSIS_QUERY = gql`
  query AssumptionsOrderInvarianceAnalysis($directionOnly: Boolean, $trimOutliers: Boolean) {
    assumptionsOrderInvariance(directionOnly: $directionOnly, trimOutliers: $trimOutliers) {
      generatedAt
      modelMetrics {
        modelId
        modelLabel
        matchRate
        matchCount
        matchEligibleCount
        valueOrderReversalRate
        valueOrderEligibleCount
        valueOrderExcludedCount
        valueOrderPull
        scaleOrderReversalRate
        scaleOrderEligibleCount
        scaleOrderExcludedCount
        scaleOrderPull
        withinCellDisagreementRate
        pairLevelMarginSummary {
          mean
          median
          p25
          p75
        }
      }
      rows {
        modelId
        modelLabel
        vignetteId
        vignetteTitle
        conditionKey
        majorityVoteBaseline
        majorityVoteFlipped
        ordinalDistance
        isMatch
        variantType
      }
    }
  }
`;

export const ORDER_INVARIANCE_REVIEW_QUERY = gql`
  query AssumptionsOrderInvarianceReview {
    assumptionsOrderInvarianceReview {
      generatedAt
      summary {
        totalVignettes
        reviewedVignettes
        approvedVignettes
        rejectedVignettes
        pendingVignettes
        launchReady
      }
      vignettes {
        pairId
        vignetteId
        vignetteTitle
        conditionKey
        conditionPairCount
        sourceScenarioId
        variantScenarioId
        baselineName
        flippedName
        baselineText
        flippedText
        variantType
        reviewStatus
        reviewedBy
        reviewedAt
        reviewNotes
      }
    }
  }
`;

export const ORDER_INVARIANCE_TRANSCRIPTS_QUERY = gql`
  query AssumptionsOrderInvarianceTranscripts(
    $vignetteId: ID!
    $modelId: String!
    $conditionKey: String!
  ) {
    assumptionsOrderInvarianceTranscripts(
      vignetteId: $vignetteId
      modelId: $modelId
      conditionKey: $conditionKey
    ) {
      generatedAt
      vignetteId
      vignetteTitle
      modelId
      modelLabel
      conditionKey
      attributeALabel
      attributeBLabel
      transcripts {
        id
        runId
        scenarioId
        modelId
        modelVersion
        content
        decisionCode
        decisionCodeSource
        turnCount
        tokenCount
        durationMs
        estimatedCost
        createdAt
        lastAccessedAt
        orderLabel
        attributeALevel
        attributeBLevel
      }
    }
  }
`;

export const ORDER_INVARIANCE_LAUNCH_STATUS_QUERY = gql`
  query AssumptionsOrderInvarianceLaunchStatus($runIds: [ID!]!) {
    assumptionsOrderInvarianceLaunchStatus(runIds: $runIds) {
      generatedAt
      totalRuns
      activeRuns
      completedRuns
      failedRuns
      targetedTrials
      completedTrials
      failedTrials
      percentComplete
      isComplete
      stalledModels
      failureSummaries
      runs {
        runId
        status
        targetedTrials
        completedTrials
        failedTrials
        percentComplete
        startedAt
        completedAt
        isStalled
      }
    }
  }
`;

export const REVIEW_ORDER_INVARIANCE_PAIR_MUTATION = gql`
  mutation ReviewOrderInvariancePair(
    $pairId: ID!
    $reviewStatus: String!
    $reviewNotes: String
  ) {
    reviewOrderInvariancePair(
      pairId: $pairId
      reviewStatus: $reviewStatus
      reviewNotes: $reviewNotes
    ) {
      pairId
      reviewStatus
      reviewedAt
    }
  }
`;

export const LAUNCH_ORDER_INVARIANCE_MUTATION = gql`
  mutation LaunchOrderInvariance($force: Boolean) {
    launchOrderInvariance(force: $force) {
      startedRuns
      runsByVariantType
      approvedPairs
      modelCount
      runIds
      failedDefinitionIds
    }
  }
`;
