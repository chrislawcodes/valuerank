/**
 * MCP Data Formatters
 *
 * Formatters for converting database entities to MCP response shapes.
 * These ensure consistent response formats across all MCP tools.
 */

import type { Definition, Run, Transcript, AnalysisResult } from '@prisma/client';
import type { JsonValue } from '@prisma/client/runtime/library';
import { resolveTranscriptDecisionModel } from '../../graphql/queries/domain/decision-model.js';

export type { DefinitionListItem, RunListItem, RunSummary, TranscriptSummary, DimensionAnalysis } from './formatters-types.js';
import type { DefinitionListItem, RunListItem, RunSummary, TranscriptSummary, DimensionAnalysis } from './formatters-types.js';

/**
 * Helper to safely extract array from JSON value
 */
function safeJsonArray<T>(value: JsonValue | undefined, defaultValue: T[] = []): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return defaultValue;
}

/**
 * Helper to safely extract object from JSON value
 */
function safeJsonObject<T extends Record<string, unknown>>(
  value: JsonValue | undefined
): T | null {
  if (value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)) {
    return value as T;
  }
  return null;
}

/**
 * Formats a Definition entity for MCP list response
 * Note: Definition doesn't have versionLabel in schema, extract from content if available
 */
export function formatDefinitionListItem(
  definition: Definition,
  childCount?: number
): DefinitionListItem {
  // Try to extract versionLabel from content JSON
  const content = safeJsonObject<{ versionLabel?: string }>(definition.content);
  const versionLabel = content?.versionLabel ?? null;

  return {
    id: definition.id,
    name: definition.name,
    versionLabel,
    parentId: definition.parentId,
    createdAt: definition.createdAt.toISOString(),
    ...(childCount !== undefined && { childCount }),
  };
}

/**
 * Run configuration stored in config JSON field
 */
type RunConfig = {
  models?: string[];
  samplePercentage?: number;
};

/**
 * Formats a Run entity for MCP list response
 * Models and samplePercentage are stored in config JSON field
 */
export function formatRunListItem(
  run: Run & { _count?: { transcripts: number } }
): RunListItem {
  // Extract models and samplePercentage from config JSON
  const config = safeJsonObject<RunConfig>(run.config);
  const models = config?.models ?? [];
  const samplePercentage = config?.samplePercentage ?? null;

  // Map RunStatus enum to lowercase string
  const statusMap: Record<string, RunListItem['status']> = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    PAUSED: 'pending', // Map paused to pending for simplicity
    SUMMARIZING: 'running', // Map summarizing to running
    CANCELLED: 'failed', // Map cancelled to failed
  };

  return {
    id: run.id,
    status: statusMap[run.status] ?? 'pending',
    models,
    scenarioCount: run._count?.transcripts ?? 0,
    samplePercentage,
    createdAt: run.createdAt.toISOString(),
  };
}

/**
 * Formats a transcript for MCP summary response
 * Uses the transcript's summary fields (decisionCode, decisionText)
 */
export function formatTranscriptSummary(
  transcript: Transcript & { scenario?: { orientationFlipped?: boolean | null } | null }
): TranscriptSummary {
  // Count words from content if available
  const content = safeJsonObject<{ messages?: Array<{ content?: string }> }>(transcript.content);
  const messages = content?.messages ?? [];
  const wordCount = messages.reduce((total, msg) => {
    const text = typeof msg.content === 'string' ? msg.content : '';
    return total + text.split(/\s+/).filter(Boolean).length;
  }, 0);

  // Extract key reasoning from decisionText if available
  const keyReasoning: string[] = [];
  if (transcript.decisionText !== null && transcript.decisionText !== '') {
    // Split decision text into key points (simple heuristic)
    const points = transcript.decisionText
      .split(/[.\n]/)
      .filter((s) => s.trim().length > 20)
      .slice(0, 3);
    keyReasoning.push(...points);
  }

  const resolved = resolveTranscriptDecisionModel({
    decisionCode: transcript.decisionCode,
    decisionMetadata: transcript.decisionMetadata,
    definitionSnapshot: transcript.definitionSnapshot,
    orientationFlipped: transcript.scenario?.orientationFlipped ?? null,
  });
  const decision = resolved.canonical.direction === 'unknown'
    ? null
    : {
      direction: resolved.canonical.direction,
      strength: resolved.canonical.strength,
      favoredValueKey: resolved.canonical.favoredValueKey,
    };

  return {
    runId: transcript.runId,
    scenarioId: transcript.scenarioId ?? '',
    model: transcript.modelId,
    turnCount: transcript.turnCount,
    wordCount,
    decision,
    keyReasoning,
  };
}

/**
 * Analysis output structure (stored in AnalysisResult.output)
 */
