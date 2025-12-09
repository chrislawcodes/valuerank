/**
 * create_llm_model MCP Tool
 *
 * Creates a new LLM model for a provider.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createModel, getProviderById, getModelByIdentifier } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { logAuditEvent, createLlmAudit } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:create-llm-model');

/**
 * Input schema for create_llm_model tool
 */
const CreateLlmModelInputSchema = {
  provider_id: z.string().cuid().describe('ID of the provider this model belongs to'),
  model_id: z
    .string()
    .min(1)
    .max(100)
    .describe('Unique model identifier (e.g., "gpt-4o", "claude-3-5-sonnet-20241022")'),
  display_name: z
    .string()
    .min(1)
    .max(100)
    .describe('Human-readable display name (e.g., "GPT-4o", "Claude 3.5 Sonnet")'),
  cost_input_per_million: z
    .number()
    .min(0)
    .describe('Cost per million input tokens in dollars'),
  cost_output_per_million: z
    .number()
    .min(0)
    .describe('Cost per million output tokens in dollars'),
  set_as_default: z
    .boolean()
    .optional()
    .default(false)
    .describe('Set this model as the default for its provider'),
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
 * Registers the create_llm_model tool on the MCP server
 */
function registerCreateLlmModelTool(server: McpServer): void {
  log.info('Registering create_llm_model tool');

  server.registerTool(
    'create_llm_model',
    {
      description: `Create a new LLM model for a provider.

**Required fields:**
- provider_id: UUID of existing provider
- model_id: Unique identifier (must match provider's API model name)
- display_name: Human-readable name
- cost_input_per_million: Cost in dollars per million input tokens
- cost_output_per_million: Cost in dollars per million output tokens

**Optional:**
- set_as_default: Make this the default model for the provider

**Validation:**
- Provider must exist
- model_id must be unique within the provider

**Example:**
{
  "provider_id": "clxx...",
  "model_id": "gpt-4o-mini",
  "display_name": "GPT-4o Mini",
  "cost_input_per_million": 0.15,
  "cost_output_per_million": 0.60
}`,
      inputSchema: CreateLlmModelInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user';

      log.debug(
        {
          requestId,
          providerId: args.provider_id,
          modelId: args.model_id,
        },
        'create_llm_model called'
      );

      try {
        // Validate provider exists
        let providerName: string;
        try {
          const provider = await getProviderById(args.provider_id);
          providerName = provider.name;
        } catch (err) {
          if (err instanceof NotFoundError) {
            return formatError('PROVIDER_NOT_FOUND', `Provider not found: ${args.provider_id}`);
          }
          throw err;
        }

        // Check for duplicate model_id
        const existing = await getModelByIdentifier(providerName, args.model_id);
        if (existing) {
          return formatError(
            'DUPLICATE_MODEL_ID',
            `Model already exists: ${providerName}/${args.model_id}`,
            { existingModelId: existing.id }
          );
        }

        // Create the model
        const model = await createModel({
          providerId: args.provider_id,
          modelId: args.model_id,
          displayName: args.display_name,
          costInputPerMillion: args.cost_input_per_million,
          costOutputPerMillion: args.cost_output_per_million,
          setAsDefault: args.set_as_default,
        });

        log.info(
          {
            requestId,
            modelId: model.id,
            providerId: args.provider_id,
            modelIdentifier: args.model_id,
          },
          'Model created'
        );

        // Audit log
        logAuditEvent(
          createLlmAudit({
            action: 'create_llm_model',
            userId,
            entityId: model.id,
            entityType: 'llm_model',
            requestId,
            details: {
              providerId: args.provider_id,
              providerName,
              modelId: args.model_id,
              setAsDefault: args.set_as_default,
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
            provider_name: providerName,
            status: model.status.toLowerCase(),
            is_default: model.isDefault,
            cost: {
              input_per_million: Number(model.costInputPerMillion),
              output_per_million: Number(model.costOutputPerMillion),
            },
            created_at: model.createdAt.toISOString(),
          },
        });
      } catch (err) {
        log.error({ err, requestId }, 'create_llm_model failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to create model'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerCreateLlmModelTool);

export { registerCreateLlmModelTool };
