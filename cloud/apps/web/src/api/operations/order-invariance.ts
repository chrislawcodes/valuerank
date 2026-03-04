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
};

export type OrderInvarianceResult = {
  generatedAt: string;
  summary: OrderInvarianceSummary;
  rows: OrderInvarianceRow[];
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

export type OrderInvarianceQueryResult = {
  assumptionsOrderInvariance: OrderInvarianceResult;
};

export type OrderInvarianceReviewQueryResult = {
  assumptionsOrderInvarianceReview: OrderInvarianceReviewResult;
};

export type OrderInvarianceQueryVariables = {
  directionOnly?: boolean;
  trimOutliers?: boolean;
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
    baselineRunsStarted: number;
    flippedRunsStarted: number;
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
        reviewStatus
        reviewedBy
        reviewedAt
        reviewNotes
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
      baselineRunsStarted
      flippedRunsStarted
      approvedPairs
      modelCount
      runIds
      failedDefinitionIds
    }
  }
`;
