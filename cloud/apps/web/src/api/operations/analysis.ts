// ============================================================================
// TYPES (manual — JSON scalar fields need typed shapes)
// ============================================================================

export type ContestedScenario = {
  scenarioId: string;
  scenarioName: string;
  variance: number;
  modelScores: Record<string, number>;
};

export type AnalysisWarning = {
  code: string;
  message: string;
  recommendation: string;
};

export type ConfidenceInterval = {
  lower: number;
  upper: number;
  level: number;
  method: string;
};

export type ValueStats = {
  winRate: number;
  confidenceInterval: ConfidenceInterval;
  count: {
    prioritized: number;
    deprioritized: number;
    neutral: number;
  };
};

export type ModelOverallStats = {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
};

export type PerModelStats = {
  sampleSize: number;
  values: Record<string, ValueStats>;
  overall: ModelOverallStats;
};

export type PairwiseAgreement = {
  spearmanRho: number;
  pValue: number;
  pValueCorrected: number;
  significant: boolean;
  effectSize: number;
  effectInterpretation: string;
};

export type ModelAgreement = {
  pairwise: Record<string, PairwiseAgreement>;
  outlierModels: string[];
  overallAgreement: number;
};

export type DimensionStats = {
  effectSize: number;
  rank: number;
  pValue: number;
  significant: boolean;
};

export type DimensionAnalysis = {
  dimensions: Record<string, DimensionStats>;
  varianceExplained: number;
  method: string;
};

export type MethodsUsed = {
  winRateCI: string;
  modelComparison: string;
  pValueCorrection: string;
  effectSize: string;
  dimensionTest: string;
  alpha: number;
  codeVersion: string;
};

export type VisualizationData = {
  decisionDistribution: Record<string, Record<string, number>>;
  modelScenarioMatrix: Record<string, Record<string, number>>;
  scenarioDimensions?: Record<string, Record<string, string | number>>;
};

// Variance analysis from multi-sample runs (samplesPerScenario > 1)
export type ScenarioVarianceStats = {
  scenarioId: string;
  scenarioName: string;
  modelId?: string;
  mean: number;
  stdDev: number;
  variance: number;
  range: number;
  sampleCount: number;
  scoreCounts?: Record<string, number>;
  direction?: 'A' | 'B' | 'NEUTRAL' | null;
  directionalAgreement?: number | null;
  medianSignedDistance?: number | null;
  iqr?: number | null;
  neutralShare?: number | null;
  orientationCorrected?: boolean;
};

export type PerScenarioVarianceStats = {
  sampleCount: number;
  mean: number;
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  scoreCounts?: Record<string, number>;
  direction?: 'A' | 'B' | 'NEUTRAL' | null;
  directionalAgreement?: number | null;
  medianSignedDistance?: number | null;
  iqr?: number | null;
  neutralShare?: number | null;
  orientationCorrected?: boolean;
};

export type ModelVarianceStats = {
  totalSamples: number;
  uniqueScenarios: number;
  samplesPerScenario: number;
  avgWithinScenarioVariance: number;
  maxWithinScenarioVariance: number;
  consistencyScore: number;
  perScenario: Record<string, PerScenarioVarianceStats>;
};

export type VarianceAnalysis = {
  isMultiSample: boolean;
  samplesPerScenario: number;
  perModel: Record<string, ModelVarianceStats>;
  mostVariableScenarios: ScenarioVarianceStats[];
  leastVariableScenarios: ScenarioVarianceStats[];
  orientationCorrectedCount?: number;
};

export type RawPreferenceSummary = {
  perModel: unknown;
};

export type RawReliabilitySummary = {
  perModel: unknown;
};

export type AggregateMetadata = {
  aggregateEligibility:
    | 'eligible_same_signature_baseline'
    | 'ineligible_mixed_signature'
    | 'ineligible_run_type'
    | 'ineligible_partial_coverage'
    | 'ineligible_missing_metadata'
    | 'ineligible_missing_repeatability'
    | 'ineligible_model_instability';
  aggregateIneligibilityReason: string | null;
  sourceRunCount: number;
  sourceRunIds: string[];
  conditionCoverage: {
    plannedConditionCount: number;
    observedConditionCount: number;
    complete: boolean;
  };
  perModelRepeatCoverage: Record<string, {
    repeatCoverageCount: number;
    repeatCoverageShare: number;
    contributingRunCount: number;
  }>;
  perModelDrift: Record<string, {
    weightedOverallSignedCenterSd: number | null;
    exceedsWarningThreshold: boolean;
  }>;
};

export type AnalysisResult = {
  id: string;
  runId: string;
  analysisType: string;
  status: 'CURRENT' | 'SUPERSEDED';
  codeVersion: string;
  inputHash: string;
  createdAt: string;
  computedAt: string | null;
  durationMs: number | null;
  perModel: Record<string, PerModelStats>;
  preferenceSummary?: RawPreferenceSummary | null;
  reliabilitySummary?: RawReliabilitySummary | null;
  aggregateMetadata?: AggregateMetadata | null;
  modelAgreement: ModelAgreement;
  dimensionAnalysis: DimensionAnalysis | null;
  visualizationData: VisualizationData | null;
  varianceAnalysis: VarianceAnalysis | null;
  mostContestedScenarios: ContestedScenario[];
  methodsUsed: MethodsUsed;
  warnings: AnalysisWarning[];
};

// ============================================================================
// FRAGMENTS
// ============================================================================

export { AnalysisResultFieldsFragmentDoc as ANALYSIS_RESULT_FRAGMENT } from '../../generated/graphql';

// ============================================================================
// QUERIES
// ============================================================================

export { AnalysisDocument as ANALYSIS_QUERY } from '../../generated/graphql';

// ============================================================================
// MUTATIONS
// ============================================================================

export { RecomputeAnalysisDocument as RECOMPUTE_ANALYSIS_MUTATION } from '../../generated/graphql';

// ============================================================================
// QUERY/MUTATION TYPES (manual — preserves app-level types without __typename)
// ============================================================================

export type AnalysisQueryVariables = {
  runId: string;
};

export type AnalysisQueryResult = {
  analysis: AnalysisResult | null;
};

export type RecomputeAnalysisMutationVariables = {
  runId: string;
};

export type RecomputeAnalysisMutationResult = {
  recomputeAnalysis: AnalysisResult;
};
