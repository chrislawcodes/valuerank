/**
 * Worker input construction — scenario fetching, model resolution, and
 * Python worker input assembly.
 */

import { createLogger } from '@valuerank/shared';
import type { Prisma } from '@valuerank/db';
import { db } from '@valuerank/db';
import { LLM_PROVIDERS } from '../../../config/models.js';
import type { ProbeTranscript } from '../../../services/transcript/index.js';

const log = createLogger('queue:probe-scenario');

// Python worker path (relative to cloud/ directory)
export const PROBE_WORKER_PATH = 'workers/probe.py';

/**
 * Python worker input structure.
 */
export type ProbeWorkerInput = {
  runId: string;
  scenarioId: string;
  modelId: string;
  scenario: {
    preamble?: string;
    prompt: string;
    followups: Array<{ label: string; prompt: string }>;
  };
  config: {
    temperature?: number;
    seed?: number;
    maxTokens: number;
    maxTurns: number;
  };
  modelCost?: {
    costInputPerMillion: number;
    costOutputPerMillion: number;
  };
  modelConfig?: Record<string, unknown>;
};

/**
 * Python worker output structure.
 */
export type ProbeWorkerOutput =
  | { success: true; transcript: ProbeTranscript }
  | { success: false; error: { message: string; code: string; retryable: boolean; details?: string } };

// Define the query structure for scenario fetching to ensure type safety
const scenarioQuery = {
  include: {
    definition: {
      select: {
        id: true,
        content: true,
        deletedAt: true,
        preambleVersion: {
          select: {
            content: true,
          },
        },
      },
    },
  },
} as const;

// Derive the type from the query
type ScenarioWithDefinition = Prisma.ScenarioGetPayload<typeof scenarioQuery>;

/**
 * Fetch scenario content from database.
 */
export async function fetchScenario(scenarioId: string): Promise<ScenarioWithDefinition> {
  const scenario = await db.scenario.findUnique({
    where: { id: scenarioId },
    ...scenarioQuery,
  });

  // Allow probing soft-deleted scenarios/definitions so historical runs can be recovered
  // even after newer definition versions have retired old scenarios.
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  if (scenario.deletedAt !== null || scenario.definition.deletedAt !== null) {
    log.warn(
      {
        scenarioId,
        scenarioDeletedAt: scenario.deletedAt?.toISOString() ?? null,
        definitionId: scenario.definition.id,
        definitionDeletedAt: scenario.definition.deletedAt?.toISOString() ?? null,
      },
      'Processing probe against soft-deleted scenario/definition for run recovery'
    );
  }

  return scenario;
}

/**
 * Resolve a model ID to its full API version.
 * E.g., "claude-3-5-haiku" -> "claude-3-5-haiku-20241022"
 */
function resolveModelVersion(modelId: string): string {
  for (const provider of LLM_PROVIDERS) {
    for (const model of provider.models) {
      if (model.id === modelId) {
        return model.defaultVersion ?? modelId;
      }
    }
  }
  // If not found in config, return as-is (might be a full version ID)
  return modelId;
}

/**
 * Model info fetched from database.
 */
type ModelInfo = {
  costInputPerMillion: number;
  costOutputPerMillion: number;
  apiConfig?: Record<string, unknown>;
};

/**
 * Fetch model info (cost and API config) from database.
 */
async function fetchModelInfo(modelId: string): Promise<ModelInfo | null> {
  try {
    const model = await db.llmModel.findFirst({
      where: { modelId },
      select: {
        costInputPerMillion: true,
        costOutputPerMillion: true,
        apiConfig: true,
      },
    });

    if (model) {
      return {
        costInputPerMillion: Number(model.costInputPerMillion),
        costOutputPerMillion: Number(model.costOutputPerMillion),
        apiConfig: model.apiConfig as Record<string, unknown> | undefined,
      };
    }
  } catch (err) {
    log.warn({ modelId, err }, 'Failed to fetch model info, continuing without cost tracking');
  }

  return null;
}

/**
 * Build Python worker input from scenario data.
 */
export async function buildWorkerInput(
  runId: string,
  scenarioId: string,
  modelId: string,
  scenarioContent: unknown,
  definitionContent: unknown,
  definitionPreamble: string | undefined,
  config: { temperature?: number; seed?: number; maxTurns: number; maxTokens?: number }
): Promise<ProbeWorkerInput> {
  // Extract scenario fields (content is JSON in database)
  const content = scenarioContent as Record<string, unknown>;

  // Resolve preamble: Prefer scenario-specific, fallback to definition default
  const preamble = (content.preamble as string) || definitionPreamble;

  // Get prompt from scenario
  const prompt = (content.prompt as string) || '';

  // Get followups from scenario
  const followups = (content.followups as Array<{ label: string; prompt: string }> | undefined) ?? [];

  // Resolve model ID to full API version (e.g., "claude-3-5-haiku" -> "claude-3-5-haiku-20241022")
  const resolvedModelId = resolveModelVersion(modelId);

  // Fetch model info (cost and API config)
  const modelInfo = await fetchModelInfo(resolvedModelId) || await fetchModelInfo(modelId);

  const input: ProbeWorkerInput = {
    runId,
    scenarioId,
    modelId: resolvedModelId,
    scenario: {
      preamble,
      prompt,
      followups,
    },
    config: {
      maxTokens: config.maxTokens ?? 8192, // Default to 8192 to support reasoning models
      maxTurns: config.maxTurns,
      ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
      ...(config.temperature === 0 ? { seed: 42 } : {}),
    },
  };

  if (modelInfo !== null) {
    input.modelCost = {
      costInputPerMillion: modelInfo.costInputPerMillion,
      costOutputPerMillion: modelInfo.costOutputPerMillion,
    };
    if (modelInfo.apiConfig !== undefined) {
      input.modelConfig = modelInfo.apiConfig;
    }
  }

  return input;
}
