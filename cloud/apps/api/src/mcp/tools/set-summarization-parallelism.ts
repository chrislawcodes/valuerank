/**
 * set_summarization_parallelism MCP Tool
 *
 * Configures max parallel summarization jobs (1-100).
 * Updates the setting and hot-reloads the handler with new batchSize.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from '@valuerank/shared';
import { logAuditEvent, createLlmAudit } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:set-summarization-parallelism');

/**
 * Input schema for set_summarization_parallelism tool
 */
const SetSummarizationParallelismInputSchema = {
  max_parallel: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe('Maximum parallel summarization jobs (1-100)'),
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
 * Registers the set_summarization_parallelism tool on the MCP server
 */
function registerSetSummarizationParallelismTool(server: McpServer): void {
  log.info('Registering set_summarization_parallelism tool');

  server.registerTool(
    'set_summarization_parallelism',
    {
      description: `Configure max parallel summarization jobs (1-100).

**What this setting controls:**
- Number of summarization jobs processed concurrently
- Separate from probing parallelism (independent pool)
- Default is 8 when not configured

**What happens when you change it:**
- Setting is persisted immediately
- Handler is hot-reloaded with new batchSize
- In-flight jobs complete normally
- New concurrency applies immediately to queued jobs

**Use cases:**
- Increase for faster summarization throughput
- Decrease to reduce API rate limit pressure
- Adjust based on summarizer model's rate limits

**Example:**
{
  "max_parallel": 16
}`,
      inputSchema: SetSummarizationParallelismInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user';
      const maxParallel = args.max_parallel;

      log.debug(
        { requestId, maxParallel },
        'set_summarization_parallelism called'
      );

      try {
        // Import services dynamically to avoid circular dependencies
        const { getMaxParallelSummarizations, setMaxParallelSummarizations, getSettingKey } =
          await import('../../services/summarization-parallelism/index.js');
        const { getBoss, isBossRunning } = await import('../../queue/boss.js');
        const { reregisterSummarizeHandler } = await import('../../queue/handlers/index.js');

        // Get previous value for audit
        const previousValue = await getMaxParallelSummarizations();

        // Update the setting
        await setMaxParallelSummarizations(maxParallel);

        // Hot reload the handler if PgBoss is running
        if (isBossRunning()) {
          const boss = getBoss();
          await reregisterSummarizeHandler(boss);
          log.info(
            { requestId, maxParallel },
            'Summarize handler re-registered with new parallelism'
          );
        } else {
          log.debug(
            { requestId },
            'PgBoss not running, handler will use new setting on next start'
          );
        }

        log.info(
          { requestId, previousValue, newValue: maxParallel },
          'Summarization parallelism updated'
        );

        // Audit log
        logAuditEvent(
          createLlmAudit({
            action: 'set_summarization_parallelism',
            userId,
            entityId: getSettingKey(),
            entityType: 'system_setting',
            requestId,
            details: {
              previousValue,
              newValue: maxParallel,
            },
          })
        );

        return formatSuccess({
          success: true,
          setting: {
            key: getSettingKey(),
            max_parallel: maxParallel,
            previous_value: previousValue,
          },
          handler_reloaded: isBossRunning(),
        });
      } catch (err) {
        log.error({ err, requestId }, 'set_summarization_parallelism failed');

        // Handle validation errors specifically
        if (err instanceof Error && err.message.includes('must be an integer between')) {
          return formatError(
            'VALIDATION_ERROR',
            err.message,
            { max_parallel: maxParallel }
          );
        }

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to set summarization parallelism'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerSetSummarizationParallelismTool);

export { registerSetSummarizationParallelismTool };
