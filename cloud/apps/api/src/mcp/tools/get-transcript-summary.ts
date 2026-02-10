/**
 * get_transcript_summary MCP Tool
 *
 * Returns a summary of a specific transcript without the full raw text.
 * Useful for understanding the AI model's decision and key reasoning.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { buildMcpResponse } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:get-transcript-summary');

/**
 * Input schema for get_transcript_summary tool
 */
const GetTranscriptSummaryInputSchema = {
  run_id: z.string().describe('Run ID (required)'),
  scenario_id: z.string().describe('Scenario ID (required)'),
  model: z.string().describe('Model ID (required)'),
};

/**
 * Formatted transcript summary output
 */
type TranscriptSummaryOutput = {
  runId: string;
  scenarioId: string;
  model: string;
  status: 'found' | 'not_found';
  summary?: {
    turnCount: number;
    wordCount: number;
    decision: {
      code: string;
      text: string;
    };
    keyReasoning: string[];
    timestamp: string;
  };
};

/**
 * Safe JSON accessor for string arrays
 */
function safeJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

/**
 * Counts words in a string
 */
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

/**
 * Extracts turn count from transcript content
 */
function extractTurnCount(content: unknown): number {
  if (content === undefined || content === null || typeof content !== 'object') return 0;

  // Content might have turns array or messages array
  const obj = content as Record<string, unknown>;
  const turns = obj.turns ?? obj.messages ?? obj.conversation;

  if (Array.isArray(turns)) {
    return turns.length;
  }

  return 0;
}

/**
 * Extracts word count from transcript content
 */
function extractWordCount(content: unknown): number {
  if (content === undefined || content === null || typeof content !== 'object') return 0;

  const obj = content as Record<string, unknown>;
  const turns = obj.turns ?? obj.messages ?? obj.conversation;

  if (Array.isArray(turns)) {
    let total = 0;
    for (const turn of turns) {
      if (turn !== null && typeof turn === 'object') {
        const text = (turn as Record<string, unknown>).content ??
          (turn as Record<string, unknown>).text ??
          (turn as Record<string, unknown>).message;
        if (typeof text === 'string') {
          total += countWords(text);
        }
      }
    }
    return total;
  }

  // If content is just text
  if (typeof obj.text === 'string') {
    return countWords(obj.text);
  }

  return 0;
}

/**
 * Formats transcript into summary output
 */
function formatTranscriptSummary(
  runId: string,
  scenarioId: string,
  model: string,
  transcript: {
    content: unknown;
    decisionCode: string | null;
    decisionText: string | null;
    keyReasoning: unknown;
    createdAt: Date;
  } | null
): TranscriptSummaryOutput {
  if (!transcript) {
    return {
      runId,
      scenarioId,
      model,
      status: 'not_found',
    };
  }

  return {
    runId,
    scenarioId,
    model,
    status: 'found',
    summary: {
      turnCount: extractTurnCount(transcript.content),
      wordCount: extractWordCount(transcript.content),
      decision: {
        code: transcript.decisionCode ?? 'unknown',
        text: transcript.decisionText ?? 'No decision recorded',
      },
      keyReasoning: safeJsonStringArray(transcript.keyReasoning).slice(0, 5),
      timestamp: transcript.createdAt.toISOString(),
    },
  };
}

/**
 * Registers the get_transcript_summary tool on the MCP server
 */
function registerGetTranscriptSummaryTool(server: McpServer): void {
  log.info('Registering get_transcript_summary tool');

  server.registerTool(
    'get_transcript_summary',
    {
      description: `Get a summary of a specific transcript without the full raw text.
Returns turn count, word count, decision made, and key reasoning points.
Requires run_id, scenario_id, and model parameters.
Limited to 1KB token budget.`,
      inputSchema: GetTranscriptSummaryInputSchema,
    },
    async (args, extra) => {
      const startTime = Date.now();
      const requestId = String(extra.requestId ?? 'unknown');

      log.debug(
        { requestId, runId: args.run_id, scenarioId: args.scenario_id, model: args.model },
        'get_transcript_summary called'
      );

      try {
        // Query transcript
        // Note: keyReasoning is not in the DB schema, so we pass empty array to formatter
        const dbTranscript = await db.transcript.findFirst({
          where: {
            runId: args.run_id,
            scenarioId: args.scenario_id,
            modelId: args.model,
          },
          select: {
            content: true,
            decisionCode: true,
            decisionText: true,
            createdAt: true,
          },
        });

        // Add keyReasoning as empty array since it's not in DB
        const transcript = dbTranscript
          ? { ...dbTranscript, keyReasoning: [] }
          : null;

        // Format the summary
        const data = formatTranscriptSummary(
          args.run_id,
          args.scenario_id,
          args.model,
          transcript
        );

        // Build response
        const response = buildMcpResponse({
          toolName: 'get_transcript_summary',
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
            bytes: response.metadata.bytes,
            executionMs: response.metadata.executionMs,
          },
          'get_transcript_summary completed'
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
          'get_transcript_summary failed'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'Failed to get transcript summary',
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
addToolRegistrar(registerGetTranscriptSummaryTool);

export { registerGetTranscriptSummaryTool, formatTranscriptSummary };
