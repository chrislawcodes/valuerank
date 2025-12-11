/**
 * get_transcript MCP Tool
 *
 * Returns the full transcript data including all turns and provider metadata.
 * Use this when you need the complete conversation and API response details.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { buildMcpResponse } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:get-transcript');

/**
 * Input schema for get_transcript tool
 */
const GetTranscriptInputSchema = {
  run_id: z.string().describe('Run ID (required)'),
  scenario_id: z.string().describe('Scenario ID (required)'),
  model: z.string().describe('Model ID (required)'),
};

/**
 * Provider metadata from LLM API response
 */
type ProviderMetadata = {
  provider: string;
  finishReason: string;
  raw: Record<string, unknown>;
};

/**
 * Turn structure in transcript content
 */
type TranscriptTurn = {
  turnNumber: number;
  promptLabel: string;
  probePrompt: string;
  targetResponse: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  providerMetadata?: ProviderMetadata | null;
};

/**
 * Full transcript output
 */
type TranscriptOutput = {
  runId: string;
  scenarioId: string;
  model: string;
  status: 'found' | 'not_found';
  transcript?: {
    id: string;
    modelVersion: string | null;
    turnCount: number;
    tokenCount: number;
    durationMs: number;
    estimatedCost: number | null;
    createdAt: string;
    turns: TranscriptTurn[];
    costSnapshot?: {
      inputTokens: number;
      outputTokens: number;
      estimatedCost: number;
      costInputPerMillion: number;
      costOutputPerMillion: number;
    };
  };
};

/**
 * Extracts turns from transcript content
 */
function extractTurns(content: unknown): TranscriptTurn[] {
  if (!content || typeof content !== 'object') return [];

  const obj = content as Record<string, unknown>;
  const turns = obj.turns;

  if (!Array.isArray(turns)) return [];

  return turns.map((turn) => {
    if (!turn || typeof turn !== 'object') {
      return {
        turnNumber: 0,
        promptLabel: '',
        probePrompt: '',
        targetResponse: '',
      };
    }

    const t = turn as Record<string, unknown>;
    return {
      turnNumber: typeof t.turnNumber === 'number' ? t.turnNumber : 0,
      promptLabel: typeof t.promptLabel === 'string' ? t.promptLabel : '',
      probePrompt: typeof t.probePrompt === 'string' ? t.probePrompt : '',
      targetResponse: typeof t.targetResponse === 'string' ? t.targetResponse : '',
      inputTokens: typeof t.inputTokens === 'number' ? t.inputTokens : null,
      outputTokens: typeof t.outputTokens === 'number' ? t.outputTokens : null,
      providerMetadata: t.providerMetadata as ProviderMetadata | null | undefined,
    };
  });
}

/**
 * Cost snapshot type
 */
type CostSnapshot = {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  costInputPerMillion: number;
  costOutputPerMillion: number;
};

/**
 * Extracts cost snapshot from transcript content
 */
function extractCostSnapshot(content: unknown): CostSnapshot | undefined {
  if (!content || typeof content !== 'object') return undefined;

  const obj = content as Record<string, unknown>;
  const costSnapshot = obj.costSnapshot;

  if (!costSnapshot || typeof costSnapshot !== 'object') return undefined;

  const cs = costSnapshot as Record<string, unknown>;
  return {
    inputTokens: typeof cs.inputTokens === 'number' ? cs.inputTokens : 0,
    outputTokens: typeof cs.outputTokens === 'number' ? cs.outputTokens : 0,
    estimatedCost: typeof cs.estimatedCost === 'number' ? cs.estimatedCost : 0,
    costInputPerMillion: typeof cs.costInputPerMillion === 'number' ? cs.costInputPerMillion : 0,
    costOutputPerMillion: typeof cs.costOutputPerMillion === 'number' ? cs.costOutputPerMillion : 0,
  };
}

/**
 * Registers the get_transcript tool on the MCP server
 */
function registerGetTranscriptTool(server: McpServer): void {
  log.info('Registering get_transcript tool');

  server.registerTool(
    'get_transcript',
    {
      description: `Get the full transcript data including all conversation turns and provider metadata.
Returns complete transcript with:
- All turns (prompt, response, token counts)
- Provider metadata per turn (provider name, finish reason, raw API data)
- Cost snapshot with token usage and pricing
- Model version and timing information

Use get_transcript_summary for a lighter-weight overview without full content.
Limited to 10KB token budget.`,
      inputSchema: GetTranscriptInputSchema,
    },
    async (args, extra) => {
      const startTime = Date.now();
      const requestId = String(extra.requestId ?? 'unknown');

      log.debug(
        { requestId, runId: args.run_id, scenarioId: args.scenario_id, model: args.model },
        'get_transcript called'
      );

      try {
        // Query transcript with all fields
        const transcript = await db.transcript.findFirst({
          where: {
            runId: args.run_id,
            scenarioId: args.scenario_id,
            modelId: args.model,
            deletedAt: null,
          },
        });

        let data: TranscriptOutput;

        if (!transcript) {
          data = {
            runId: args.run_id,
            scenarioId: args.scenario_id,
            model: args.model,
            status: 'not_found',
          };
        } else {
          const turns = extractTurns(transcript.content);
          const costSnapshot = extractCostSnapshot(transcript.content);

          data = {
            runId: args.run_id,
            scenarioId: args.scenario_id,
            model: args.model,
            status: 'found',
            transcript: {
              id: transcript.id,
              modelVersion: transcript.modelVersion,
              turnCount: transcript.turnCount,
              tokenCount: transcript.tokenCount,
              durationMs: transcript.durationMs,
              estimatedCost: transcript.estimatedCost ? Number(transcript.estimatedCost) : null,
              createdAt: transcript.createdAt.toISOString(),
              turns,
              ...(costSnapshot && { costSnapshot }),
            },
          };
        }

        // Build response
        const response = buildMcpResponse({
          toolName: 'get_transcript',
          data,
          requestId,
          startTime,
        });

        log.info(
          {
            requestId,
            runId: args.run_id,
            scenarioId: args.scenario_id,
            model: args.model,
            found: data.status === 'found',
            turnCount: data.transcript?.turnCount ?? 0,
            bytes: response.metadata.bytes,
            executionMs: response.metadata.executionMs,
          },
          'get_transcript completed'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (err) {
        log.error(
          { err, requestId, runId: args.run_id, scenarioId: args.scenario_id },
          'get_transcript failed'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'Failed to get transcript',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

// Register this tool with the tool registry
addToolRegistrar(registerGetTranscriptTool);

export { registerGetTranscriptTool };
