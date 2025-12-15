/**
 * list_system_settings MCP Tool
 *
 * Lists system configuration settings.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getAllSettings, getSettingByKey } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:list-system-settings');

/**
 * Input schema for list_system_settings tool
 */
const ListSystemSettingsInputSchema = {
  key: z
    .string()
    .optional()
    .describe('Filter by specific setting key (returns single setting if found)'),
  prefix: z
    .string()
    .optional()
    .describe('Filter by key prefix (e.g., "infra_model" for all infrastructure models)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe('Maximum number of settings to return (default: 50, max: 100)'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of settings to skip for pagination (default: 0)'),
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
 * Registers the list_system_settings tool on the MCP server
 */
function registerListSystemSettingsTool(server: McpServer): void {
  log.info('Registering list_system_settings tool');

  server.registerTool(
    'list_system_settings',
    {
      description: `List system configuration settings.

**Response includes:**
- Setting key and value
- Created and updated timestamps
- Filtered by key or prefix if specified

**Filters:**
- key: Get a specific setting by exact key
- prefix: Get all settings starting with prefix

**Common Keys:**
- infra_model_scenario_generator: Model for generating scenarios
- infra_model_judge: Model for judging responses
- infra_model_summarizer: Model for generating summaries
- infra_max_parallel_summarizations: Max parallel summarization jobs (default: 8)

**Examples:**
- List all: \`{}\`
- Single key: \`{"key": "infra_model_judge"}\`
- By prefix: \`{"prefix": "infra_model"}\`

Supports pagination via limit and offset parameters.`,
      inputSchema: ListSystemSettingsInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());

      log.debug(
        {
          requestId,
          key: args.key,
          prefix: args.prefix,
        },
        'list_system_settings called'
      );

      try {
        // If specific key requested, return single setting
        if (args.key) {
          const setting = await getSettingByKey(args.key);

          // Handle special case: return default for summarization parallelism
          if (!setting && args.key === 'infra_max_parallel_summarizations') {
            log.info({ requestId, key: args.key }, 'Returning default for summarization parallelism');
            return formatSuccess({
              setting: {
                key: args.key,
                value: { value: 8 },
                is_default: true,
                description: 'Max parallel summarization jobs (using default, not explicitly configured)',
              },
            });
          }

          if (!setting) {
            return formatError('NOT_FOUND', `Setting not found: ${args.key}`);
          }

          log.info({ requestId, key: args.key }, 'Setting retrieved');

          return formatSuccess({
            setting: {
              key: setting.key,
              value: setting.value,
              updated_at: setting.updatedAt.toISOString(),
            },
          });
        }

        // Get all settings
        let settings = await getAllSettings();

        // Filter by prefix if specified
        if (args.prefix) {
          settings = settings.filter((s) => s.key.startsWith(args.prefix!));
        }

        // Apply pagination
        const limit = args.limit ?? 50;
        const offset = args.offset ?? 0;
        const totalCount = settings.length;
        const paginatedSettings = settings.slice(offset, offset + limit);

        // Format response
        const formattedSettings = paginatedSettings.map((s) => ({
          key: s.key,
          value: s.value,
          updated_at: s.updatedAt.toISOString(),
        }));

        log.info(
          {
            requestId,
            settingCount: formattedSettings.length,
            prefix: args.prefix || null,
          },
          'Settings listed'
        );

        return formatSuccess({
          settings: formattedSettings,
          total: totalCount,
          returned: formattedSettings.length,
          pagination: {
            limit,
            offset,
            has_more: offset + limit < totalCount,
          },
          filter: {
            prefix: args.prefix || null,
          },
        });
      } catch (err) {
        log.error({ err, requestId }, 'list_system_settings failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to list settings'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerListSystemSettingsTool);

export { registerListSystemSettingsTool };
