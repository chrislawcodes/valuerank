/**
 * reactivate_llm_model MCP Tool
 *
 * Reactivates a deprecated LLM model (sets status back to ACTIVE).
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { reactivateModel, getModelWithProvider } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { logAuditEvent, createLlmAudit } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:reactivate-llm-model');

/**
 * Input schema for reactivate_llm_model tool
 */
const ReactivateLlmModelInputSchema = {
  id: z.string().cuid().describe('ID of the model to reactivate'),
};

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
 * Registers the reactivate_llm_model tool on the MCP server
 */
function registerReactivateLlmModelTool(server: McpServer): void {
  log.info('Registering reactivate_llm_model tool');

  server.registerTool(
    'reactivate_llm_model',
    {
      description: `Reactivate a deprecated LLM model (restore to ACTIVE status).

**What happens:**
- Model status changes from DEPRECATED to ACTIVE
- Model becomes available for selection in new runs
- Does NOT automatically become the default (use set_default_llm_model)

**Use Case:**
Restore a previously deprecated model that is now supported again.

**Example:**
{
  "id": "clxx..."
}`,
      inputSchema: ReactivateLlmModelInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user';

      log.debug({ requestId, id: args.id }, 'reactivate_llm_model called');

      try {
        // Get model with provider for validation and response
        let modelWithProvider;
        try {
          modelWithProvider = await getModelWithProvider(args.id);
        } catch (err) {
          if (err instanceof NotFoundError) {
            return formatError('NOT_FOUND', `Model not found: ${args.id}`);
          }
          throw err;
        }

        // Check if already active
        if (modelWithProvider.status === 'ACTIVE') {
          return formatError(
            'ALREADY_ACTIVE',
            `Model is already active: ${args.id}`,
            {
              modelId: modelWithProvider.modelId,
              providerName: modelWithProvider.provider.name,
            }
          );
        }

        // Reactivate the model
        const model = await reactivateModel(args.id);

        log.info(
          {
            requestId,
            modelId: model.id,
            providerName: modelWithProvider.provider.name,
          },
          'Model reactivated'
        );

        // Audit log
        logAuditEvent(
          createLlmAudit({
            action: 'reactivate_llm_model',
            userId,
            entityId: model.id,
            entityType: 'llm_model',
            requestId,
            details: {
              modelId: model.modelId,
              providerName: modelWithProvider.provider.name,
            },
          })
        );

        return formatSuccess({
          success: true,
          model: {
            id: model.id,
            model_id: model.modelId,
            display_name: model.displayName,
            provider_name: modelWithProvider.provider.name,
            status: model.status.toLowerCase(),
            is_default: model.isDefault,
            cost: {
              input_per_million: Number(model.costInputPerMillion),
              output_per_million: Number(model.costOutputPerMillion),
            },
          },
        });
      } catch (err) {
        log.error({ err, requestId }, 'reactivate_llm_model failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to reactivate model'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerReactivateLlmModelTool);

export { registerReactivateLlmModelTool };
