/**
 * Analyze Basic Handler
 *
 * Handles analyze_basic jobs by executing Python analyze_basic worker.
 * Computes win rates, confidence intervals, model comparisons, and
 * dimension impact analysis.
 */

import path from 'path';
import type * as PgBoss from 'pg-boss';
import { db, resolveDefinitionContent } from '@valuerank/db';
import type { Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { AnalyzeBasicJobData } from '../types.js';
import { spawnPython } from '../spawn.js';
import { computeInputHash, getCachedAnalysis, invalidateCache } from '../../services/analysis/cache.js';
import { parseTemperature } from '../../utils/temperature.js';

const log = createLogger('queue:analyze-basic');

// Python worker path (relative to cloud/ directory)
const ANALYZE_WORKER_PATH = 'workers/analyze_basic.py';

// Code version for tracking analysis versions
const CODE_VERSION = '1.0.0';

/**
 * Transcript data structure sent to Python worker.
 * Matches CSV export format for consistency.
 */
type TranscriptData = {
  id: string;
  modelId: string;
  scenarioId: string;
  sampleIndex: number; // Multi-sample: index within sample set (0 to N-1)
  summary: {
    score: number | null; // Decision code as numeric 1-5 (matches CSV "Decision Code")
    values?: Record<string, 'prioritized' | 'deprioritized' | 'neutral'>;
  };
  scenario: {
    name: string;
    dimensions: Record<string, number>; // Numeric dimension scores (matches CSV variable columns)
  };
};

function isDimensionValue(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
}

function toDimensionRecord(value: unknown): Record<string, number | string> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const sanitized: Record<string, number | string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isDimensionValue(entry)) continue;
    sanitized[key] = entry;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function buildValueOutcomes(
  score: number | null,
  valueA: string | null,
  valueB: string | null
): Record<string, 'prioritized' | 'deprioritized' | 'neutral'> | undefined {
  if (score == null || valueA == null || valueB == null) return undefined;
  if (score >= 4) {
    return {
      [valueA]: 'prioritized',
      [valueB]: 'deprioritized',
    };
  }
  if (score <= 2) {
    return {
      [valueA]: 'deprioritized',
      [valueB]: 'prioritized',
    };
  }
  return {
    [valueA]: 'neutral',
    [valueB]: 'neutral',
  };
}

/**
 * Python worker input structure.
 */
type AnalyzeWorkerInput = {
  runId: string;
  transcripts: TranscriptData[];
};

/**
 * Analysis output from Python worker.
 */
type AnalysisOutput = {
  perModel: Record<string, unknown>;
  modelAgreement: Record<string, unknown>;
  dimensionAnalysis: Record<string, unknown>;
  varianceAnalysis: {
    isMultiSample: boolean;
    samplesPerScenario: number;
    perModel: Record<string, unknown>;
    mostVariableScenarios: Array<Record<string, unknown>>;
    leastVariableScenarios: Array<Record<string, unknown>>;
  };
  mostContestedScenarios: Array<{
    scenarioId: string;
    scenarioName: string;
    variance: number;
    modelScores: Record<string, number>;
  }>;
  methodsUsed: Record<string, unknown>;
  warnings: Array<{
    code: string;
    message: string;
    recommendation: string;
  }>;
  computedAt: string;
  durationMs: number;
};

/**
 * Python worker output structure.
 */
type AnalyzeWorkerOutput =
  | { success: true; analysis: AnalysisOutput }
  | { success: false; error: { message: string; code: string; retryable: boolean } };

/**
 * Creates a handler for analyze_basic jobs.
 * Returns a function that processes a batch of jobs.
 */
