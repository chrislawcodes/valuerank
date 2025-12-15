/**
 * list_llm_providers MCP Tool
 *
 * Lists all available LLM providers with their settings and model counts.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAllProvidersWithModels } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:list-llm-providers');

/**
 * Input schema for list_llm_providers tool
 */
const ListLlmProvidersInputSchema = {
  include_models: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include detailed model information for each provider (increases response size)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe('Maximum number of providers to return (default: 50, max: 100)'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of providers to skip for pagination (default: 0)'),
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
 * Registers the list_llm_providers tool on the MCP server
 */
function registerListLlmProvidersTool(server: McpServer): void {
  log.info('Registering list_llm_providers tool');

  server.registerTool(
    'list_llm_providers',
    {
      description: `List all available LLM providers with their settings.

**Response includes:**
- Provider name and display name
- Rate limit settings (max_parallel_requests, requests_per_minute)
- Enabled status
- Model count and optionally model details

**Use Cases:**
- Discover available providers before running evaluations
- Check rate limit settings
- Find providers for specific models

Supports pagination via limit and offset parameters.`,
      inputSchema: ListLlmProvidersInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const includeModels = args.include_models ?? false;

      log.debug({ requestId, includeModels }, 'list_llm_providers called');

      try {
        const allProviders = await getAllProvidersWithModels();

        // Apply pagination
        const limit = args.limit ?? 50;
        const offset = args.offset ?? 0;
        const providers = allProviders.slice(offset, offset + limit);
        const totalCount = allProviders.length;

        // Format response
        const formattedProviders = providers.map((provider) => {
          const activeModels = provider.models.filter((m) => m.status === 'ACTIVE');
          const defaultModel = provider.models.find((m) => m.isDefault);

          const base = {
            id: provider.id,
            name: provider.name,
            display_name: provider.displayName,
            is_enabled: provider.isEnabled,
            rate_limits: {
              max_parallel_requests: provider.maxParallelRequests,
              requests_per_minute: provider.requestsPerMinute,
            },
            model_count: {
              total: provider.models.length,
              active: activeModels.length,
            },
            default_model: defaultModel
              ? {
                  id: defaultModel.id,
                  model_id: defaultModel.modelId,
                  display_name: defaultModel.displayName,
                }
              : null,
          };

          // Include full model list if requested
          if (includeModels) {
            return {
              ...base,
              models: provider.models.map((model) => ({
                id: model.id,
                model_id: model.modelId,
                display_name: model.displayName,
                status: model.status.toLowerCase(),
                is_default: model.isDefault,
                cost: {
                  input_per_million: Number(model.costInputPerMillion),
                  output_per_million: Number(model.costOutputPerMillion),
                },
              })),
            };
          }

          return base;
        });

        log.info(
          {
            requestId,
            providerCount: formattedProviders.length,
            includeModels,
          },
          'Providers listed'
        );

        return formatSuccess({
          providers: formattedProviders,
          total: totalCount,
          returned: formattedProviders.length,
          pagination: {
            limit,
            offset,
            has_more: offset + limit < totalCount,
          },
          include_models: includeModels,
        });
      } catch (err) {
        log.error({ err, requestId }, 'list_llm_providers failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to list providers'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerListLlmProvidersTool);

export { registerListLlmProvidersTool };
