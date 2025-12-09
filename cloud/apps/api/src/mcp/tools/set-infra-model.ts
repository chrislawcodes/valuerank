/**
 * set_infra_model MCP Tool
 *
 * Configures which LLM model handles infrastructure tasks.
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { upsertSetting, getModelByIdentifier, getSettingByKey } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { logAuditEvent, createLlmAudit } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:set-infra-model');

/**
 * Valid infrastructure purposes
 */
const VALID_PURPOSES = ['scenario_generator', 'judge', 'summarizer'] as const;
type InfraPurpose = (typeof VALID_PURPOSES)[number];

/**
 * Input schema for set_infra_model tool
 */
const SetInfraModelInputSchema = {
  purpose: z
    .enum(VALID_PURPOSES)
    .describe('Infrastructure purpose: scenario_generator, judge, or summarizer'),
  provider_name: z
    .string()
    .min(1)
    .describe('Provider name (e.g., "openai", "anthropic")'),
  model_id: z
    .string()
    .min(1)
    .describe('Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet-20241022")'),
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
 * Registers the set_infra_model tool on the MCP server
 */
function registerSetInfraModelTool(server: McpServer): void {
  log.info('Registering set_infra_model tool');

  server.registerTool(
    'set_infra_model',
    {
      description: `Configure which LLM model handles infrastructure tasks.

**Purposes:**
- scenario_generator: Model that generates scenario variations
- judge: Model that evaluates AI responses against rubric
- summarizer: Model that generates natural language summaries

**Validation:**
- Purpose must be one of the allowed values
- Model must exist (provider_name + model_id combination)

**What happens:**
- Creates/updates system setting \`infra_model_{purpose}\`
- The specified model will be used for that infrastructure task

**Example:**
{
  "purpose": "judge",
  "provider_name": "anthropic",
  "model_id": "claude-3-5-sonnet-20241022"
}`,
      inputSchema: SetInfraModelInputSchema,
    },
    async (args, extra) => {
      const requestId = String(extra.requestId ?? crypto.randomUUID());
      const userId = 'mcp-user';
      const purpose = args.purpose as InfraPurpose;

      log.debug(
        {
          requestId,
          purpose,
          providerName: args.provider_name,
          modelId: args.model_id,
        },
        'set_infra_model called'
      );

      try {
        // Validate model exists
        const model = await getModelByIdentifier(args.provider_name, args.model_id);
        if (!model) {
          return formatError(
            'MODEL_NOT_FOUND',
            `Model not found: ${args.provider_name}/${args.model_id}`,
            { providerName: args.provider_name, modelId: args.model_id }
          );
        }

        // Check if model is active
        if (model.status !== 'ACTIVE') {
          return formatError(
            'MODEL_NOT_ACTIVE',
            `Cannot use deprecated model for infrastructure: ${args.provider_name}/${args.model_id}`,
            { status: model.status.toLowerCase() }
          );
        }

        const settingKey = `infra_model_${purpose}`;
        const settingValue = {
          providerId: args.provider_name,
          modelId: args.model_id,
          modelDbId: model.id,
        };

        // Get previous value for audit
        const previousSetting = await getSettingByKey(settingKey);
        const previousValue = previousSetting?.value as {
          providerId?: string;
          modelId?: string;
        } | null;

        // Upsert the setting
        const setting = await upsertSetting(settingKey, settingValue);

        log.info(
          {
            requestId,
            purpose,
            settingKey,
            providerName: args.provider_name,
            modelId: args.model_id,
          },
          'Infra model set'
        );

        // Audit log
        logAuditEvent(
          createLlmAudit({
            action: 'set_infra_model',
            userId,
            entityId: settingKey,
            entityType: 'system_setting',
            requestId,
            details: {
              purpose,
              previousValue: previousValue
                ? { providerId: previousValue.providerId, modelId: previousValue.modelId }
                : null,
              newValue: { providerId: args.provider_name, modelId: args.model_id },
            },
          })
        );

        return formatSuccess({
          success: true,
          setting: {
            key: setting.key,
            purpose,
            model: {
              id: model.id,
              provider_name: args.provider_name,
              model_id: args.model_id,
              display_name: model.displayName,
            },
          },
          previous_model: previousValue
            ? {
                provider_name: previousValue.providerId,
                model_id: previousValue.modelId,
              }
            : null,
        });
      } catch (err) {
        log.error({ err, requestId }, 'set_infra_model failed');

        return formatError(
          'INTERNAL_ERROR',
          err instanceof Error ? err.message : 'Failed to set infra model'
        );
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerSetInfraModelTool);

export { registerSetInfraModelTool };
