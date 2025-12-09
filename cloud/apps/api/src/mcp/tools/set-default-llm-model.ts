/**
 * set_default_llm_model MCP Tool
 *
 * Sets a model as the default for its provider.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { setDefaultModel, getModelWithProvider } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { logAuditEvent, createLlmAudit } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:set-default-llm-model');

/**
 * Input schema for set_default_llm_model tool
 */
const SetDefaultLlmModelInputSchema = {
  id: z.string().cuid().describe('ID of the model to set as default'),
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
 * Registers the set_default_llm_model tool on the MCP server
 */
function registerSetDefaultLlmModelTool(server: McpServer): void {
  log.info('Registering set_default_llm_model tool');

  server.registerTool(
    'set_default_llm_model',
    {
      description: `Set a model as the default for its provider.

**What happens:**
- The specified model becomes the default for its provider
- The previous default (if any) is demoted
- Each provider can have only one default model

**Validation:**
- Model must exist
- Model must be ACTIVE (not DEPRECATED)

**Use Case:**
Change which model is used when no specific model is requested.

**Example:**
{
  "id": "clxx..."
}

**Response:**
Returns the new default model and the previous default (if changed).`,
      inputSchema: SetDefaultLlmModelInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user';

      log.debug({ requestId, id: args.id }, 'set_default_llm_model called');

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

        // Check if already default
        if (modelWithProvider.isDefault) {
          return formatSuccess({
            success: true,
            message: 'Model is already the default',
            model: {
              id: modelWithProvider.id,
              model_id: modelWithProvider.modelId,
              display_name: modelWithProvider.displayName,
              provider_name: modelWithProvider.provider.name,
              status: modelWithProvider.status.toLowerCase(),
              is_default: true,
            },
            previous_default: null,
          });
        }

        // Check if model is active
        if (modelWithProvider.status !== 'ACTIVE') {
          return formatError(
            'MODEL_NOT_ACTIVE',
            `Cannot set deprecated model as default: ${args.id}`,
            {
              modelId: modelWithProvider.modelId,
              status: modelWithProvider.status.toLowerCase(),
            }
          );
        }

        // Set as default
        const { model, previousDefault } = await setDefaultModel(args.id);

        log.info(
          {
            requestId,
            modelId: model.id,
            previousDefaultId: previousDefault?.id,
            providerName: modelWithProvider.provider.name,
          },
          'Default model set'
        );

        // Audit log
        logAuditEvent(
          createLlmAudit({
            action: 'set_default_llm_model',
            userId,
            entityId: model.id,
            entityType: 'llm_model',
            requestId,
            details: {
              modelId: model.modelId,
              providerName: modelWithProvider.provider.name,
              previousDefaultModelId: previousDefault?.id || null,
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
            is_default: boolean;
          };
          previous_default: {
            id: string;
            model_id: string;
            display_name: string;
          } | null;
        } = {
          success: true,
          model: {
            id: model.id,
            model_id: model.modelId,
            display_name: model.displayName,
            provider_name: modelWithProvider.provider.name,
            status: model.status.toLowerCase(),
            is_default: model.isDefault,
          },
          previous_default: previousDefault
            ? {
                id: previousDefault.id,
                model_id: previousDefault.modelId,
                display_name: previousDefault.displayName,
              }
            : null,
        };

        return formatSuccess(response);
      } catch (err) {
        log.error({ err, requestId }, 'set_default_llm_model failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to set default model'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerSetDefaultLlmModelTool);

export { registerSetDefaultLlmModelTool };
