/**
 * list_llm_models MCP Tool
 *
 * Lists all available LLM models with costs and availability status.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAllModelsWithProvider } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:list-llm-models');

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
 * Input schema for list_llm_models tool
 */
const ListLlmModelsInputSchema = {
  provider_id: z.string().cuid().optional().describe('Filter by provider ID'),
  provider_name: z.string().optional().describe('Filter by provider name (e.g., "openai", "anthropic")'),
  status: z
    .enum(['active', 'deprecated', 'all'])
    .optional()
    .default('active')
    .describe('Filter by model status'),
  available_only: z
    .boolean()
    .optional()
    .default(false)
    .describe('Only return models where the API key is configured'),
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
 * Registers the list_llm_models tool on the MCP server
 */
function registerListLlmModelsTool(server: McpServer): void {
  log.info('Registering list_llm_models tool');

  server.registerTool(
    'list_llm_models',
    {
      description: `List all available LLM models with their costs and availability.

**Response includes:**
- Model ID and display name
- Provider information
- Cost per million tokens (input/output)
- Status (active/deprecated) and default flag
- Availability based on configured API keys

**Filters:**
- provider_id: Filter by specific provider UUID
- provider_name: Filter by provider name string
- status: "active" (default), "deprecated", or "all"
- available_only: Only show models with configured API keys

**Use Cases:**
- Find available models for running evaluations
- Compare model costs across providers
- Check which models are configured`,
      inputSchema: ListLlmModelsInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());

      log.debug(
        {
          requestId,
          providerId: args.provider_id,
          providerName: args.provider_name,
          status: args.status,
          availableOnly: args.available_only,
        },
        'list_llm_models called'
      );

      try {
        // Build filters
        const filters: { providerId?: string; status?: 'ACTIVE' | 'DEPRECATED' } = {};
        if (args.provider_id) {
          filters.providerId = args.provider_id;
        }
        if (args.status && args.status !== 'all') {
          filters.status = args.status.toUpperCase() as 'ACTIVE' | 'DEPRECATED';
        }

        let models = await getAllModelsWithProvider(filters);

        // Filter by provider name if specified
        if (args.provider_name) {
          const providerNameLower = args.provider_name.toLowerCase();
          models = models.filter(
            (m) => m.provider.name.toLowerCase() === providerNameLower
          );
        }

        // Add availability info and filter if needed
        const modelsWithAvailability = models.map((model) => ({
          model,
          isAvailable: isProviderAvailable(model.provider.name),
        }));

        // Filter to available only if requested
        const filteredModels = args.available_only
          ? modelsWithAvailability.filter((m) => m.isAvailable)
          : modelsWithAvailability;

        // Format response
        const formattedModels = filteredModels.map(({ model, isAvailable }) => ({
          id: model.id,
          model_id: model.modelId,
          display_name: model.displayName,
          provider: {
            id: model.provider.id,
            name: model.provider.name,
            display_name: model.provider.displayName,
          },
          status: model.status.toLowerCase(),
          is_default: model.isDefault,
          is_available: isAvailable,
          cost: {
            input_per_million: Number(model.costInputPerMillion),
            output_per_million: Number(model.costOutputPerMillion),
          },
        }));

        log.info(
          {
            requestId,
            modelCount: formattedModels.length,
            filters: {
              providerId: args.provider_id,
              providerName: args.provider_name,
              status: args.status,
              availableOnly: args.available_only,
            },
          },
          'Models listed'
        );

        return formatSuccess({
          models: formattedModels,
          total: formattedModels.length,
          filters: {
            provider_id: args.provider_id || null,
            provider_name: args.provider_name || null,
            status: args.status,
            available_only: args.available_only,
          },
        });
      } catch (err) {
        log.error({ err, requestId }, 'list_llm_models failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to list models'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerListLlmModelsTool);

export { registerListLlmModelsTool };
