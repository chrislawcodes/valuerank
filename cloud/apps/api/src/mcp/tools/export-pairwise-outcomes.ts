/**
 * export_pairwise_outcomes MCP Tool
 *
 * Returns flat pairwise value outcome rows suitable for Bradley-Terry analysis.
 * Joins definition value pairs with analysis results to produce per-model,
 * per-vignette win-rate data.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { buildMcpResponse, truncateArray } from '../../services/mcp/index.js';
import { addToolRegistrar } from './registry.js';
import { fetchDefinitionValuePairs } from './value-pair-helpers.js';
import { zAnalysisOutput } from '../../services/analysis/aggregate.js';

const log = createLogger('mcp:tools:export-pairwise-outcomes');

const ExportPairwiseOutcomesInputSchema = {
  folder: z
    .string()
    .optional()
    .describe('Filter definitions by name (contains match)'),
  tag: z.string().optional().describe('Filter definitions by tag name'),
  definition_ids: z
    .array(z.string())
    .optional()
    .describe('Explicit definition IDs (overrides folder/tag filters)'),
  include_ci: z
    .boolean()
    .default(false)
    .describe('Include confidence interval bounds in output'),
  aggregate_only: z
    .boolean()
    .default(true)
    .describe('Only use Aggregate-tagged runs (default: true)'),
};

type PairwiseOutcomeRow = {
  vignetteName: string;
  valueA: string;
  valueB: string;
  modelId: string;
  sampleSize: number;
  valueAPrioritized: number;
  valueADeprioritized: number;
  valueANeutral: number;
  valueAWinRate: number;
  valueBPrioritized: number;
  valueBDeprioritized: number;
  valueBNeutral: number;
  valueBWinRate: number;
  valueACiLower?: number;
  valueACiUpper?: number;
  valueBCiLower?: number;
  valueBCiUpper?: number;
};

type ExportPairwiseOutput = {
  rows: PairwiseOutcomeRow[];
  count: number;
  definitionsMatched: number;
  definitionsWithData: number;
  skippedDefinitions: number;
};

function registerExportPairwiseOutcomesTool(server: McpServer): void {
  log.info('Registering export_pairwise_outcomes tool');

  server.registerTool(
    'export_pairwise_outcomes',
    {
      description: `Export flat pairwise value outcome data for cross-model analysis (e.g., Bradley-Terry ranking).
For each vignette and model, returns prioritized/deprioritized/neutral counts and win rates for both values.
By default uses only Aggregate-tagged runs. Set aggregate_only=false for all completed runs.
Supports filtering by folder name, tag, or explicit definition IDs.
Limited to 100KB token budget.`,
      inputSchema: ExportPairwiseOutcomesInputSchema,
    },
    async (args, extra) => {
      const startTime = Date.now();
      const requestId = String(extra.requestId ?? 'unknown');

      log.debug({ args, requestId }, 'export_pairwise_outcomes called');

      try {
        // Step 1: Get definition → value pair mappings
        const pairResult = await fetchDefinitionValuePairs({
          folder: args.folder,
          tag: args.tag,
          definitionIds: args.definition_ids,
          limit: 200,
          offset: 0,
        });

        if (pairResult.pairs.length === 0) {
          const data: ExportPairwiseOutput = {
            rows: [],
            count: 0,
            definitionsMatched: 0,
            definitionsWithData: 0,
            skippedDefinitions: pairResult.skipped,
          };
          const response = buildMcpResponse({
            toolName: 'export_pairwise_outcomes',
            data,
            requestId,
            startTime,
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        }

        const defIds = pairResult.pairs.map((p) => p.definitionId);
        const pairMap = new Map(
          pairResult.pairs.map((p) => [p.definitionId, p])
        );

        // Step 2: Query runs for those definitions
        const runWhere = args.aggregate_only
          ? {
              definitionId: { in: defIds },
              deletedAt: null,
              tags: { some: { tag: { name: 'Aggregate' } } },
            }
          : {
              definitionId: { in: defIds },
              deletedAt: null,
              status: 'COMPLETED' as const,
            };

        const runs = await db.run.findMany({
          where: runWhere,
          select: {
            id: true,
            definitionId: true,
            createdAt: true,
            analysisResults: {
              where: { status: 'CURRENT' },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                output: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        // Step 3: Group by definitionId, take most recent run per definition
        const runByDef = new Map<string, (typeof runs)[number]>();
        for (const run of runs) {
          if (!runByDef.has(run.definitionId)) {
            runByDef.set(run.definitionId, run);
          }
        }

        // Step 4: Extract pairwise outcomes
        const rows: PairwiseOutcomeRow[] = [];
        let definitionsWithData = 0;

        for (const [defId, run] of runByDef) {
          const pair = pairMap.get(defId);
          if (pair === undefined) continue;

          const analysis = run.analysisResults[0];
          if (analysis === undefined) continue;

          const parsed = zAnalysisOutput.safeParse(analysis.output);
          if (!parsed.success) {
            log.warn(
              { analysisId: analysis.id, defId, error: parsed.error },
              'Invalid analysis output, skipping'
            );
            continue;
          }

          const perModel = parsed.data.perModel;
          let hasModelData = false;

          for (const [modelId, modelStats] of Object.entries(perModel)) {
            if (modelStats.values === undefined) continue;

            const valueAStats = modelStats.values[pair.valueA];
            const valueBStats = modelStats.values[pair.valueB];

            if (valueAStats === undefined && valueBStats === undefined) continue;

            hasModelData = true;

            const row: PairwiseOutcomeRow = {
              vignetteName: pair.name,
              valueA: pair.valueA,
              valueB: pair.valueB,
              modelId,
              sampleSize: modelStats.sampleSize ?? 0,
              valueAPrioritized: valueAStats?.count.prioritized ?? 0,
              valueADeprioritized: valueAStats?.count.deprioritized ?? 0,
              valueANeutral: valueAStats?.count.neutral ?? 0,
              valueAWinRate: valueAStats?.winRate ?? 0,
              valueBPrioritized: valueBStats?.count.prioritized ?? 0,
              valueBDeprioritized: valueBStats?.count.deprioritized ?? 0,
              valueBNeutral: valueBStats?.count.neutral ?? 0,
              valueBWinRate: valueBStats?.winRate ?? 0,
            };

            if (args.include_ci) {
              row.valueACiLower = valueAStats?.confidenceInterval.lower ?? 0;
              row.valueACiUpper = valueAStats?.confidenceInterval.upper ?? 0;
              row.valueBCiLower = valueBStats?.confidenceInterval.lower ?? 0;
              row.valueBCiUpper = valueBStats?.confidenceInterval.upper ?? 0;
            }

            rows.push(row);
          }

          if (hasModelData) {
            definitionsWithData += 1;
          }
        }

        const data: ExportPairwiseOutput = {
          rows,
          count: rows.length,
          definitionsMatched: pairResult.pairs.length,
          definitionsWithData,
          skippedDefinitions: pairResult.skipped,
        };

        const response = buildMcpResponse({
          toolName: 'export_pairwise_outcomes',
          data,
          requestId,
          startTime,
          truncator: (payload) => ({
            ...payload,
            rows: truncateArray(payload.rows, 200),
            count: Math.min(payload.count, 200),
          }),
        });

        log.info(
          {
            requestId,
            rows: rows.length,
            definitionsMatched: pairResult.pairs.length,
            definitionsWithData,
            executionMs: response.metadata.executionMs,
          },
          'export_pairwise_outcomes completed'
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
        log.error({ err, requestId }, 'export_pairwise_outcomes failed');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'Failed to export pairwise outcomes',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

addToolRegistrar(registerExportPairwiseOutcomesTool);

export { registerExportPairwiseOutcomesTool };
