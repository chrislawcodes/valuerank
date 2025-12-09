/**
 * update_llm_provider MCP Tool
 *
 * Updates an LLM provider's settings (rate limits, enabled status).
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { updateProvider, getProviderById } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';
import { logAuditEvent, createLlmAudit } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:update-llm-provider');

/**
 * Input schema for update_llm_provider tool
 */
const UpdateLlmProviderInputSchema = {
  id: z.string().cuid().describe('ID of the provider to update'),
  max_parallel_requests: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum concurrent requests to this provider'),
  requests_per_minute: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .optional()
    .describe('Rate limit: requests per minute'),
  is_enabled: z
    .boolean()
    .optional()
    .describe('Whether this provider is enabled for use'),
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
 * Registers the update_llm_provider tool on the MCP server
 */
function registerUpdateLlmProviderTool(server: McpServer): void {
  log.info('Registering update_llm_provider tool');

  server.registerTool(
    'update_llm_provider',
    {
      description: `Update an LLM provider's settings.

**Mutable fields:**
- max_parallel_requests: Concurrent request limit (1-100)
- requests_per_minute: Rate limit (1-10000)
- is_enabled: Enable/disable the provider

**Immutable fields (cannot be changed):**
- name: The provider identifier (e.g., "openai")
- display_name: Human-readable name

**Validation:**
- Provider must exist
- At least one field must be provided

**Use Cases:**
- Adjust rate limits based on API tier
- Temporarily disable a provider
- Increase parallelism for batch operations

**Example:**
{
  "id": "clxx...",
  "max_parallel_requests": 10,
  "requests_per_minute": 500
}`,
      inputSchema: UpdateLlmProviderInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user';

      log.debug(
        {
          requestId,
          id: args.id,
          hasMaxParallel: args.max_parallel_requests !== undefined,
          hasRpm: args.requests_per_minute !== undefined,
          hasEnabled: args.is_enabled !== undefined,
        },
        'update_llm_provider called'
      );

      try {
        // Check if any fields are being updated
        const hasUpdates =
          args.max_parallel_requests !== undefined ||
          args.requests_per_minute !== undefined ||
          args.is_enabled !== undefined;

        if (!hasUpdates) {
          return formatError(
            'NO_UPDATES',
            'At least one field must be provided to update',
            { mutableFields: ['max_parallel_requests', 'requests_per_minute', 'is_enabled'] }
          );
        }

        // Get current provider state for audit
        let previousState;
        try {
          previousState = await getProviderById(args.id);
        } catch (err) {
          if (err instanceof NotFoundError) {
            return formatError('NOT_FOUND', `Provider not found: ${args.id}`);
          }
          throw err;
        }

        // Build update data
        const updateData: {
          maxParallelRequests?: number;
          requestsPerMinute?: number;
          isEnabled?: boolean;
        } = {};

        if (args.max_parallel_requests !== undefined) {
          updateData.maxParallelRequests = args.max_parallel_requests;
        }
        if (args.requests_per_minute !== undefined) {
          updateData.requestsPerMinute = args.requests_per_minute;
        }
        if (args.is_enabled !== undefined) {
          updateData.isEnabled = args.is_enabled;
        }

        // Update the provider
        const provider = await updateProvider(args.id, updateData);

        log.info(
          {
            requestId,
            providerId: provider.id,
            providerName: provider.name,
            updatedFields: Object.keys(updateData),
          },
          'Provider updated'
        );

        // Audit log
        logAuditEvent(
          createLlmAudit({
            action: 'update_llm_provider',
            userId,
            entityId: provider.id,
            entityType: 'llm_provider',
            requestId,
            details: {
              providerName: provider.name,
              previousState: {
                maxParallelRequests: previousState.maxParallelRequests,
                requestsPerMinute: previousState.requestsPerMinute,
                isEnabled: previousState.isEnabled,
              },
              newState: {
                maxParallelRequests: provider.maxParallelRequests,
                requestsPerMinute: provider.requestsPerMinute,
                isEnabled: provider.isEnabled,
              },
              updatedFields: Object.keys(updateData),
            },
          })
        );

        return formatSuccess({
          success: true,
          provider: {
            id: provider.id,
            name: provider.name,
            display_name: provider.displayName,
            is_enabled: provider.isEnabled,
            rate_limits: {
              max_parallel_requests: provider.maxParallelRequests,
              requests_per_minute: provider.requestsPerMinute,
            },
            updated_at: provider.updatedAt.toISOString(),
          },
          updated_fields: Object.keys(updateData),
        });
      } catch (err) {
        log.error({ err, requestId }, 'update_llm_provider failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to update provider'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerUpdateLlmProviderTool);

export { registerUpdateLlmProviderTool };
