import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { ActualCostRef } from './cost-estimate.js';
import { computeActualCost } from '../../services/cost/estimate.js';
import { normalizeAnalysisArtifacts } from '../../services/analysis/normalize-analysis-output.js';

// Shape definitions for internal types
type ContestedScenarioShape = {
  scenarioId: string;
  scenarioName: string;
  variance: number;
  modelScores: Record<string, number>;
};

type AnalysisWarningShape = {
  code: string;
  message: string;
  recommendation: string;
};

type AnalysisResultShape = {
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
type VisualizationDataShape = {
  decisionDistribution: Record<string, Record<string, number>>;
  modelScenarioMatrix: Record<string, Record<string, number>>;
};

// Types for variance analysis from multi-sample runs
type PerScenarioVarianceStats = {
  sampleCount: number;
  mean: number;
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  // Directional stability fields (optional - populated by Waves 2 and 3)
  scoreCounts?: Record<string, number>;
  direction?: 'A' | 'B' | 'NEUTRAL' | null;
  directionalAgreement?: number | null;
  medianSignedDistance?: number | null;
  iqr?: number | null;
  neutralShare?: number | null;
  orientationCorrected?: boolean;
};

type ModelVarianceStatsShape = {
  totalSamples: number;
  uniqueScenarios: number;
  samplesPerScenario: number;
  avgWithinScenarioVariance: number;
  maxWithinScenarioVariance: number;
  consistencyScore: number;
  perScenario: Record<string, PerScenarioVarianceStats>;
};

type ScenarioVarianceEntry = {
  scenarioId: string;
  scenarioName: string;
  modelId?: string;
  variance: number;
  stdDev: number;
  range: number;
  sampleCount: number;
  mean: number;
  scoreCounts?: Record<string, number>;
  direction?: 'A' | 'B' | 'NEUTRAL' | null;
  directionalAgreement?: number | null;
  medianSignedDistance?: number | null;
  iqr?: number | null;
  neutralShare?: number | null;
  orientationCorrected?: boolean;
};

type VarianceAnalysisShape = {
  isMultiSample: boolean;
  samplesPerScenario: number;
  orientationCorrectedCount?: number;
  perModel: Record<string, ModelVarianceStatsShape>;
  mostVariableScenarios: ScenarioVarianceEntry[];
  leastVariableScenarios: ScenarioVarianceEntry[];
};

type PreferenceSummaryShape = {
  perModel: Record<string, unknown>;
};

type ReliabilitySummaryShape = {
  perModel: Record<string, unknown>;
};

type AggregateMetadataShape = {
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
type AnalysisOutput = {
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

type NormalizedArtifacts = {
  visualizationData: Record<string, unknown> | null;
  varianceAnalysis: Record<string, unknown> | null;
};

async function getNormalizedArtifacts(
  analysis: AnalysisResultShape,
  output: AnalysisOutput | null
): Promise<NormalizedArtifacts> {
  const rawVisualizationData = (output?.visualizationData as Record<string, unknown> | null | undefined) ?? null;
  const rawVarianceAnalysis = (output?.varianceAnalysis as Record<string, unknown> | null | undefined) ?? null;

  if (!rawVisualizationData && !rawVarianceAnalysis) {
    return {
      visualizationData: rawVisualizationData,
      varianceAnalysis: rawVarianceAnalysis,
    };
  }

  const run = await db.run.findUnique({
    where: { id: analysis.runId },
    select: { definitionId: true },
  });
  if (!run) {
    return {
      visualizationData: rawVisualizationData,
      varianceAnalysis: rawVarianceAnalysis,
    };
  }

  const scenarios = await db.scenario.findMany({
    where: { definitionId: run.definitionId },
    select: { id: true, name: true, content: true },
  });

  return normalizeAnalysisArtifacts({
    visualizationData: rawVisualizationData,
    varianceAnalysis: rawVarianceAnalysis,
    scenarios,
  });
}

// Object refs - define separately to avoid type inference issues
export const AnalysisResultRef = builder.objectRef<AnalysisResultShape>('AnalysisResult');
const ContestedScenarioRef = builder.objectRef<ContestedScenarioShape>('ContestedScenario');
const AnalysisWarningRef = builder.objectRef<AnalysisWarningShape>('AnalysisWarning');
const PreferenceSummaryRef = builder.objectRef<PreferenceSummaryShape>('PreferenceSummary');
const ReliabilitySummaryRef = builder.objectRef<ReliabilitySummaryShape>('ReliabilitySummary');
const AggregateMetadataRef = builder.objectRef<AggregateMetadataShape>('AggregateMetadata');

// AnalysisStatus enum is defined in enums.ts - reference by string name

// Contested Scenario type implementation
builder.objectType(ContestedScenarioRef, {
  description: 'A scenario with high disagreement across models',
  fields: (t) => ({
    scenarioId: t.exposeString('scenarioId'),
    scenarioName: t.exposeString('scenarioName'),
    variance: t.exposeFloat('variance'),
    modelScores: t.expose('modelScores', { type: 'JSON' }),
  }),
});

// Analysis Warning type implementation
builder.objectType(AnalysisWarningRef, {
  description: 'Warning about statistical assumptions or data quality',
  fields: (t) => ({
    code: t.exposeString('code'),
    message: t.exposeString('message'),
    recommendation: t.exposeString('recommendation'),
  }),
});

builder.objectType(PreferenceSummaryRef, {
  description: 'Explicit preference summary for vignette analysis semantics',
  fields: (t) => ({
    perModel: t.expose('perModel', {
      type: 'JSON',
      description: 'Per-model preference direction and strength summary',
    }),
  }),
});

builder.objectType(ReliabilitySummaryRef, {
  description: 'Explicit baseline reliability summary for vignette analysis semantics',
  fields: (t) => ({
    perModel: t.expose('perModel', {
      type: 'JSON',
      description: 'Per-model baseline noise and reliability summary',
    }),
  }),
});

builder.objectType(AggregateMetadataRef, {
  description: 'Eligibility and coverage metadata for same-signature aggregate analysis support',
  fields: (t) => ({
    aggregateEligibility: t.exposeString('aggregateEligibility'),
    aggregateIneligibilityReason: t.exposeString('aggregateIneligibilityReason', { nullable: true }),
    sourceRunCount: t.exposeInt('sourceRunCount'),
    sourceRunIds: t.exposeStringList('sourceRunIds'),
    conditionCoverage: t.expose('conditionCoverage', {
      type: 'JSON',
      description: 'Coverage of the planned baseline condition set',
    }),
    perModelRepeatCoverage: t.expose('perModelRepeatCoverage', {
      type: 'JSON',
      description: 'Per-model pooled repeat coverage metadata',
    }),
    perModelDrift: t.expose('perModelDrift', {
      type: 'JSON',
      description: 'Per-model pooled cross-run drift metadata',
    }),
  }),
});

// Main AnalysisResult type implementation
builder.objectType(AnalysisResultRef, {
  description: 'Analysis results for a run',
  fields: (t) => ({
    id: t.exposeID('id'),
    runId: t.exposeString('runId'),
    analysisType: t.exposeString('analysisType'),
    status: t.exposeString('status', {
      description: 'Status of the analysis result (CURRENT or SUPERSEDED)',
    }),
    codeVersion: t.exposeString('codeVersion'),
    inputHash: t.exposeString('inputHash'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),

    // Computed from output field
    computedAt: t.field({
      type: 'DateTime',
      nullable: true,
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        if (output?.computedAt === undefined || output.computedAt === null || output.computedAt === '') return null;
        return new Date(output.computedAt);
      },
    }),

    durationMs: t.field({
      type: 'Int',
      nullable: true,
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        return output?.durationMs ?? null;
      },
    }),

    // Structured output fields
    perModel: t.field({
      type: 'JSON',
      description: 'Per-model statistics with win rates and confidence intervals',
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        return output?.perModel ?? {};
      },
    }),

    preferenceSummary: t.field({
      type: PreferenceSummaryRef,
      nullable: true,
      description: 'Explicit preference direction and strength summary',
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        return output?.preferenceSummary ?? null;
      },
    }),

    reliabilitySummary: t.field({
      type: ReliabilitySummaryRef,
      nullable: true,
      description: 'Explicit baseline noise and reliability summary',
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        return output?.reliabilitySummary ?? null;
      },
    }),

    aggregateMetadata: t.field({
      type: AggregateMetadataRef,
      nullable: true,
      description: 'Eligibility and repeat-coverage metadata for aggregate analysis rows',
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        return output?.aggregateMetadata ?? null;
      },
    }),

    modelAgreement: t.field({
      type: 'JSON',
      description: 'Model agreement matrix with pairwise correlations',
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        return output?.modelAgreement ?? {};
      },
    }),

    dimensionAnalysis: t.field({
      type: 'JSON',
      nullable: true,
      description: 'Dimension impact analysis showing which variables drive variance',
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        return output?.dimensionAnalysis ?? null;
      },
    }),

    visualizationData: t.field({
      type: 'JSON',
      nullable: true,
      description: 'Data for frontend visualizations (decision distribution, model-scenario matrix)',
      resolve: async (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        const normalized = await getNormalizedArtifacts(analysis, output);
        return normalized.visualizationData;
      },
    }),

    mostContestedScenarios: t.field({
      type: [ContestedScenarioRef],
      description: 'Scenarios with highest disagreement across models',
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        return output?.mostContestedScenarios ?? [];
      },
    }),

    methodsUsed: t.field({
      type: 'JSON',
      description: 'Statistical methods and parameters used in analysis',
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        return output?.methodsUsed ?? {};
      },
    }),

    warnings: t.field({
      type: [AnalysisWarningRef],
      description: 'Warnings about statistical assumptions or data quality',
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        return output?.warnings ?? [];
      },
    }),

    varianceAnalysis: t.field({
      type: 'JSON',
      nullable: true,
      description: 'Variance analysis from multi-sample runs (when samplesPerScenario > 1)',
      resolve: async (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        const normalized = await getNormalizedArtifacts(analysis, output);
        return normalized.varianceAnalysis;
      },
    }),

    // Actual cost computed from transcripts
    actualCost: t.field({
      type: ActualCostRef,
      nullable: true,
      description: 'Actual cost computed from completed transcripts for this run',
      resolve: async (analysis) => {
        // Get all transcripts for this run
        const transcripts = await db.transcript.findMany({
          where: { runId: analysis.runId },
          select: {
            modelId: true,
            content: true,
          },
        });

        if (transcripts.length === 0) {
          return null;
        }

        // Compute actual cost from transcripts
        const actualCost = await computeActualCost(transcripts);

        // Transform perModel from Record<string, ModelActualCost> to array with modelId
        const perModel = Object.entries(actualCost.perModel).map(([modelId, cost]) => ({
          modelId,
          inputTokens: cost.inputTokens,
          outputTokens: cost.outputTokens,
          cost: cost.cost,
          probeCount: cost.probeCount,
        }));

        return {
          total: actualCost.total,
          perModel,
        };
      },
    }),
  }),
});
