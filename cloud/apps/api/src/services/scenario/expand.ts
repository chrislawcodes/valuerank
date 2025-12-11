/**
 * Scenario Expansion Service
 *
 * Generates scenarios from a definition using the Python worker infrastructure.
 * This delegates LLM calls to the Python worker which has robust retry logic,
 * rate limiting, and support for all LLM providers via the database configuration.
 */

import path from 'path';
import { db, Prisma, type DefinitionContent } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { spawnPython, type ProgressUpdate } from '../../queue/spawn.js';
import { getScenarioExpansionModel } from '../infra-models.js';

const log = createLogger('services:scenario:expand');

// Path to Python worker (relative to cloud/ directory)
const GENERATE_SCENARIOS_WORKER = 'workers/generate_scenarios.py';

// Scenario content structure (matches what probe worker expects)
type ScenarioContent = {
  preamble?: string;
  prompt: string;
  followups?: Array<{ label: string; prompt: string }>;
  // Dimension scores (1-5) for each dimension name
  dimensions: Record<string, number>;
};

// Input for Python worker
type GenerateScenariosInput = {
  definitionId: string;
  modelId: string;
  content: {
    preamble?: string;
    template: string;
    dimensions: unknown[];
    matching_rules?: string;
  };
  config: {
    temperature: number;
    maxTokens: number;
  };
  modelConfig?: Record<string, unknown>;
};

// Output from Python worker
type GenerateScenariosOutput = {
  success: true;
  scenarios: Array<{
    name: string;
    content: {
      preamble?: string;
      prompt: string;
      dimensions: Record<string, number>;
    };
  }>;
  metadata: {
    inputTokens: number;
    outputTokens: number;
    modelVersion: string | null;
  };
} | {
  success: false;
  error: {
    message: string;
    code: string;
    retryable: boolean;
    details?: string;
  };
};

export type ExpandScenariosResult = {
  created: number;
  deleted: number;
};

/**
 * Normalize preamble - returns undefined if empty or whitespace-only.
 */
function normalizePreamble(preamble: string | undefined): string | undefined {
  if (!preamble || preamble.trim().length === 0) {
    return undefined;
  }
  return preamble;
}

/**
 * Get model configuration from database for the specified model.
 */
async function getModelConfig(providerName: string, modelId: string): Promise<Record<string, unknown> | undefined> {
  // Find the provider
  const provider = await db.llmProvider.findUnique({
    where: { name: providerName },
  });

  if (!provider) {
    return undefined;
  }

  // Find the model
  const model = await db.llmModel.findUnique({
    where: {
      providerId_modelId: {
        providerId: provider.id,
        modelId: modelId,
      },
    },
  });

  if (!model || !model.apiConfig) {
    return undefined;
  }

  return model.apiConfig as Record<string, unknown>;
}

/**
 * Expands scenarios from a definition's content using the Python worker.
 *
 * - Deletes existing scenarios for the definition (soft delete)
 * - Spawns Python worker to generate scenario combinations via LLM
 * - Creates scenario records from the result
 *
 * @param definitionId - The definition ID
 * @param content - The resolved definition content with template and dimensions
 * @returns Count of created and deleted scenarios
 */
