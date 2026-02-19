/**
 * get_run_results MCP Tool
 *
 * Returns paginated per-task results for a run, including in-progress runs.
 * This enables inspecting partial outcomes before aggregate analysis completes.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { buildMcpResponse, truncateArray } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:get-run-results');
const MAX_DECISION_TEXT_CHARS = 500;
const LARGE_TRANSCRIPT_BATCH_WARN_THRESHOLD = 200;

const GetRunResultsInputSchema = {
  run_id: z.string().describe('Run ID (required)'),
  status: z
    .enum(['all', 'success', 'failed'])
    .default('all')
    .describe('Filter by result status'),
  model: z.string().optional().describe('Optional model ID filter'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe('Maximum number of results to return (default: 100, max: 500)'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of results to skip for pagination (default: 0)'),
};

type ProgressShape = {
  total: number;
  completed: number;
  failed: number;
};

type RunResultItem = {
  scenarioId: string;
  scenarioName: string | null;
  modelId: string;
  sampleIndex: number;
  status: 'SUCCESS' | 'FAILED';
  transcriptId: string | null;
  decisionCode: string | null;
  decisionText: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: string | null;
};

type RunResultsOutput = {
  runId: string;
  runStatus: string;
  progress: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    percentComplete: number;
  } | null;
  pagination: {
    limit: number;
    offset: number;
    returned: number;
    totalAvailable: number;
  };
  results: RunResultItem[];
};

function parseProgress(value: unknown): ProgressShape | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.total !== 'number'
    || typeof record.completed !== 'number'
    || typeof record.failed !== 'number'
  ) {
    return null;
  }
  return {
    total: record.total,
    completed: record.completed,
    failed: record.failed,
  };
}

function calculatePercentComplete(progress: ProgressShape): number {
  if (progress.total <= 0) return 0;
  return Math.min(
    100,
    Math.round(((progress.completed + progress.failed) / progress.total) * 100)
  );
}

function getStatusFilter(status: 'all' | 'success' | 'failed'): 'SUCCESS' | 'FAILED' | undefined {
  if (status === 'success') return 'SUCCESS';
  if (status === 'failed') return 'FAILED';
  return undefined;
}

function truncateDecisionText(value: string | null): string | null {
  if (value === null || value.length <= MAX_DECISION_TEXT_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_DECISION_TEXT_CHARS)}...`;
}

function registerGetRunResultsTool(server: McpServer): void {
  log.info('Registering get_run_results tool');

  server.registerTool(
    'get_run_results',
    {
      description: `Get paginated per-task run results, including runs still in progress.
Returns probe-level success/failure rows with scenario/model identifiers, transcript linkage, and errors.
Use this to inspect partial outcomes before aggregate analysis completes.
Limited to 8KB token budget.`,
      inputSchema: GetRunResultsInputSchema,
    },
    async (args, extra) => {
      const startTime = Date.now();
      const requestId = String(extra.requestId ?? 'unknown');
      const limit = args.limit;
      const offset = args.offset;
      const statusFilter = getStatusFilter(args.status);

      try {
        const run = await db.run.findUnique({
          where: { id: args.run_id, deletedAt: null },
          select: {
            id: true,
            status: true,
            progress: true,
          },
        });

        if (run === null) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'NOT_FOUND',
                  message: `Run not found: ${args.run_id}`,
                }),
              },
            ],
            isError: true,
          };
        }

        const where = {
          runId: args.run_id,
          ...(args.model !== undefined && args.model !== '' ? { modelId: args.model } : {}),
          ...(statusFilter !== undefined ? { status: statusFilter } : {}),
        };

        const [totalAvailable, probeResults] = await Promise.all([
          db.probeResult.count({ where }),
          db.probeResult.findMany({
            where,
            orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
            take: limit,
            skip: offset,
            select: {
              scenarioId: true,
              modelId: true,
              sampleIndex: true,
              status: true,
              transcriptId: true,
              errorCode: true,
              errorMessage: true,
              completedAt: true,
              scenario: {
                select: { name: true },
              },
            },
          }),
        ]);

        const transcriptIds = probeResults
          .map((row) => row.transcriptId)
          .filter((transcriptId): transcriptId is string => transcriptId !== null && transcriptId !== '');

        if (transcriptIds.length > LARGE_TRANSCRIPT_BATCH_WARN_THRESHOLD) {
          log.warn(
            { requestId, runId: args.run_id, transcriptCount: transcriptIds.length },
            'Large transcript lookup batch for get_run_results'
          );
        }

        const transcripts = transcriptIds.length > 0
          ? await db.transcript.findMany({
            where: {
              id: { in: transcriptIds },
              deletedAt: null,
            },
            select: {
              id: true,
              decisionCode: true,
              decisionText: true,
            },
          })
          : [];

        const transcriptMap = new Map(transcripts.map((transcript) => [transcript.id, transcript]));

        const results: RunResultItem[] = probeResults.map((row) => {
          const transcript = row.transcriptId !== null ? transcriptMap.get(row.transcriptId) : undefined;
          return {
            scenarioId: row.scenarioId,
            scenarioName: row.scenario.name,
            modelId: row.modelId,
            sampleIndex: row.sampleIndex,
            status: row.status,
            transcriptId: row.transcriptId,
            decisionCode: transcript?.decisionCode ?? null,
            decisionText: truncateDecisionText(transcript?.decisionText ?? null),
            errorCode: row.errorCode,
            errorMessage: row.errorMessage,
            completedAt: row.completedAt?.toISOString() ?? null,
          };
        });

        const progress = parseProgress(run.progress);
        const data: RunResultsOutput = {
          runId: run.id,
          runStatus: run.status,
          progress: progress === null
            ? null
            : {
              total: progress.total,
              completed: progress.completed,
              failed: progress.failed,
              pending: Math.max(0, progress.total - progress.completed - progress.failed),
              percentComplete: calculatePercentComplete(progress),
            },
          pagination: {
            limit,
            offset,
            returned: results.length,
            totalAvailable,
          },
          results,
        };

        const response = buildMcpResponse({
          toolName: 'get_run_results',
          data,
          requestId,
          startTime,
          truncator: (payload) => ({
            ...payload,
            results: truncateArray(payload.results, Math.max(10, Math.floor(limit / 2))),
          }),
        });

        log.info(
          {
            requestId,
            runId: args.run_id,
            runStatus: run.status,
            returned: results.length,
            totalAvailable,
            executionMs: response.metadata.executionMs,
          },
          'get_run_results completed'
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
        log.error({ err, requestId, runId: args.run_id }, 'get_run_results failed');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'Failed to get run results',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

addToolRegistrar(registerGetRunResultsTool);

export { registerGetRunResultsTool };
