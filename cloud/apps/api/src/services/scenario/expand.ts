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
import { getScenarioExpansionModel, isCodeGenerationEnabled } from '../infra-models.js';
import { expandScenariosWithCode } from './expand-code.js';

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

// Debug info from Python worker for troubleshooting
type ExpansionDebugInfo = {
  rawResponse: string | null;
  extractedYaml: string | null;
  parseError: string | null;
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
  debug?: ExpansionDebugInfo;
} | {
  success: false;
  error: {
    message: string;
    code: string;
    retryable: boolean;
    details?: string;
  };
  // Debug info is now included for failed responses too
  debug?: ExpansionDebugInfo & {
    partialTokens?: number;
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

// Default max tokens for scenario expansion (conservative default)
const DEFAULT_MAX_TOKENS = 8192;

/**
 * Get maxTokens from model apiConfig, with conservative default.
 */
function getMaxTokensFromConfig(apiConfig: Record<string, unknown> | null | undefined): number {
  if (!apiConfig) {
    return DEFAULT_MAX_TOKENS;
  }

  const maxTokens = apiConfig.maxTokens;
  if (typeof maxTokens === 'number' && maxTokens > 0) {
    return maxTokens;
  }

  return DEFAULT_MAX_TOKENS;
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

  // Check if code-based generation is enabled
  const useCodeGeneration = await isCodeGenerationEnabled();

  if (useCodeGeneration) {
    log.info({ definitionId }, 'Using code-based scenario expansion');

    // Use code-based combinatorial expansion
    const codeResult = expandScenariosWithCode({
      preamble: content.preamble,
      template: content.template,
      dimensions: rawDimensions as Array<{ name: string; levels: Array<{ score: number; label: string; options?: string[] }> }>,
      matching_rules: content.matching_rules,
    });

    if (!codeResult.success) {
      // This shouldn't happen as code expansion always succeeds
      log.error({ definitionId }, 'Code-based expansion failed unexpectedly');
      throw new Error('Code-based scenario expansion failed');
    }

    // Create scenario records from code expansion result
    const scenarioData = codeResult.scenarios.map((scenario) => ({
      definitionId,
      name: scenario.name,
      content: {
        preamble: scenario.content.preamble,
        prompt: scenario.content.prompt,
        dimensions: scenario.content.dimensions,
      } as ScenarioContent,
    }));

    await db.scenario.createMany({ data: scenarioData });

    // Clear expansion progress and save debug info
    await db.definition.update({
      where: { id: definitionId },
      data: {
        expansionProgress: Prisma.JsonNull,
        expansionDebug: {
          method: 'code-generation',
          timestamp: new Date().toISOString(),
          scenariosCreated: scenarioData.length,
        },
      },
    });

    log.info(
      { definitionId, created: scenarioData.length, deleted: deleteResult.count },
      'Scenarios expanded via code generation'
    );

    return { created: scenarioData.length, deleted: deleteResult.count };
  }

  // Get the configured infrastructure model for scenario expansion
  const infraModel = await getScenarioExpansionModel();
  const fullModelId = `${infraModel.providerName}:${infraModel.modelId}`;

  // Get maxTokens from model config (default to 8K for safety)
  const maxTokens = getMaxTokensFromConfig(infraModel.apiConfig);

  log.info(
    { definitionId, provider: infraModel.providerName, model: infraModel.modelId, fullModelId, maxTokens },
    'Using infrastructure model for scenario expansion'
  );

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
      maxTokens,
    },
    modelConfig: infraModel.apiConfig ?? undefined,
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
      timeout: 900000, // 15 minutes
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

    // Save debug info for spawn failure and clear stale progress
    await db.definition.update({
      where: { id: definitionId },
      data: {
        expansionProgress: Prisma.JsonNull,
        expansionDebug: {
          rawResponse: null,
          extractedYaml: null,
          parseError: `Spawn failure: ${result.error}`,
          stderr: result.stderr,
          timestamp: new Date().toISOString(),
          scenariosCreated: 0,
          modelId: fullModelId,
        },
      },
    });

    // Always throw on spawn failure - don't hide errors with fallback scenarios
    throw new Error(`Scenario expansion failed: ${result.error}`);
  }

  const workerOutput = result.data;

  // Handle worker error
  if (!workerOutput.success) {
    log.error(
      { definitionId, error: workerOutput.error, hasDebug: !!workerOutput.debug },
      'Python worker returned error'
    );

    // Save debug info for worker error and clear stale progress
    // Include partial response from worker if available
    await db.definition.update({
      where: { id: definitionId },
      data: {
        expansionProgress: Prisma.JsonNull,
        expansionDebug: {
          rawResponse: workerOutput.debug?.rawResponse ?? null,
          extractedYaml: workerOutput.debug?.extractedYaml ?? null,
          parseError: `Worker error: ${workerOutput.error.code} - ${workerOutput.error.message}`,
          errorDetails: workerOutput.error.details,
          partialTokens: workerOutput.debug?.partialTokens,
          timestamp: new Date().toISOString(),
          scenariosCreated: 0,
          modelId: fullModelId,
        },
      },
    });

    // Always throw on worker errors - don't hide failures with fallback scenarios
    // Both retryable and non-retryable errors should surface to the user
    throw new Error(`LLM generation failed: ${workerOutput.error.message}`);
  }

  // Handle empty scenarios - this is always an error since we checked for dimensions earlier
  if (workerOutput.scenarios.length === 0) {
    const parseError = workerOutput.debug?.parseError ?? 'No scenarios generated from LLM response';

    log.error(
      { definitionId, parseError, debug: workerOutput.debug },
      'LLM returned content but no scenarios were parsed'
    );

    // Save debug info for troubleshooting
    await db.definition.update({
      where: { id: definitionId },
      data: {
        expansionProgress: Prisma.JsonNull,
        expansionDebug: {
          ...workerOutput.debug,
          timestamp: new Date().toISOString(),
          scenariosCreated: 0,
          modelId: fullModelId,
        },
      },
    });

    // Always throw - empty scenarios is an error when we have dimensions
    throw new Error(`Scenario generation failed: ${parseError}`);
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

  // Clear expansion progress and save debug info after completion
  // Keep debug info even for successful runs to help diagnose issues
  await db.definition.update({
    where: { id: definitionId },
    data: {
      expansionProgress: Prisma.JsonNull,
      expansionDebug: workerOutput.debug ? {
        ...workerOutput.debug,
        timestamp: new Date().toISOString(),
        scenariosCreated: scenarioData.length,
        modelId: fullModelId,
      } : Prisma.JsonNull,
    },
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
