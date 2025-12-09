import { builder } from '../builder.js';

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

// Type for output data stored in JSONB
type AnalysisOutput = {
  perModel: Record<string, unknown>;
  modelAgreement: Record<string, unknown>;
  dimensionAnalysis?: Record<string, unknown>;
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
        if (!output?.computedAt) return null;
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
      resolve: (analysis) => {
        const output = analysis.output as AnalysisOutput | null;
        return output?.visualizationData ?? null;
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
  }),
});
