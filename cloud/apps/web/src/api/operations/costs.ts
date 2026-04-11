import type {
  EstimateCostQuery as GeneratedEstimateCostQuery,
} from '../../generated/graphql';

// ============================================================================
// TYPES
// ============================================================================

export type CostEstimate = GeneratedEstimateCostQuery['estimateCost'];
export type ModelCostEstimate = GeneratedEstimateCostQuery['estimateCost']['perModel'][number];

// Manual input type — not in the schema
export type EstimateCostInput = {
  definitionId: string;
  models: string[];
  samplePercentage?: number;
  samplesPerScenario?: number;
};

// ============================================================================
// QUERIES
// ============================================================================

export { EstimateCostDocument as ESTIMATE_COST_QUERY } from '../../generated/graphql';

// ============================================================================
// RESULT TYPES
// ============================================================================

export type EstimateCostQueryResult = GeneratedEstimateCostQuery;
