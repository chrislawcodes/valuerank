/**
 * get_dimension_analysis MCP Tool
 *
 * Returns dimension-level analysis for a run, showing which dimensions
 * drive the most model divergence.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { buildMcpResponse, truncateArray } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';

const log = createLogger('mcp:tools:get-dimension-analysis');

/**
 * Input schema for get_dimension_analysis tool
 */
const GetDimensionAnalysisInputSchema = {
  run_id: z.string().describe('Run ID to get dimension analysis for (required)'),
};

/**
 * Formatted dimension analysis output
 */
type DimensionAnalysisOutput = {
  runId: string;
  analysisStatus: 'completed' | 'pending' | 'failed';
  rankedDimensions: Array<{
    dimension: string;
    importance: number;
    divergenceScore: number;
  }>;
  correlations: Array<{
    dimension1: string;
    dimension2: string;
    correlation: number;
  }>;
  mostDivisive: Array<{
    dimension: string;
    variance: number;
    modelRange: { min: number; max: number };
  }>;
};

/**
 * Safe JSON object accessor with type assertion
 */
function safeJsonObject<T extends Record<string, unknown>>(
  value: unknown
): T | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as T;
  }
  return null;
}

/**
 * Safe JSON array accessor
 */
function safeJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
}

/**
 * Formats analysis result into dimension analysis output
 */
function formatDimensionAnalysis(
  runId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: { status: string; output: any } | null
): DimensionAnalysisOutput {
  if (!analysis) {
    return {
      runId,
      analysisStatus: 'pending',
      rankedDimensions: [],
      correlations: [],
      mostDivisive: [],
    };
  }

  const status =
    analysis.status === 'CURRENT'
      ? 'completed'
      : analysis.status === 'FAILED'
        ? 'failed'
        : 'pending';

  const output = safeJsonObject<{
    dimensionAnalysis?: {
      rankedDimensions?: Array<{
        dimension: string;
        importance: number;
        divergenceScore: number;
      }>;
      correlations?: Array<{
        dimension1: string;
        dimension2: string;
        correlation: number;
      }>;
      mostDivisive?: Array<{
        dimension: string;
        variance: number;
        modelRange: { min: number; max: number };
      }>;
    };
  }>(analysis.output);

  const dimensionData = output?.dimensionAnalysis;

  return {
    runId,
    analysisStatus: status,
    rankedDimensions: truncateArray(
      safeJsonArray(dimensionData?.rankedDimensions),
      10
    ),
    correlations: truncateArray(safeJsonArray(dimensionData?.correlations), 10),
    mostDivisive: truncateArray(safeJsonArray(dimensionData?.mostDivisive), 5),
  };
}

/**
 * Registers the get_dimension_analysis tool on the MCP server
 */
function registerGetDimensionAnalysisTool(server: McpServer): void {
  log.info('Registering get_dimension_analysis tool');

  server.registerTool(
    'get_dimension_analysis',
    {
      description: `Get dimension-level analysis for a run.
Shows which dimensions drive model divergence, including:
- Ranked dimensions by importance
- Dimension correlations
- Most divisive dimensions
Limited to 2KB token budget.`,
      inputSchema: GetDimensionAnalysisInputSchema,
    },
    async (args, extra) => {
      const startTime = Date.now();
      const requestId = String(extra.requestId ?? 'unknown');

      log.debug({ requestId, runId: args.run_id }, 'get_dimension_analysis called');

      try {
        // Query run to verify it exists
        const run = await db.run.findUnique({
          where: { id: args.run_id },
        });

        if (!run) {
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

        // Query analysis result
        const analysis = await db.analysisResult.findFirst({
          where: {
            runId: args.run_id,
            analysisType: 'basic', // Use basic analysis which includes dimension data
          },
          orderBy: { createdAt: 'desc' },
          select: {
            status: true,
            output: true,
          },
        });

        // Format the analysis
        const data = formatDimensionAnalysis(args.run_id, analysis);

        // Build response
        const response = buildMcpResponse({
          toolName: 'get_dimension_analysis',
          data,
          requestId,
          startTime,
        });

        log.info(
          {
            requestId,
            runId: args.run_id,
            analysisStatus: data.analysisStatus,
            bytes: response.metadata.bytes,
            executionMs: response.metadata.executionMs,
          },
          'get_dimension_analysis completed'
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
        log.error({ err, requestId, runId: args.run_id }, 'get_dimension_analysis failed');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'Failed to get dimension analysis',
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
addToolRegistrar(registerGetDimensionAnalysisTool);

export { registerGetDimensionAnalysisTool, formatDimensionAnalysis };
