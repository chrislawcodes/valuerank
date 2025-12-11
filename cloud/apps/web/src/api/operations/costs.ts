import { gql } from 'urql';

// ============================================================================
// TYPES
// ============================================================================

export type ModelCostEstimate = {
  modelId: string;
  displayName: string;
  scenarioCount: number;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  avgInputPerProbe: number;
  avgOutputPerProbe: number;
  sampleCount: number;
  isUsingFallback: boolean;
};

export type CostEstimate = {
  total: number;
  perModel: ModelCostEstimate[];
  scenarioCount: number;
  basedOnSampleCount: number;
  isUsingFallback: boolean;
  fallbackReason: string | null;
};

export type ModelTokenStats = {
  modelId: string;
  avgInputTokens: number;
  avgOutputTokens: number;
  sampleCount: number;
  lastUpdatedAt: string;
};

export type EstimateCostInput = {
  definitionId: string;
  models: string[];
  samplePercentage?: number;
};

// ============================================================================
// QUERIES
// ============================================================================

export const ESTIMATE_COST_QUERY = gql`
  query EstimateCost($definitionId: ID!, $models: [String!]!, $samplePercentage: Int) {
    estimateCost(definitionId: $definitionId, models: $models, samplePercentage: $samplePercentage) {
      total
      scenarioCount
      basedOnSampleCount
      isUsingFallback
      fallbackReason
      perModel {
        modelId
        displayName
        scenarioCount
        inputTokens
        outputTokens
        inputCost
        outputCost
        totalCost
        avgInputPerProbe
        avgOutputPerProbe
        sampleCount
        isUsingFallback
      }
    }
  }
`;

export const MODEL_TOKEN_STATS_QUERY = gql`
  query ModelTokenStats($modelIds: [String!]) {
    modelTokenStats(modelIds: $modelIds) {
      modelId
      avgInputTokens
      avgOutputTokens
      sampleCount
      lastUpdatedAt
    }
  }
`;

export const ALL_MODEL_TOKEN_AVERAGE_QUERY = gql`
  query AllModelTokenAverage {
    allModelTokenAverage {
      modelId
      avgInputTokens
      avgOutputTokens
      sampleCount
    }
  }
`;

// ============================================================================
// RESULT TYPES
// ============================================================================

export type EstimateCostQueryResult = {
  estimateCost: CostEstimate;
};

export type ModelTokenStatsQueryResult = {
  modelTokenStats: ModelTokenStats[];
};

export type AllModelTokenAverageQueryResult = {
  allModelTokenAverage: ModelTokenStats | null;
};
