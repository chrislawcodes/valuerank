import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { ActualCostRef } from './cost-estimate.js';
import { computeActualCost } from '../../services/cost/estimate.js';

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

function isDimensionValue(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
}

function toDimensionRecord(value: unknown): Record<string, number | string> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const sanitized: Record<string, number | string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isDimensionValue(entry)) continue;
    sanitized[key] = entry;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Types for variance analysis from multi-sample runs
type PerScenarioVarianceStats = {
  sampleCount: number;
  mean: number;
  stdDev: number;
  variance: number;
  min: number;
  max: number;
  range: number;
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
};

type VarianceAnalysisShape = {
  isMultiSample: boolean;
  samplesPerScenario: number;
  perModel: Record<string, ModelVarianceStatsShape>;
  mostVariableScenarios: ScenarioVarianceEntry[];
  leastVariableScenarios: ScenarioVarianceEntry[];
};

// Type for output data stored in JSONB
type AnalysisOutput = {
  perModel: Record<string, unknown>;
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

// Object refs - define separately to avoid type inference issues
export const AnalysisResultRef = builder.objectRef<AnalysisResultShape>('AnalysisResult');
const ContestedScenarioRef = builder.objectRef<ContestedScenarioShape>('ContestedScenario');
const AnalysisWarningRef = builder.objectRef<AnalysisWarningShape>('AnalysisWarning');

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
        const viz = (output?.visualizationData as Record<string, unknown> | null | undefined) ?? null;
        if (!viz) return null;

        // Backfill scenarioDimensions for older analysis results that predate this field.
        if (viz.scenarioDimensions !== undefined) {
          return viz;
        }

        const run = await db.run.findUnique({
          where: { id: analysis.runId },
          select: { definitionId: true },
        });
        if (!run) return viz;

        const scenarios = await db.scenario.findMany({
          where: { definitionId: run.definitionId },
          select: { id: true, name: true, content: true },
        });

        const scenarioDimensions: Record<string, Record<string, number | string>> = {};
        const scenarioNameToId = new Map<string, string>();
        for (const scenario of scenarios) {
          scenarioNameToId.set(scenario.name, scenario.id);
          const content = scenario.content;
          if (content == null || typeof content !== 'object' || Array.isArray(content)) continue;
          const dims = (content as Record<string, unknown>)['dimensions'];
          const validated = toDimensionRecord(dims);
          if (validated) {
            scenarioDimensions[scenario.id] = validated;
          }
        }

        // Some older analysis results use scenario *names* as keys in modelScenarioMatrix.
        // Remap those to scenario IDs so pivot tables can resolve scores.
        const rawMatrix = viz.modelScenarioMatrix;
        let normalizedMatrix: Record<string, Record<string, number>> | undefined;
        if (rawMatrix !== undefined && isPlainObject(rawMatrix)) {
          normalizedMatrix = {};
          for (const [modelId, scenariosValue] of Object.entries(rawMatrix)) {
            if (!isPlainObject(scenariosValue)) continue;
            const outScenarios: Record<string, number> = {};
            for (const [scenarioKey, score] of Object.entries(scenariosValue)) {
              if (typeof score !== 'number' || !Number.isFinite(score)) continue;

              // Prefer already-ID keyed entries.
              if (scenarioDimensions[scenarioKey]) {
                outScenarios[scenarioKey] = score;
                continue;
              }

              const mapped = scenarioNameToId.get(scenarioKey);
              if (mapped !== undefined) {
                outScenarios[mapped] = score;
              }
            }
            normalizedMatrix[modelId] = outScenarios;
          }
        }

        return {
          ...viz,
          scenarioDimensions,
          ...(normalizedMatrix ? { modelScenarioMatrix: normalizedMatrix } : {}),
        };
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
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        return output?.varianceAnalysis ?? null;
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