export async function expandScenarios(
  definitionId: string,
  content: DefinitionContent
): Promise<ExpandScenariosResult> {
  log.info({ definitionId }, 'Expanding scenarios via Python worker');

  // Get dimensions
  const rawDimensions = content.dimensions as unknown[] | undefined;

  log.info(
    { definitionId, hasDimensions: !!rawDimensions, dimensionCount: rawDimensions?.length, hasTemplate: !!content.template },
    'Expansion input check'
  );

  // Soft delete existing scenarios first
  const deleteResult = await db.scenario.updateMany({
    where: { definitionId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  // If no dimensions or empty template, create a single default scenario
  if (!rawDimensions || rawDimensions.length === 0 || !content.template) {
    log.debug({ definitionId }, 'No dimensions or template, creating single scenario');

    const scenarioContent: ScenarioContent = {
      preamble: normalizePreamble(content.preamble),
      prompt: content.template || '',
      dimensions: {},
    };

    await db.scenario.create({
      data: {
        definitionId,
        name: 'Default Scenario',
        content: scenarioContent,
      },
    });

    return { created: 1, deleted: deleteResult.count };
  }

  // Get the configured infrastructure model for scenario expansion
  const infraModel = await getScenarioExpansionModel();
  const fullModelId = `${infraModel.providerName}:${infraModel.modelId}`;

  log.info(
    { definitionId, provider: infraModel.providerName, model: infraModel.modelId, fullModelId },
    'Using infrastructure model for scenario expansion'
  );

  // Get model-specific API configuration from database
  const modelConfig = await getModelConfig(infraModel.providerName, infraModel.modelId);

  // Prepare input for Python worker
  const workerInput: GenerateScenariosInput = {
    definitionId,
    modelId: fullModelId,
    content: {
      preamble: content.preamble,
      template: content.template,
      dimensions: rawDimensions,
      matching_rules: content.matching_rules,
    },
    config: {
      temperature: 0.7,
      maxTokens: 8192,
    },
    modelConfig,
  };

  // Spawn Python worker with progress tracking
  const workerPath = path.resolve(process.cwd(), '../..', GENERATE_SCENARIOS_WORKER);

  // Progress callback to update database with expansion status
  const onProgress = async (progress: ProgressUpdate): Promise<void> => {
    try {
      await db.definition.update({
        where: { id: definitionId },
        data: {
          expansionProgress: {
            phase: progress.phase,
            expectedScenarios: progress.expectedScenarios,
            generatedScenarios: progress.generatedScenarios,
            inputTokens: progress.inputTokens,
            outputTokens: progress.outputTokens,
            message: progress.message,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    } catch (err) {
      log.warn({ err, definitionId, progress }, 'Failed to update expansion progress');
    }
  };

  const result = await spawnPython<GenerateScenariosInput, GenerateScenariosOutput>(
    workerPath,
    workerInput,
    {
      timeout: 300000, // 5 minutes
      cwd: path.resolve(process.cwd(), '../..'),
      onProgress,
    }
  );

  // Handle spawn failure
  if (!result.success) {
    log.error(
      { definitionId, error: result.error, stderr: result.stderr },
      'Failed to spawn Python worker'
    );

    // Fallback: create single scenario with raw template
    const scenarioContent: ScenarioContent = {
      preamble: normalizePreamble(content.preamble),
      prompt: content.template,
      dimensions: {},
    };

    await db.scenario.create({
      data: {
        definitionId,
        name: 'Default Scenario',
        content: scenarioContent,
      },
    });

    return { created: 1, deleted: deleteResult.count };
  }

  const workerOutput = result.data;

  // Handle worker error
  if (!workerOutput.success) {
    log.error(
      { definitionId, error: workerOutput.error },
      'Python worker returned error'
    );

    // If retryable, rethrow to trigger job retry
    if (workerOutput.error.retryable) {
      throw new Error(`LLM generation failed: ${workerOutput.error.message}`);
    }

    // Non-retryable: create fallback scenario
    const scenarioContent: ScenarioContent = {
      preamble: normalizePreamble(content.preamble),
      prompt: content.template,
      dimensions: {},
    };

    await db.scenario.create({
      data: {
        definitionId,
        name: 'Default Scenario',
        content: scenarioContent,
      },
    });

    return { created: 1, deleted: deleteResult.count };
  }

  // Handle empty scenarios (dimensions had no values)
  if (workerOutput.scenarios.length === 0) {
    log.debug({ definitionId }, 'Worker returned no scenarios, creating default');

    const scenarioContent: ScenarioContent = {
      preamble: normalizePreamble(content.preamble),
      prompt: content.template,
      dimensions: {},
    };

    await db.scenario.create({
      data: {
        definitionId,
        name: 'Default Scenario',
        content: scenarioContent,
      },
    });

    return { created: 1, deleted: deleteResult.count };
  }

  // Create scenario records from worker output
  const scenarioData = workerOutput.scenarios.map((scenario) => ({
    definitionId,
    name: scenario.name,
    content: {
      preamble: scenario.content.preamble,
      prompt: scenario.content.prompt,
      dimensions: scenario.content.dimensions,
    } as ScenarioContent,
  }));

  await db.scenario.createMany({ data: scenarioData });

  // Clear expansion progress after successful completion
  await db.definition.update({
    where: { id: definitionId },
    data: { expansionProgress: Prisma.JsonNull },
  });

  log.info(
    {
      definitionId,
      created: scenarioData.length,
      deleted: deleteResult.count,
      inputTokens: workerOutput.metadata.inputTokens,
      outputTokens: workerOutput.metadata.outputTokens,
    },
    'Scenarios expanded via Python worker'
  );

  return { created: scenarioData.length, deleted: deleteResult.count };
}