type AnalysisOutput = {
  perModel?: Record<string, {
    sampleSize?: number;
    overall?: { mean?: number; stdDev?: number; min?: number; max?: number };
    /** @deprecated Legacy field — use overall.mean instead */
    meanScore?: number;
    /** @deprecated Legacy field — use overall.stdDev instead */
    stdDev?: number;
  }>;
  modelAgreement?: { averageCorrelation?: number; outlierModels?: string[] };
  mostContestedScenarios?: Array<{ scenarioId: string; variance: number }>;
  insights?: string[];
  llmSummary?: string;
  dimensionAnalysis?: {
    ranked?: Array<{ name: string; effectSize: number }>;
    correlations?: Record<string, number>;
    mostDivisive?: string[];
  };
};

/**
 * Formats analysis results into a run summary
 */
export function formatRunSummary(
  run: Run,
  analysis: AnalysisResult | null,
  transcriptCount: number
): RunSummary {
  // Extract models from config
  const config = safeJsonObject<RunConfig>(run.config);
  const models = config?.models ?? [];

  // Map status
  const statusMap: Record<string, string> = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    PAUSED: 'paused',
    SUMMARIZING: 'summarizing',
    CANCELLED: 'cancelled',
  };

  // Default empty summary structure
  const emptySummary: RunSummary = {
    runId: run.id,
    status: statusMap[run.status] ?? run.status,
    basicStats: {
      modelCount: models.length,
      transcriptCount,
      perModel: {},
    },
    modelAgreement: {
      averageCorrelation: 0,
      outlierModels: [],
    },
    mostContestedScenarios: [],
    analysisStatus: 'pending',
    unresolvable: { total: 0, byModel: [] },
  };

  if (!analysis) {
    return emptySummary;
  }

  // Parse analysis output from JSON field
  const output = safeJsonObject<AnalysisOutput>(analysis.output);

  if (!output) {
    return {
      ...emptySummary,
      analysisStatus: analysis.status === 'CURRENT' ? 'completed' : 'pending',
    };
  }

  // Extract per-model stats
  const perModel: Record<string, { sampleSize: number; meanScore: number; stdDev: number }> = {};
  if (output.perModel) {
    for (const [modelId, stats] of Object.entries(output.perModel)) {
      if (stats !== undefined) {
        const overall = stats.overall;
        perModel[modelId] = {
          sampleSize: typeof stats.sampleSize === 'number' ? stats.sampleSize : 0,
          meanScore: typeof overall?.mean === 'number' ? overall.mean
            : typeof stats.meanScore === 'number' ? stats.meanScore : 0,
          stdDev: typeof overall?.stdDev === 'number' ? overall.stdDev
            : typeof stats.stdDev === 'number' ? stats.stdDev : 0,
        };
      }
    }
  }

  // Extract agreement metrics
  const agreement = output.modelAgreement;
  const averageCorrelation = typeof agreement?.averageCorrelation === 'number'
    ? agreement.averageCorrelation
    : 0;
  const outlierModels = safeJsonArray<string>(agreement?.outlierModels as JsonValue);

  // Extract contested scenarios
  const contested = safeJsonArray<{ scenarioId: string; variance: number }>(
    output.mostContestedScenarios as JsonValue
  );

  // Extract insights
  const insights = output.insights && Array.isArray(output.insights)
    ? output.insights
    : undefined;

  const llmSummary = typeof output.llmSummary === 'string'
    ? output.llmSummary
    : undefined;

  return {
    runId: run.id,
    status: statusMap[run.status] ?? run.status,
    basicStats: {
      modelCount: models.length,
      transcriptCount,
      perModel,
    },
    modelAgreement: {
      averageCorrelation,
      outlierModels,
    },
    mostContestedScenarios: contested.slice(0, 5),
    ...(insights && { insights }),
    ...(llmSummary !== undefined && { llmSummary }),
    analysisStatus: analysis.status === 'CURRENT' ? 'completed' : 'pending',
    unresolvable: { total: 0, byModel: [] },
  };
}

/**
 * Formats dimension analysis from analysis results
 */
export function formatDimensionAnalysis(
  analysis: AnalysisResult | null
): DimensionAnalysis {
  const emptyAnalysis: DimensionAnalysis = {
    rankedDimensions: [],
    correlations: {},
    mostDivisive: [],
  };

  if (!analysis) {
    return emptyAnalysis;
  }

  const output = safeJsonObject<AnalysisOutput>(analysis.output);

  if (!output?.dimensionAnalysis) {
    return emptyAnalysis;
  }

  const dimensions = output.dimensionAnalysis;

  // Extract ranked dimensions (top 10)
  const ranked = safeJsonArray<{ name: string; effectSize: number }>(
    dimensions.ranked as JsonValue
  )
    .slice(0, 10)
    .map((d, i) => ({ ...d, rank: i + 1 }));

  // Extract correlations
  const correlations = dimensions.correlations ?? {};

  // Extract most divisive
  const mostDivisive = safeJsonArray<string>(dimensions.mostDivisive as JsonValue);

  return {
    rankedDimensions: ranked,
    correlations,
    mostDivisive,
  };
}
