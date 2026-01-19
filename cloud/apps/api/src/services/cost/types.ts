/**
 * Cost Service Types
 *
 * Type definitions for cost estimation and token statistics.
 */

// ============================================================================
// TOKEN STATISTICS
// ============================================================================

/**
 * Token statistics for a single model.
 * Retrieved from ModelTokenStatistics table.
 */
export type ModelTokenStats = {
  modelId: string;
  avgInputTokens: number;
  avgOutputTokens: number;
  sampleCount: number;
  lastUpdatedAt: Date;
};

// ============================================================================
// COST ESTIMATES
// ============================================================================

/**
 * Cost estimate for a single model.
 * Calculated from token statistics and model pricing.
 */
export type ModelCostEstimate = {
  modelId: string;
  displayName: string;
  scenarioCount: number;
  inputTokens: number;       // Predicted total input tokens
  outputTokens: number;      // Predicted total output tokens
  inputCost: number;         // Cost for input tokens ($)
  outputCost: number;        // Cost for output tokens ($)
  totalCost: number;         // Total cost ($)
  avgInputPerProbe: number;  // Average input tokens per probe
  avgOutputPerProbe: number; // Average output tokens per probe
  sampleCount: number;       // Probes used to compute average
  isUsingFallback: boolean;  // True if using all-model avg or system default
};

/**
 * Complete cost estimate for a run.
 * Aggregates all model estimates.
 */
export type CostEstimate = {
  total: number;                    // Total cost ($)
  perModel: ModelCostEstimate[];    // Per-model breakdown
  scenarioCount: number;            // Scenarios to run
  basedOnSampleCount: number;       // Min sample count across models
  isUsingFallback: boolean;         // True if any model using fallback
};

// ============================================================================
// ACTUAL COSTS
// ============================================================================

/**
 * Per-model actual cost breakdown.
 */
export type ModelActualCost = {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  probeCount: number;
};

/**
 * Actual cost summary from completed run.
 * Computed from transcript token counts.
 */
export type ActualCost = {
  total: number;
  perModel: Record<string, ModelActualCost>;
};

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Fallback token values when no historical data exists.
 * Based on spec: 100 input / 900 output tokens.
 */
export const FALLBACK_TOKENS = {
  input: 100,
  output: 900,
} as const;

/**
 * Input for cost estimation.
 */
export type EstimateCostInput = {
  definitionId: string;
  modelIds: string[];
  samplePercentage?: number;
  samplesPerScenario?: number; // Multi-sample: number of samples per scenario-model pair
};

/**
 * Input for upsert token statistics.
 */
export type UpsertStatsInput = {
  modelId: string;
  definitionId?: string | null;
  avgInputTokens: number;
  avgOutputTokens: number;
  sampleCount: number;
};
