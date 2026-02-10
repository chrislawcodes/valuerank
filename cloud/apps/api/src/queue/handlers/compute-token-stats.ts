/**
 * Compute Token Stats Handler
 *
 * Handles compute_token_stats jobs by executing Python worker
 * and updating ModelTokenStatistics in the database.
 */

import path from 'path';
import type * as PgBoss from 'pg-boss';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { ComputeTokenStatsJobData } from '../types.js';
import { spawnPython } from '../spawn.js';
import { upsertTokenStats } from '../../services/cost/statistics.js';

const log = createLogger('queue:compute-token-stats');

// Python worker path (relative to cloud/ directory)
const WORKER_PATH = 'workers/compute_token_stats.py';

/**
 * Probe result structure sent to Python worker.
 */
type ProbeResultData = {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Existing stats structure sent to Python worker.
 */
type ExistingStatsData = {
  avgInputTokens: number;
  avgOutputTokens: number;
  sampleCount: number;
};

/**
 * Python worker input structure.
 */
type ComputeWorkerInput = {
  runId: string;
  definitionId: string;
  probeResults: ProbeResultData[];
  existingStats: Record<string, ExistingStatsData>;
  existingDefinitionStats: Record<string, ExistingStatsData>;
};

/**
 * Stats result from Python worker.
 */
type StatsResult = { avgInputTokens: number; avgOutputTokens: number; sampleCount: number };

/**
 * Python worker output structure.
 */
type ComputeWorkerOutput =
  | {
    success: true;
    stats: Record<string, StatsResult>;
    definitionStats: Record<string, StatsResult>;
    summary: { modelsUpdated: number; totalProbesProcessed: number; durationMs: number };
  }
  | { success: false; error: { message: string; code: string; retryable: boolean } };

/**
 * Creates a handler for compute_token_stats jobs.
 */
export function createComputeTokenStatsHandler(): PgBoss.WorkHandler<ComputeTokenStatsJobData> {
  return async (jobs: PgBoss.Job<ComputeTokenStatsJobData>[]) => {
    for (const job of jobs) {
      const { runId } = job.data;
      const jobId = job.id;

      log.info({ jobId, runId }, 'Processing compute_token_stats job');

      try {
        // Check if run exists and is completed
        const run = await db.run.findUnique({
          where: { id: runId },
          select: { id: true, status: true, definitionId: true },
        });

        if (run === null) {
          log.warn({ jobId, runId }, 'Run not found, skipping token stats computation');
          return;
        }

        if (run.status !== 'COMPLETED') {
          log.warn({ jobId, runId, status: run.status }, 'Run not completed, skipping token stats computation');
          return;
        }

        // Fetch successful probe results with token data
        const probeResults = await db.probeResult.findMany({
          where: {
            runId,
            status: 'SUCCESS',
            inputTokens: { not: null },
            outputTokens: { not: null },
          },
          select: {
            modelId: true,
            inputTokens: true,
            outputTokens: true,
          },
        });

        if (probeResults.length === 0) {
          log.warn({ jobId, runId }, 'No probe results with token data found, skipping');
          return;
        }

        // Get unique model IDs from probe results
        const modelIds = [...new Set(probeResults.map((p) => p.modelId))];

        // Fetch existing stats for these models
        // Note: modelId in ProbeResult is the model identifier string (e.g., "gpt-4")
        // We need to look up LlmModel by modelId to get the database ID for stats lookup
        const models = await db.llmModel.findMany({
          where: { modelId: { in: modelIds } },
          select: { id: true, modelId: true },
        });
        const modelIdMap = new Map(models.map((m) => [m.modelId, m.id]));

        // Fetch existing token stats for these models (by database ID)
        const dbModelIds = models.map((m) => m.id);
        const definitionId = run.definitionId;

        // Fetch global stats
        const existingStatsRecords = await db.modelTokenStatistics.findMany({
          where: {
            modelId: { in: dbModelIds },
            definitionId: null, // Global stats only
          },
          include: {
            model: { select: { modelId: true } },
          },
        });

        // Fetch definition-specific stats
        const existingDefStatsRecords = await db.modelTokenStatistics.findMany({
          where: {
            modelId: { in: dbModelIds },
            definitionId: definitionId,
          },
          include: {
            model: { select: { modelId: true } },
          },
        });

        // Build existing stats map keyed by model identifier (global)
        const existingStats: Record<string, ExistingStatsData> = {};
        for (const stats of existingStatsRecords) {
          existingStats[stats.model.modelId] = {
            avgInputTokens: Number(stats.avgInputTokens),
            avgOutputTokens: Number(stats.avgOutputTokens),
            sampleCount: stats.sampleCount,
          };
        }

        // Build existing definition stats map keyed by model identifier
        const existingDefinitionStats: Record<string, ExistingStatsData> = {};
        for (const stats of existingDefStatsRecords) {
          existingDefinitionStats[stats.model.modelId] = {
            avgInputTokens: Number(stats.avgInputTokens),
            avgOutputTokens: Number(stats.avgOutputTokens),
            sampleCount: stats.sampleCount,
          };
        }

        // Transform probe results for Python worker
        const probeData: ProbeResultData[] = probeResults.map((p) => {
          if (typeof p.inputTokens !== 'number' || typeof p.outputTokens !== 'number') {
            throw new Error('Unexpected null tokens in successful probe result');
          }
          return {
            modelId: p.modelId,
            inputTokens: p.inputTokens,
            outputTokens: p.outputTokens,
          };
        });

        log.debug(
          { jobId, runId, probeCount: probeData.length, modelCount: modelIds.length },
          'Calling Python compute_token_stats worker'
        );

        // Execute Python worker
        const result = await spawnPython<ComputeWorkerInput, ComputeWorkerOutput>(
          WORKER_PATH,
          { runId, definitionId, probeResults: probeData, existingStats, existingDefinitionStats },
          { cwd: path.resolve(process.cwd(), '../..'), timeout: 60000 }
        );

        // Handle spawn failure
        if (!result.success) {
          log.error({ jobId, runId, error: result.error, stderr: result.stderr }, 'Python spawn failed');
          throw new Error(`Python worker failed: ${result.error}`);
        }

        // Handle worker failure
        const output = result.data;
        if (!output.success) {
          const err = output.error;
          log.warn({ jobId, runId, error: err }, 'Compute token stats worker returned error');
          if (!err.retryable) {
            // Non-retryable error - log and complete job
            log.error({ jobId, runId, error: err }, 'Token stats computation permanently failed');
            return;
          }
          throw new Error(`${err.code}: ${err.message}`);
        }

        // Update database with new stats
        const { stats, definitionStats, summary } = output;
        let globalUpdatedCount = 0;
        let defUpdatedCount = 0;

        // Update global stats
        for (const [modelIdentifier, newStats] of Object.entries(stats)) {
          const dbModelId = modelIdMap.get(modelIdentifier);
          if (dbModelId === undefined || dbModelId === null || dbModelId === '') {
            log.warn({ modelIdentifier }, 'Model ID not found in database, skipping stats update');
            continue;
          }

          await upsertTokenStats({
            modelId: dbModelId,
            definitionId: null, // Global stats
            avgInputTokens: newStats.avgInputTokens,
            avgOutputTokens: newStats.avgOutputTokens,
            sampleCount: newStats.sampleCount,
          });
          globalUpdatedCount++;
        }

        // Update definition-specific stats
        for (const [modelIdentifier, newStats] of Object.entries(definitionStats)) {
          const dbModelId = modelIdMap.get(modelIdentifier);
          if (dbModelId === undefined || dbModelId === null || dbModelId === '') {
            log.warn({ modelIdentifier }, 'Model ID not found in database, skipping definition stats update');
            continue;
          }

          await upsertTokenStats({
            modelId: dbModelId,
            definitionId: definitionId, // Definition-specific stats
            avgInputTokens: newStats.avgInputTokens,
            avgOutputTokens: newStats.avgOutputTokens,
            sampleCount: newStats.sampleCount,
          });
          defUpdatedCount++;
        }

        log.info(
          {
            jobId,
            runId,
            definitionId,
            globalModelsUpdated: globalUpdatedCount,
            definitionModelsUpdated: defUpdatedCount,
            totalProbes: summary.totalProbesProcessed,
            durationMs: summary.durationMs,
          },
          'Token stats computation completed'
        );
      } catch (error) {
        log.error({ jobId, runId, err: error }, 'Compute token stats job failed');
        throw error;
      }
    }
  };
}
