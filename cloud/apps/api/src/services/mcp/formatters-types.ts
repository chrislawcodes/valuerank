export type DefinitionListItem = {
  id: string;
  name: string;
  versionLabel: string | null;
  parentId: string | null;
  createdAt: string;
  childCount?: number;
};

export type RunListItem = {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  models: string[];
  scenarioCount: number;
  samplePercentage: number | null;
  createdAt: string;
};

export type RunSummary = {
  runId: string;
  status: string;
  basicStats: {
    modelCount: number;
    transcriptCount: number;
    perModel: Record<string, {
      sampleSize: number;
      meanScore: number;
      stdDev: number;
    }>;
  };
  modelAgreement: {
    averageCorrelation: number;
    outlierModels: string[];
  };
  mostContestedScenarios: Array<{
    scenarioId: string;
    variance: number;
  }>;
  insights?: string[];
  llmSummary?: string;
  analysisStatus: 'pending' | 'completed' | 'failed';
  unresolvable: { total: number; byModel: { modelId: string; count: number }[] };
};

export type TranscriptSummary = {
  runId: string;
  scenarioId: string;
  model: string;
  turnCount: number;
  wordCount: number;
  decision: {
    direction: string;
    strength: string;
    favoredValueKey: string | null;
  } | null;
  keyReasoning: string[];
};

export type DimensionAnalysis = {
  rankedDimensions: Array<{
    name: string;
    effectSize: number;
    rank: number;
  }>;
  correlations: Record<string, number>;
  mostDivisive: string[];
};
