import { z } from 'zod';

export const zRunSnapshot = z.object({
  _meta: z.object({
    preambleVersionId: z.string().optional(),
    definitionVersion: z.union([z.number(), z.string()]).optional(),
  }).optional(),
  preambleVersionId: z.string().optional(),
  version: z.union([z.number(), z.string()]).optional(),
});

export const zRunConfig = z.object({
  definitionSnapshot: zRunSnapshot.optional(),
  isAggregate: z.boolean().optional(),
  sourceRunIds: z.array(z.string()).optional(),
  transcriptCount: z.number().optional(),
  temperature: z.number().nullable().optional(),
  assumptionKey: z.string().optional(),
}).passthrough();

export type RunConfig = z.infer<typeof zRunConfig>;

const zConfidenceInterval = z.object({
  lower: z.number(),
  upper: z.number(),
  level: z.number(),
  method: z.string(),
});

export const zValueStats = z.object({
  count: z.object({
    prioritized: z.number(),
    deprioritized: z.number(),
    neutral: z.number(),
  }),
  winRate: z.number(),
  confidenceInterval: zConfidenceInterval,
});

export const zModelStats = z.object({
  sampleSize: z.number().optional(),
  values: z.record(zValueStats).optional(),
  overall: z.object({
    mean: z.number(),
    stdDev: z.number(),
    min: z.number(),
    max: z.number(),
  }).optional(),
});

const zVisualizationData = z.object({
  decisionDistribution: z.record(z.record(z.number())).optional(),
  modelScenarioMatrix: z.record(z.record(z.number())).optional(),
  scenarioDimensions: z.record(z.record(z.union([z.number(), z.string()]))).optional(),
}).passthrough();

export const zVarianceStats = z.object({
  sampleCount: z.number(),
  mean: z.number(),
  stdDev: z.number(),
  variance: z.number(),
  min: z.number(),
  max: z.number(),
  range: z.number(),
  scoreCounts: z.record(z.string(), z.number()).optional(),
  direction: z.enum(['A', 'B', 'NEUTRAL']).nullable().optional(),
  directionalAgreement: z.number().nullable().optional(),
  medianSignedDistance: z.number().nullable().optional(),
  iqr: z.number().nullable().optional(),
  neutralShare: z.number().nullable().optional(),
  orientationCorrected: z.boolean().optional(),
});

export const zModelVarianceStats = z.object({
  totalSamples: z.number(),
  uniqueScenarios: z.number(),
  samplesPerScenario: z.number(),
  avgWithinScenarioVariance: z.number(),
  maxWithinScenarioVariance: z.number(),
  consistencyScore: z.number(),
  perScenario: z.record(zVarianceStats),
});

export const zContestedScenario = z.object({
  scenarioId: z.string(),
  variance: z.number(),
}).passthrough();

export const zScenarioVarianceStats = z.object({
  scenarioId: z.string(),
  scenarioName: z.string(),
  modelId: z.string().optional(),
  mean: z.number(),
  stdDev: z.number(),
  variance: z.number(),
  range: z.number(),
  sampleCount: z.number(),
  scoreCounts: z.record(z.string(), z.number()).optional(),
  direction: z.enum(['A', 'B', 'NEUTRAL']).nullable().optional(),
  directionalAgreement: z.number().nullable().optional(),
  medianSignedDistance: z.number().nullable().optional(),
  iqr: z.number().nullable().optional(),
  neutralShare: z.number().nullable().optional(),
  orientationCorrected: z.boolean().optional(),
}).passthrough();

export const zRunVarianceAnalysis = z.object({
  isMultiSample: z.boolean(),
  samplesPerScenario: z.number(),
  perModel: z.record(zModelVarianceStats),
  mostVariableScenarios: z.array(zScenarioVarianceStats).optional(),
  leastVariableScenarios: z.array(zScenarioVarianceStats).optional(),
  orientationCorrectedCount: z.number().optional(),
}).passthrough();

export type RunVarianceAnalysis = z.infer<typeof zRunVarianceAnalysis>;
export type ModelVarianceStats = z.infer<typeof zModelVarianceStats>;
export type VarianceStats = z.infer<typeof zVarianceStats>;
export type ScenarioVarianceStats = z.infer<typeof zScenarioVarianceStats>;

