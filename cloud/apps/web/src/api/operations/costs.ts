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
  samplesPerScenario?: number;
};

// ============================================================================
// QUERIES
// ============================================================================

export const ESTIMATE_COST_QUERY = gql`
  query EstimateCost($definitionId: ID!, $models: [String!]!, $samplePercentage: Int, $samplesPerScenario: Int) {
    estimateCost(definitionId: $definitionId, models: $models, samplePercentage: $samplePercentage, samplesPerScenario: $samplesPerScenario) {
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

// ============================================================================
// RESULT TYPES
// ============================================================================

export type EstimateCostQueryResult = {
  estimateCost: CostEstimate;
};
