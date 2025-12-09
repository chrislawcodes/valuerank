/**
 * deprecate_llm_model MCP Tool
 *
 * Deprecates an LLM model (sets status to DEPRECATED).
 * If the model was the default, promotes another active model.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { deprecateModel, getModelWithProvider } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { logAuditEvent, createLlmAudit } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:deprecate-llm-model');

/**
 * Input schema for deprecate_llm_model tool
 */
const DeprecateLlmModelInputSchema = {
  id: z.string().cuid().describe('ID of the model to deprecate'),
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
 * Registers the deprecate_llm_model tool on the MCP server
 */
function registerDeprecateLlmModelTool(server: McpServer): void {
  log.info('Registering deprecate_llm_model tool');

  server.registerTool(
    'deprecate_llm_model',
    {
      description: `Deprecate an LLM model (mark as no longer recommended for use).

**What happens:**
- Model status changes from ACTIVE to DEPRECATED
- If this was the default model, another active model is promoted
- Deprecated models still appear in listings with status "deprecated"
- Existing runs using this model are not affected

**Use Case:**
Mark models that are being phased out or have known issues.

**Example:**
{
  "id": "clxx..."
}

**Response:**
Returns the deprecated model and the new default (if one was promoted).`,
      inputSchema: DeprecateLlmModelInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user';

      log.debug({ requestId, id: args.id }, 'deprecate_llm_model called');

      try {
        // Get model with provider for response
        let modelWithProvider;
        try {
          modelWithProvider = await getModelWithProvider(args.id);
        } catch (err) {
          if (err instanceof NotFoundError) {
            return formatError('NOT_FOUND', `Model not found: ${args.id}`);
          }
          throw err;
        }

        // Check if already deprecated
        if (modelWithProvider.status === 'DEPRECATED') {
          return formatError(
            'ALREADY_DEPRECATED',
            `Model is already deprecated: ${args.id}`,
            {
              modelId: modelWithProvider.modelId,
              providerName: modelWithProvider.provider.name,
            }
          );
        }

        const wasDefault = modelWithProvider.isDefault;

        // Deprecate the model
        const { model, newDefault } = await deprecateModel(args.id);

        log.info(
          {
            requestId,
            modelId: model.id,
            wasDefault,
            newDefaultId: newDefault?.id,
          },
          'Model deprecated'
        );

        // Audit log
        logAuditEvent(
          createLlmAudit({
            action: 'deprecate_llm_model',
            userId,
            entityId: model.id,
            entityType: 'llm_model',
            requestId,
            details: {
              modelId: modelWithProvider.modelId,
              providerName: modelWithProvider.provider.name,
              wasDefault,
              newDefaultModelId: newDefault?.id || null,
            },
          })
        );

        const response: {
          success: boolean;
          model: {
            id: string;
            model_id: string;
            display_name: string;
            provider_name: string;
            status: string;
            was_default: boolean;
          };
          new_default?: {
            id: string;
            model_id: string;
            display_name: string;
          };
        } = {
          success: true,
          model: {
            id: model.id,
            model_id: model.modelId,
            display_name: model.displayName,
            provider_name: modelWithProvider.provider.name,
            status: model.status.toLowerCase(),
            was_default: wasDefault,
          },
        };

        if (newDefault) {
          response.new_default = {
            id: newDefault.id,
            model_id: newDefault.modelId,
            display_name: newDefault.displayName,
          };
        }

        return formatSuccess(response);
      } catch (err) {
        log.error({ err, requestId }, 'deprecate_llm_model failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to deprecate model'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerDeprecateLlmModelTool);

export { registerDeprecateLlmModelTool };