export function createAnalyzeBasicHandler(): PgBoss.WorkHandler<AnalyzeBasicJobData> {
  return async (jobs: PgBoss.Job<AnalyzeBasicJobData>[]) => {
    for (const job of jobs) {
      const { runId, transcriptIds: providedTranscriptIds, force = false } = job.data;
      const jobId = job.id;

      // Fetch transcriptIds if not provided (e.g., force recompute from mutation)
      let transcriptIds = providedTranscriptIds;
      if (!transcriptIds || transcriptIds.length === 0) {
        const transcripts = await db.transcript.findMany({
          where: { runId },
          select: { id: true },
        });
        transcriptIds = transcripts.map((t) => t.id);
        log.debug({ jobId, runId, count: transcriptIds.length }, 'Fetched transcript IDs for run');
      }

      if (transcriptIds.length === 0) {
        log.warn({ jobId, runId }, 'No transcripts found for run, skipping analysis');
        return;
      }

      log.info(
        { jobId, runId, transcriptCount: transcriptIds.length, force },
        'Processing analyze_basic job'
      );

      try {
        // Create input hash for deduplication
        const inputHash = computeInputHash(runId, transcriptIds);

        // Check for cached result (unless force recompute)
        if (!force) {
          const cached = await getCachedAnalysis(runId, inputHash, CODE_VERSION);

          if (cached) {
            log.info({ jobId, runId, analysisId: cached.id }, 'Using cached analysis result');
            return;
          }
        }

        // Fetch transcript data with scenario info
        const transcripts = await db.transcript.findMany({
          where: { id: { in: transcriptIds } },
          include: {
            scenario: true,
          },
        });

        const runMeta = await db.run.findUnique({
          where: { id: runId },
          select: { definitionId: true },
        });
        let valueA: string | null = null;
        let valueB: string | null = null;
        if (runMeta?.definitionId != null && runMeta.definitionId !== '') {
          try {
            const resolved = await resolveDefinitionContent(runMeta.definitionId);
            valueA = resolved.resolvedContent.dimensions[0]?.name ?? null;
            valueB = resolved.resolvedContent.dimensions[1]?.name ?? null;
          } catch (err) {
            log.warn({ jobId, runId, err }, 'Failed to resolve definition value pair for analyze_basic');
          }
        }

        // Transform to worker input format (matches CSV export structure)
        const scenarioDimensions: Record<string, Record<string, number | string>> = {};
        const transcriptData: TranscriptData[] = transcripts
          .filter((t) => t.scenario !== null && t.scenarioId !== null)
          .map((t) => {
            const scenario = t.scenario;
            if (scenario === null) {
              throw new Error(`Scenario not found for transcript ${t.id}`);
            }
            // Extract numeric dimensions from scenario content (matches CSV variable columns)
            const scenarioContent = scenario.content as Record<string, unknown> | null;
            const rawDimensions = (scenarioContent?.dimensions as Record<string, unknown>) ?? {};
            const dimensions: Record<string, number> = {};
            for (const [key, value] of Object.entries(rawDimensions)) {
              if (typeof value === 'number') {
                dimensions[key] = value;
              }
            }

            // Preserve raw scenario dimensions (string/number) for UI pivot tables.
            const validatedDimensions = toDimensionRecord(rawDimensions);
            if (validatedDimensions) {
              scenarioDimensions[scenario.id] = validatedDimensions;
            }

            // Convert decisionCode string to numeric score (matches CSV "Decision Code")
            const decisionCode = t.decisionCode;
            let score: number | null = null;
            if (decisionCode !== null) {
              const parsed = parseInt(decisionCode, 10);
              if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
                score = parsed;
              }
            }
            const values = buildValueOutcomes(score, valueA, valueB);

            return {
              id: t.id,
              modelId: t.modelId,
              scenarioId: t.scenarioId as string,
              sampleIndex: t.sampleIndex,
              summary: values ? { score, values } : { score },
              scenario: {
                name: t.scenario!.name,
                dimensions,
              },
            };
          });

        // Execute Python analyze worker
        const result = await spawnPython<AnalyzeWorkerInput, AnalyzeWorkerOutput>(
          ANALYZE_WORKER_PATH,
          { runId, transcripts: transcriptData },
          { cwd: path.resolve(process.cwd(), '../..'), timeout: 120000 }
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
          log.warn({ jobId, runId, error: err }, 'Analyze worker returned error');
          if (!err.retryable) {
            // Non-retryable error - log and complete job
            log.error({ jobId, runId, error: err }, 'Analysis permanently failed');
            return;
          }
          throw new Error(`${err.code}: ${err.message}`);
        }

        // Ensure visualizationData includes scenarioDimensions (needed for pivot filtering in the UI).
        (output.analysis as unknown as Record<string, unknown>).visualizationData = {
          ...(((output.analysis as unknown as Record<string, unknown>).visualizationData as Record<string, unknown> | undefined) ?? {}),
          scenarioDimensions,
        };

        // Mark any existing analyses as superseded
        await invalidateCache(runId);

        // Create analysis result record
        await db.analysisResult.create({
          data: {
            runId,
            analysisType: 'basic',
            inputHash,
            codeVersion: CODE_VERSION,
            output: output.analysis as unknown as Prisma.InputJsonValue,
            status: 'CURRENT',
          },
        });


        log.info(
          { jobId, runId, durationMs: output.analysis.durationMs },
          'Analyze:basic job completed'
        );

        // --- Trigger Aggregate Update ---
        try {
          const run = await db.run.findUnique({
            where: { id: runId },
            include: { tags: { include: { tag: true } } }
          });

          if (run) {
            const isAggregate = run.tags.some(rt => rt.tag.name === 'Aggregate');
            if (!isAggregate) {
              const config = run.config as {
                definitionSnapshot?: {
                  _meta?: { preambleVersionId?: string; definitionVersion?: number | string };
                  preambleVersionId?: string;
                  version?: number | string;
                }
              };
              const definitionId = run.definitionId;
              const runConfig = run.config as { temperature?: unknown } | null;
              const temperature = parseTemperature(runConfig?.temperature);
              const preambleVersionId =
                config.definitionSnapshot?._meta?.preambleVersionId ??
                config.definitionSnapshot?.preambleVersionId ??
                null;
              const definitionVersionRaw =
                config.definitionSnapshot?._meta?.definitionVersion ??
                config.definitionSnapshot?.version ??
                null;
              const parsedDefinitionVersion =
                typeof definitionVersionRaw === 'number'
                  ? definitionVersionRaw
                  : typeof definitionVersionRaw === 'string' && definitionVersionRaw.trim() !== ''
                    ? Number.parseInt(definitionVersionRaw, 10)
                    : null;
              const definitionVersion = Number.isFinite(parsedDefinitionVersion)
                ? parsedDefinitionVersion
                : null;

              // Async trigger via job queue (with debouncing via singletonKey)
              // This prevents race conditions where multiple analyses trigger aggregation simultaneously
              // causing duplicate aggregate runs.
              const { getBoss } = await import('../boss.js');
              const { DEFAULT_JOB_OPTIONS } = await import('../types.js');

              const boss = getBoss();
              // Aggregate jobs are keyed by definition+preamble+version+temperature
              // so each temperature setting is aggregated separately.
              const singletonKey = `aggregate:${definitionId}:${preambleVersionId ?? 'null'}:${definitionVersion ?? 'null'}:${temperature ?? 'null'}`;

              await boss.send(
                'aggregate_analysis',
                { definitionId, preambleVersionId, definitionVersion, temperature },
                {
                  ...DEFAULT_JOB_OPTIONS.aggregate_analysis,
                  singletonKey
                }
              );

              log.info({ runId, definitionId, preambleVersionId, definitionVersion, temperature }, 'Enqueued aggregate_analysis job');
            }
          }
        } catch (err) {
          log.error({ err }, 'Error checking run for aggregation trigger');
        }

      } catch (error) {
        log.error({ jobId, runId, err: error }, 'Analyze:basic job failed');
        throw error;
      }
    }
  };
}
