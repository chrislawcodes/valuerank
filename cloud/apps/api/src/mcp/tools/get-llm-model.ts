/**
 * get_llm_model MCP Tool
 *
 * Gets detailed information about a specific LLM model.
 * Supports lookup by ID or by provider+modelId combination.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getModelWithProvider, getModelByIdentifier } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:get-llm-model');

/**
 * Check if an API key is available for a provider
 */
function isProviderAvailable(providerName: string): boolean {
  const envVarMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    xai: 'XAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    mistral: 'MISTRAL_API_KEY',
  };

  const envVar = envVarMap[providerName.toLowerCase()];
  if (!envVar) return false;

  return !!process.env[envVar];
}

/**
 * Input schema for get_llm_model tool
 * Either id OR (provider_name + model_id) must be provided
 */
const GetLlmModelInputSchema = {
  id: z.string().cuid().optional().describe('ID of the model (alternative to provider_name + model_id)'),
  provider_name: z
    .string()
    .optional()
    .describe('Provider name (e.g., "openai", "anthropic") - use with model_id'),
  model_id: z
    .string()
    .optional()
    .describe('Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet-20241022") - use with provider_name'),
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
 * Registers the get_llm_model tool on the MCP server
 */
function registerGetLlmModelTool(server: McpServer): void {
  log.info('Registering get_llm_model tool');

  server.registerTool(
    'get_llm_model',
    {
      description: `Get detailed information about a specific LLM model.

**Lookup Options:**
1. By UUID: Provide \`id\` parameter
2. By identifier: Provide both \`provider_name\` and \`model_id\`

**Response includes:**
- Model details (ID, display name, status)
- Provider information
- Cost per million tokens
- Availability status based on API key configuration

**Examples:**
- By UUID: \`{"id": "clxx..."}\`
- By identifier: \`{"provider_name": "openai", "model_id": "gpt-4o"}\``,
      inputSchema: GetLlmModelInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());

      log.debug(
        {
          requestId,
          id: args.id,
          providerName: args.provider_name,
          modelId: args.model_id,
        },
        'get_llm_model called'
      );

      try {
        // Validate input - must have either id OR (provider_name + model_id)
        const hasId = !!args.id;
        const hasIdentifier = !!args.provider_name && !!args.model_id;

        if (!hasId && !hasIdentifier) {
          return formatError(
            'INVALID_INPUT',
            'Must provide either id OR both provider_name and model_id',
            { provided: { id: hasId, provider_name: !!args.provider_name, model_id: !!args.model_id } }
          );
        }

        if (hasId && hasIdentifier) {
          return formatError(
            'INVALID_INPUT',
            'Provide either id OR provider_name+model_id, not both'
          );
        }

        // Lookup model
        let model;
        if (hasId) {
          try {
            model = await getModelWithProvider(args.id!);
          } catch (err) {
            if (err instanceof NotFoundError) {
              return formatError('NOT_FOUND', `Model not found: ${args.id}`);
            }
            throw err;
          }
        } else {
          model = await getModelByIdentifier(args.provider_name!, args.model_id!);
          if (!model) {
            return formatError(
              'NOT_FOUND',
              `Model not found: ${args.provider_name}/${args.model_id}`
            );
          }
        }

        // Check availability
        const isAvailable = isProviderAvailable(model.provider.name);

        // Format response
        const response = {
          id: model.id,
          model_id: model.modelId,
          display_name: model.displayName,
          provider: {
            id: model.provider.id,
            name: model.provider.name,
            display_name: model.provider.displayName,
            is_enabled: model.provider.isEnabled,
            rate_limits: {
              max_parallel_requests: model.provider.maxParallelRequests,
              requests_per_minute: model.provider.requestsPerMinute,
            },
          },
          status: model.status.toLowerCase(),
          is_default: model.isDefault,
          is_available: isAvailable,
          cost: {
            input_per_million: Number(model.costInputPerMillion),
            output_per_million: Number(model.costOutputPerMillion),
          },
          created_at: model.createdAt.toISOString(),
          updated_at: model.updatedAt.toISOString(),
        };

        log.info(
          {
            requestId,
            modelId: model.id,
            providerName: model.provider.name,
          },
          'Model retrieved'
        );

        return formatSuccess(response);
      } catch (err) {
        log.error({ err, requestId }, 'get_llm_model failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to get model'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerGetLlmModelTool);

export { registerGetLlmModelTool };