export const zAnalysisOutput = z.object({
  perModel: z.record(zModelStats),
  visualizationData: zVisualizationData.optional(),
  mostContestedScenarios: z.array(zContestedScenario).optional(),
  varianceAnalysis: zRunVarianceAnalysis.optional(),
  modelAgreement: z.unknown().optional(),
}).passthrough();

export type AnalysisOutput = z.infer<typeof zAnalysisOutput>;
export type ModelStats = z.infer<typeof zModelStats>;
export type ContestedScenario = z.infer<typeof zContestedScenario>;

export type AggregateEligibility =
  | 'eligible_same_signature_baseline'
  | 'ineligible_mixed_signature'
  | 'ineligible_run_type'
  | 'ineligible_partial_coverage'
  | 'ineligible_missing_metadata'
  | 'ineligible_missing_repeatability'
  | 'ineligible_model_instability';

export type AggregateMetadata = {
  aggregateEligibility: AggregateEligibility;
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

export type AggregateWorkerTranscript = {
  id: string;
  runId: string;
  modelId: string;
  scenarioId: string;
  sampleIndex: number;
  orientationFlipped: boolean;
  summary: {
    score: number | null;
    values?: Record<string, 'prioritized' | 'deprioritized' | 'neutral'>;
  };
  scenario: {
    name: string;
    dimensions: Record<string, number | string>;
  };
};

export type AggregateWorkerInput = {
  runId: string;
  emitVignetteSemantics: true;
  aggregateSemantics: {
    mode: 'same_signature_v1';
    plannedScenarioIds: string[];
    minRepeatCoverageCount: number;
    minRepeatCoverageShare: number;
    lowCoverageCautionThreshold: number;
    driftWarningThreshold: number;
  };
  transcripts: AggregateWorkerTranscript[];
};

export type AggregateWorkerOutput = {
  success: true;
  analysis: {
    preferenceSummary?: {
      perModel: Record<string, unknown>;
    } | null;
    reliabilitySummary?: {
      perModel: Record<string, unknown>;
    } | null;
    aggregateSemantics?: {
      perModelRepeatCoverage: AggregateMetadata['perModelRepeatCoverage'];
      perModelDrift: AggregateMetadata['perModelDrift'];
    } | null;
  };
} | {
  success: false;
  error: { message: string; code: string; retryable: boolean };
};

export interface DecisionStatsOption {
  mean: number;
  sd: number;
  sem: number;
  n: number;
}

export interface DecisionStats {
  options: Record<number, DecisionStatsOption>;
}

export interface ValueAggregateStatsValue {
  winRateMean: number;
  winRateSem: number;
  winRateSd: number;
}

export interface ValueAggregateStats {
  values: Record<string, ValueAggregateStatsValue>;
}

export type AggregateTranscriptInput = {
  modelId: string;
  scenarioId: string | null;
  decisionCode: string | null;
  scenario: { orientationFlipped: boolean } | null;
};

export type AggregateScenarioInput = {
  id: string;
  name: string;
  content: unknown;
};

export interface AggregatedResult {
  perModel: Record<string, ModelStats>;
  modelAgreement: unknown;
  visualizationData: {
    decisionDistribution: Record<string, Record<string, number>>;
    modelScenarioMatrix: Record<string, Record<string, number>>;
    scenarioDimensions: Record<string, Record<string, number | string>>;
  };
  mostContestedScenarios: ContestedScenario[];
  varianceAnalysis: RunVarianceAnalysis | null;
  decisionStats: Record<string, DecisionStats>;
  valueAggregateStats: Record<string, ValueAggregateStats>;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isAggregatedVisualizationData(
  value: unknown
): value is AggregatedResult['visualizationData'] {
  if (!isPlainObject(value)) return false;
  return (
    isPlainObject(value.decisionDistribution) &&
    isPlainObject(value.modelScenarioMatrix) &&
    isPlainObject(value.scenarioDimensions)
  );
}

export function isRunVarianceAnalysis(value: unknown): value is RunVarianceAnalysis {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.isMultiSample === 'boolean' &&
    typeof value.samplesPerScenario === 'number' &&
    isPlainObject(value.perModel)
  );
}
