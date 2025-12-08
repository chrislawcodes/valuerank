/**
 * start_run MCP Tool
 *
 * Starts an evaluation run with specified models via MCP.
 * Delegates to existing run service for job queuing.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@valuerank/db';
import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import { startRun } from '../../services/run/index.js';
import {
  logAuditEvent,
  createRunAudit,
} from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:start-run');

/**
 * Input schema for start_run tool
 */
const StartRunInputSchema = {
  definition_id: z.string().min(1).describe('ID of the definition to run'),
  models: z.array(z.string().min(1)).min(1).describe('Model IDs to evaluate (at least one)'),
  sample_percentage: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(100)
    .describe('Percentage of scenarios to run (1-100, default 100)'),
  sample_seed: z
    .number()
    .int()
    .optional()
    .describe('Random seed for reproducible sampling'),
  priority: z
    .enum(['LOW', 'NORMAL', 'HIGH'])
    .default('NORMAL')
    .describe('Job priority'),
};

/**
 * Format error response for MCP
 */
function formatError(code: string, message: string, details?: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: code, message, details }, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Format success response for MCP
 */
function formatSuccess(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Estimates cost for a run based on model count and scenario count.
 * This is a rough estimate - actual cost depends on token usage.
 */
function estimateCost(modelCount: number, scenarioCount: number): string {
  // Rough estimate: ~$0.01 per probe (varies by model)
  const estimatedProbes = modelCount * scenarioCount;
  const estimatedCostDollars = estimatedProbes * 0.01;
  return `~$${estimatedCostDollars.toFixed(2)} (${estimatedProbes} probes)`;
}

/**
 * Registers the start_run tool on the MCP server
 */
function registerStartRunTool(server: McpServer): void {
  log.info('Registering start_run tool');

  server.registerTool(
    'start_run',
    {
      description: `Start an evaluation run for a definition.

Queues probe_scenario jobs for each model-scenario combination.
Returns run_id, queued task count, and estimated cost.

Use sample_percentage to run a subset of scenarios:
- 100 (default): All scenarios
- 10: 10% of scenarios (random sample)

Use sample_seed for reproducible sampling across runs.

Example:
{
  "definition_id": "abc123",
  "models": ["openai:gpt-4", "anthropic:claude-3-opus"],
  "sample_percentage": 100
}`,
      inputSchema: StartRunInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user'; // TODO: Extract from auth context when available

      log.debug(
        {
          definitionId: args.definition_id,
          modelCount: args.models.length,
          samplePercentage: args.sample_percentage,
          requestId,
        },
        'start_run called'
      );

      try {
        // Step 1: Validate definition exists and has scenarios (for accurate scenario count)
        const definition = await db.definition.findUnique({
          where: { id: args.definition_id },
          include: {
            scenarios: {
              where: { deletedAt: null },
              select: { id: true },
            },
          },
        });

        if (!definition) {
          log.warn({ requestId, definitionId: args.definition_id }, 'Definition not found');
          return formatError('NOT_FOUND', `Definition not found: ${args.definition_id}`);
        }

        if (definition.deletedAt !== null) {
          log.warn({ requestId, definitionId: args.definition_id }, 'Definition is soft-deleted');
          return formatError('NOT_FOUND', `Definition not found: ${args.definition_id}`);
        }

        if (definition.scenarios.length === 0) {
          log.warn({ requestId, definitionId: args.definition_id }, 'Definition has no scenarios');
          return formatError(
            'VALIDATION_ERROR',
            `Definition has no scenarios. Scenarios may still be generating - check back shortly.`
          );
        }

        // Step 2: Call existing startRun service
        const result = await startRun({
          definitionId: args.definition_id,
          models: args.models,
          samplePercentage: args.sample_percentage,
          sampleSeed: args.sample_seed,
          priority: args.priority,
          userId,
        });

        log.info(
          {
            requestId,
            runId: result.run.id,
            jobCount: result.jobCount,
          },
          'Run started successfully'
        );

        // Step 3: Log audit event
        logAuditEvent(
          createRunAudit({
            userId,
            runId: result.run.id,
            definitionId: args.definition_id,
            requestId,
            models: args.models,
            samplePercentage: args.sample_percentage,
          })
        );

        // Step 4: Calculate estimated cost
        const totalScenarios = definition.scenarios.length;
        const sampledScenarios = Math.ceil((totalScenarios * (args.sample_percentage ?? 100)) / 100);
        const estimatedCost = estimateCost(args.models.length, sampledScenarios);

        // Step 5: Return success response
        return formatSuccess({
          success: true,
          run_id: result.run.id,
          definition_id: args.definition_id,
          queued_task_count: result.jobCount,
          estimated_cost: estimatedCost,
          config: {
            models: args.models,
            sample_percentage: args.sample_percentage,
            sample_seed: args.sample_seed,
            priority: args.priority,
          },
          progress: {
            total: result.run.progress.total,
            completed: result.run.progress.completed,
            failed: result.run.progress.failed,
          },
        });
      } catch (err) {
        log.error({ err, requestId }, 'start_run failed');

        // Handle specific error types
        if (err instanceof NotFoundError) {
          return formatError('NOT_FOUND', err.message);
        }

        if (err instanceof ValidationError) {
          return formatError('VALIDATION_ERROR', err.message);
        }

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to start run'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerStartRunTool);

export { registerStartRunTool };
