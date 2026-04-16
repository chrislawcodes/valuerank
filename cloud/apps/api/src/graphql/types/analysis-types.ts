// Shape definitions for analysis output types
// Extracted from analysis.ts to keep file sizes under 400 lines.

export type ContestedScenarioShape = {
  scenarioId: string;
  scenarioName: string;
  variance: number;
  modelScores: Record<string, number>;
};

export type AnalysisWarningShape = {
  code: string;
  message: string;
  recommendation: string;
};

export type AnalysisResultShape = {
  id: string;
  runId: string;
  analysisType: string;
  status: string;
  inputHash: string;
  codeVersion: string;
  output: unknown;
  createdAt: Date;
};

// Type for visualization data
export type VisualizationDataShape = {
  decisionDistribution: Record<string, Record<string, number>>;
  modelScenarioMatrix: Record<string, Record<string, number>>;
};

// Types for variance analysis from multi-sample runs
export type PerScenarioVarianceStats = {
  sampleCount: number;
  mean: number;
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  // Directional stability fields (optional - populated by Waves 2 and 3)
  directionCounts?: Record<string, number>;
  direction?: 'A' | 'B' | 'NEUTRAL' | null;
  directionalAgreement?: number | null;
  medianSignedDistance?: number | null;
  iqr?: number | null;
  neutralShare?: number | null;
  orientationCorrected?: boolean;
};

export type ModelVarianceStatsShape = {
  totalSamples: number;
  uniqueScenarios: number;
  samplesPerScenario: number;
  avgWithinScenarioVariance: number;
  maxWithinScenarioVariance: number;
  consistencyScore: number;
  perScenario: Record<string, PerScenarioVarianceStats>;
};

export type ScenarioVarianceEntry = {
  scenarioId: string;
  scenarioName: string;
  modelId?: string;
  variance: number;
  stdDev: number;
  range: number;
  sampleCount: number;
  mean: number;
  directionCounts?: Record<string, number>;
  direction?: 'A' | 'B' | 'NEUTRAL' | null;
  directionalAgreement?: number | null;
  medianSignedDistance?: number | null;
  iqr?: number | null;
  neutralShare?: number | null;
  orientationCorrected?: boolean;
};

export type VarianceAnalysisShape = {
  isMultiSample: boolean;
  samplesPerScenario: number;
  orientationCorrectedCount?: number;
  perModel: Record<string, ModelVarianceStatsShape>;
  mostVariableScenarios: ScenarioVarianceEntry[];
  leastVariableScenarios: ScenarioVarianceEntry[];
};

export type PreferenceSummaryShape = {
  perModel: Record<string, unknown>;
};

export type ReliabilitySummaryShape = {
  perModel: Record<string, unknown>;
};

export type AggregateMetadataShape = {
  aggregateEligibility: string;
  aggregateIneligibilityReason: string | null;
  sourceRunCount: number;
  sourceRunIds: string[];
  conditionCoverage: {
    plannedConditionCount: number;
    observedConditionCount: number;
    complete: boolean;
  };
  perModelRepeatCoverage: Record<string, unknown>;
  perModelDrift: Record<string, unknown>;
};

// Type for output data stored in JSONB
export type AnalysisOutput = {
  perModel: Record<string, unknown>;
  preferenceSummary?: PreferenceSummaryShape | null;
  reliabilitySummary?: ReliabilitySummaryShape | null;
  aggregateMetadata?: AggregateMetadataShape | null;
  modelAgreement: Record<string, unknown>;
  dimensionAnalysis?: Record<string, unknown>;
  varianceAnalysis?: VarianceAnalysisShape;
  visualizationData?: VisualizationDataShape;
  mostContestedScenarios: ContestedScenarioShape[];
  methodsUsed: Record<string, unknown>;
  warnings: AnalysisWarningShape[];
  computedAt: string;
  durationMs: number;
};

export type NormalizedArtifacts = {
  visualizationData: Record<string, unknown> | null;
  varianceAnalysis: Record<string, unknown> | null;
};
