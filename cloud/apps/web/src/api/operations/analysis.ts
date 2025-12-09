import { gql } from 'urql';

// ============================================================================
// TYPES
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
  modelAgreement: ModelAgreement;
  dimensionAnalysis: DimensionAnalysis | null;
  visualizationData: VisualizationData | null;
  mostContestedScenarios: ContestedScenario[];
  methodsUsed: MethodsUsed;
  warnings: AnalysisWarning[];
};

// ============================================================================
// FRAGMENTS
// ============================================================================

export const ANALYSIS_RESULT_FRAGMENT = gql`
  fragment AnalysisResultFields on AnalysisResult {
    id
    runId
    analysisType
    status
    codeVersion
    inputHash
    createdAt
    computedAt
    durationMs
    perModel
    modelAgreement
    dimensionAnalysis
    visualizationData
    mostContestedScenarios {
      scenarioId
      scenarioName
      variance
      modelScores
    }
    methodsUsed
    warnings {
      code
      message
      recommendation
    }
  }
`;

// ============================================================================
// QUERIES
// ============================================================================

export const ANALYSIS_QUERY = gql`
  query Analysis($runId: ID!) {
    analysis(runId: $runId) {
      ...AnalysisResultFields
    }
  }
  ${ANALYSIS_RESULT_FRAGMENT}
`;

export const ANALYSIS_HISTORY_QUERY = gql`
  query AnalysisHistory($runId: ID!, $limit: Int) {
    analysisHistory(runId: $runId, limit: $limit) {
      ...AnalysisResultFields
    }
  }
  ${ANALYSIS_RESULT_FRAGMENT}
`;

// ============================================================================
// MUTATIONS
// ============================================================================

export const RECOMPUTE_ANALYSIS_MUTATION = gql`
  mutation RecomputeAnalysis($runId: ID!) {
    recomputeAnalysis(runId: $runId) {
      ...AnalysisResultFields
    }
  }
  ${ANALYSIS_RESULT_FRAGMENT}
`;

// ============================================================================
// QUERY/MUTATION TYPES
// ============================================================================

export type AnalysisQueryVariables = {
  runId: string;
};

export type AnalysisQueryResult = {
  analysis: AnalysisResult | null;
};

export type AnalysisHistoryQueryVariables = {
  runId: string;
  limit?: number;
};

export type AnalysisHistoryQueryResult = {
  analysisHistory: AnalysisResult[];
};

export type RecomputeAnalysisMutationVariables = {
  runId: string;
};

export type RecomputeAnalysisMutationResult = {
  recomputeAnalysis: AnalysisResult;
};
