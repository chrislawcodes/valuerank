import {
  buildScenarioAnalysisDimensionRecord,
  normalizeScenarioAnalysisMetadata,
} from '../../services/analysis/scenario-metadata.js';
import {
  resolveAnalysisDecisionModel,
  resolveAnalysisValueOutcomes,
} from '../../services/decision-model.js';

export type TranscriptData = {
  id: string;
  modelId: string;
  scenarioId: string;
  sampleIndex: number; // Multi-sample: index within sample set (0 to N-1)
  orientationFlipped: boolean;
  decisionModelV2: {
    raw: unknown;
    canonical: unknown;
  } | null;
  summary: {
    values?: Record<string, 'prioritized' | 'deprioritized' | 'neutral'>;
  };
  scenario: {
    name: string;
    dimensions: Record<string, number | string>; // Canonical analysis dimensions for grouping/effects
  };
};

export type AnalyzeWorkerInput = {
  runId: string;
  emitVignetteSemantics: boolean;
  transcripts: TranscriptData[];
};

export type AnalysisOutput = {
  perModel: Record<string, unknown>;
  preferenceSummary?: {
    perModel: Record<string, unknown>;
  } | null;
  reliabilitySummary?: {
    perModel: Record<string, unknown>;
  } | null;
  modelAgreement: Record<string, unknown>;
  dimensionAnalysis: Record<string, unknown>;
  visualizationData?: Record<string, unknown>;
  varianceAnalysis: {
    isMultiSample: boolean;
    samplesPerScenario: number;
    perModel: Record<string, unknown>;
    mostVariableScenarios: Array<Record<string, unknown>>;
    leastVariableScenarios: Array<Record<string, unknown>>;
  };
  mostContestedScenarios: Array<{
    scenarioId: string;
    scenarioName: string;
    variance: number;
    modelScores: Record<string, number>;
  }>;
  methodsUsed: Record<string, unknown>;
  warnings: Array<{
    code: string;
    message: string;
    recommendation: string;
  }>;
  computedAt: string;
  durationMs: number;
};

export type AnalyzeWorkerOutput =
  | { success: true; analysis: AnalysisOutput }
  | { success: false; error: { message: string; code: string; retryable: boolean } };

type RunMetaForAnalysis = {
  definitionId: string | null;
  config: unknown;
  tags: Array<{ tag: { name: string } }>;
};

type TranscriptForAnalysis = {
  id: string;
  modelId: string;
  scenarioId: string | null;
  sampleIndex: number;
  decisionCode: string | null;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  scenario: {
    id: string;
    name: string;
    orientationFlipped: boolean | null;
    content: unknown;
  } | null;
};

const BASELINE_COMPATIBLE_ASSUMPTION_KEYS = new Set(['temp_zero_determinism']);

function getAssumptionKey(configValue: unknown): string | null {
  if (configValue == null || typeof configValue !== 'object') return null;
  const value = (configValue as Record<string, unknown>).assumptionKey;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function hasAssumptionRunTag(tags: Array<{ tag: { name: string } }>): boolean {
  return tags.some((entry) => entry.tag.name === 'assumption-run');
}

export function isBaselineCompatibleRun(
  configValue: unknown,
  tags: Array<{ tag: { name: string } }>,
): boolean {
  const assumptionKey = getAssumptionKey(configValue);
  if (assumptionKey === null) {
    return !hasAssumptionRunTag(tags);
  }

  return BASELINE_COMPATIBLE_ASSUMPTION_KEYS.has(assumptionKey);
}

export async function buildTranscriptDataForAnalysis(params: {
  transcripts: TranscriptForAnalysis[];
  runMeta: RunMetaForAnalysis | null;
  useDecisionModelV2: boolean;
  valueA: string | null;
  valueB: string | null;
}): Promise<{
  transcriptData: TranscriptData[];
  scenarioDimensions: Record<string, Record<string, number | string>>;
  emitVignetteSemantics: boolean;
}> {
  const emitVignetteSemantics = isBaselineCompatibleRun(
    params.runMeta?.config ?? null,
    params.runMeta?.tags ?? [],
  );

  const scenarioDimensions: Record<string, Record<string, number | string>> = {};
  const transcriptData: TranscriptData[] = params.transcripts
    .filter((t) => t.scenario !== null && t.scenarioId !== null)
    .map((t) => {
      const scenario = t.scenario;
      if (scenario === null) {
        throw new Error(`Scenario not found for transcript ${t.id}`);
      }
      const scenarioContent = scenario.content as Record<string, unknown> | null;
      const normalizedScenarioMetadata = normalizeScenarioAnalysisMetadata(scenarioContent);
      const dimensions = buildScenarioAnalysisDimensionRecord(normalizedScenarioMetadata);

      if (normalizedScenarioMetadata) {
        scenarioDimensions[scenario.id] = normalizedScenarioMetadata.groupingDimensions;
      }

      const orientationFlipped = scenario.orientationFlipped ?? false;
      const decisionModel = resolveAnalysisDecisionModel(
        {
          decisionCode: t.decisionCode,
          decisionMetadata: t.decisionMetadata,
          definitionSnapshot: t.definitionSnapshot,
          orientationFlipped,
        },
        params.useDecisionModelV2,
      );
      const values = resolveAnalysisValueOutcomes(
        {
          decisionCode: t.decisionCode,
          decisionMetadata: t.decisionMetadata,
          definitionSnapshot: t.definitionSnapshot,
          orientationFlipped,
        },
        params.valueA,
        params.valueB,
      );

      return {
        id: t.id,
        modelId: t.modelId,
        scenarioId: t.scenarioId as string,
        sampleIndex: t.sampleIndex,
        orientationFlipped,
        decisionModelV2: decisionModel
          ? {
              raw: decisionModel.raw,
              canonical: decisionModel.canonical,
            }
          : null,
        summary: values ? { values } : {},
        scenario: {
          name: t.scenario!.name,
          dimensions,
        },
      };
    });

  return { transcriptData, scenarioDimensions, emitVignetteSemantics };
}
