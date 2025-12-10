/**
 * update_llm_model MCP Tool
 *
 * Updates an existing LLM model's mutable properties.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { updateModel, getModelById } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { logAuditEvent, createLlmAudit } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:update-llm-model');

/**
 * Input schema for update_llm_model tool
 */
const UpdateLlmModelInputSchema = {
  id: z.string().cuid().describe('ID of the model to update'),
  display_name: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe('New human-readable display name'),
  cost_input_per_million: z
    .number()
    .min(0)
    .optional()
    .describe('New cost per million input tokens in dollars'),
  cost_output_per_million: z
    .number()
    .min(0)
    .optional()
    .describe('New cost per million output tokens in dollars'),
  api_config: z
    .record(z.unknown())
    .optional()
    .nullable()
    .describe('Provider-specific API configuration (e.g., {"maxTokensParam": "max_completion_tokens"} for newer OpenAI models). Set to null to clear.'),
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
 * Registers the update_llm_model tool on the MCP server
 */
function registerUpdateLlmModelTool(server: McpServer): void {
  log.info('Registering update_llm_model tool');

  server.registerTool(
    'update_llm_model',
    {
      description: `Update an existing LLM model's properties.

**Mutable fields:**
- display_name: Human-readable name
- cost_input_per_million: Cost per million input tokens
- cost_output_per_million: Cost per million output tokens
- api_config: Provider-specific API configuration (JSON object)

**Immutable fields (cannot be changed):**
- model_id: The API model identifier
- provider_id: The provider association

**Validation:**
- Model must exist
- At least one field must be provided

**api_config options:**
- maxTokensParam: Parameter name for max tokens (e.g., "max_completion_tokens" for gpt-5.1, o1, o3)

**Example:**
{
  "id": "clxx...",
  "display_name": "GPT-4o Updated",
  "cost_input_per_million": 2.50
}

**Example with api_config (for newer OpenAI models):**
{
  "id": "clxx...",
  "api_config": {"maxTokensParam": "max_completion_tokens"}
}`,
      inputSchema: UpdateLlmModelInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user';

      log.debug(
        {
          requestId,
          id: args.id,
          hasDisplayName: !!args.display_name,
          hasCostInput: args.cost_input_per_million !== undefined,
          hasCostOutput: args.cost_output_per_million !== undefined,
          hasApiConfig: args.api_config !== undefined,
        },
        'update_llm_model called'
      );

      try {
        // Check if any fields are being updated
        const hasUpdates =
          args.display_name !== undefined ||
          args.cost_input_per_million !== undefined ||
          args.cost_output_per_million !== undefined ||
          args.api_config !== undefined;

        if (!hasUpdates) {
          return formatError(
            'NO_UPDATES',
            'At least one field must be provided to update',
            { mutableFields: ['display_name', 'cost_input_per_million', 'cost_output_per_million', 'api_config'] }
          );
        }

        // Get current model state for audit
        let previousState;
        try {
          previousState = await getModelById(args.id);
        } catch (err) {
          if (err instanceof NotFoundError) {
            return formatError('NOT_FOUND', `Model not found: ${args.id}`);
          }
          throw err;
        }

        // Build update data
        const updateData: {
          displayName?: string;
          costInputPerMillion?: number;
          costOutputPerMillion?: number;
          apiConfig?: Record<string, unknown> | null;
        } = {};

        if (args.display_name !== undefined) {
          updateData.displayName = args.display_name;
        }
        if (args.cost_input_per_million !== undefined) {
          updateData.costInputPerMillion = args.cost_input_per_million;
        }
        if (args.cost_output_per_million !== undefined) {
          updateData.costOutputPerMillion = args.cost_output_per_million;
        }
        if (args.api_config !== undefined) {
          updateData.apiConfig = args.api_config;
        }

        // Update the model
        const model = await updateModel(args.id, updateData);

        log.info(
          {
            requestId,
            modelId: model.id,
            updatedFields: Object.keys(updateData),
          },
          'Model updated'
        );

        // Audit log
        logAuditEvent(
          createLlmAudit({
            action: 'update_llm_model',
            userId,
            entityId: model.id,
            entityType: 'llm_model',
            requestId,
            details: {
              previousState: {
                displayName: previousState.displayName,
                costInputPerMillion: Number(previousState.costInputPerMillion),
                costOutputPerMillion: Number(previousState.costOutputPerMillion),
                apiConfig: previousState.apiConfig,
              },
              newState: {
                displayName: model.displayName,
                costInputPerMillion: Number(model.costInputPerMillion),
                costOutputPerMillion: Number(model.costOutputPerMillion),
                apiConfig: model.apiConfig,
              },
              updatedFields: Object.keys(updateData),
            },
          })
        );

        return formatSuccess({
          success: true,
          model: {
            id: model.id,
            model_id: model.modelId,
            display_name: model.displayName,
            provider_id: model.providerId,
            status: model.status.toLowerCase(),
            is_default: model.isDefault,
            cost: {
              input_per_million: Number(model.costInputPerMillion),
              output_per_million: Number(model.costOutputPerMillion),
            },
            api_config: model.apiConfig,
            updated_at: model.updatedAt.toISOString(),
          },
          updated_fields: Object.keys(updateData),
        });
      } catch (err) {
        log.error({ err, requestId }, 'update_llm_model failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to update model'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerUpdateLlmModelTool);

export { registerUpdateLlmModelTool };
