/**
 * Aggregate Analysis Handler
 *
 * Handles aggregate_analysis jobs by calling the aggregate service.
 * Used to debounce and serialize aggregation requests to prevent race conditions.
 */

import type * as PgBoss from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import { db } from '@valuerank/db';
import { z } from 'zod';
import type { AggregateAnalysisJobData } from '../types.js';
import { updateAggregateRun } from '../../services/analysis/aggregate.js';
import { planFinalTrial } from '../../services/run/plan-final-trial.js';
import { startRun } from '../../services/run/start.js';
import { parseTemperature } from '../../utils/temperature.js';

const log = createLogger('queue:aggregate-analysis');

const zRunSnapshot = z.object({
    _meta: z.object({
        preambleVersionId: z.string().optional(),
        definitionVersion: z.union([z.number(), z.string()]).optional(),
    }).optional(),
    preambleVersionId: z.string().optional(),
    version: z.union([z.number(), z.string()]).optional(),
});

const zRunConfig = z.object({
    definitionSnapshot: zRunSnapshot.optional(),
    models: z.array(z.string()).optional(),
    isFinalTrial: z.boolean().optional(),
    temperature: z.number().nullable().optional(),
}).passthrough();

function parseDefinitionVersion(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string' || value.trim() === '') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

async function deriveDefinitionTargets(
    definitionId: string,
    preambleVersionId: string | null,
): Promise<Array<{ definitionVersion: number; temperature: number | null }>> {
    const runs = await db.run.findMany({
        where: {
            definitionId,
            status: 'COMPLETED',
            deletedAt: null,
            tags: {
                none: {
                    tag: { name: 'Aggregate' },
                },
            },
        },
        select: { config: true },
    });

    const targets = new Map<string, { definitionVersion: number; temperature: number | null }>();

    for (const run of runs) {
        const parseResult = zRunConfig.safeParse(run.config);
        if (!parseResult.success) continue;
        const snapshot = parseResult.data.definitionSnapshot;

        const runPreambleId =
            snapshot?._meta?.preambleVersionId ??
            snapshot?.preambleVersionId ??
            null;

        const preambleMatches =
            preambleVersionId === null
                ? runPreambleId === null
                : runPreambleId === preambleVersionId;
        if (!preambleMatches) continue;

        const runDefinitionVersion =
            parseDefinitionVersion(snapshot?._meta?.definitionVersion) ??
            parseDefinitionVersion(snapshot?.version);
        if (runDefinitionVersion === null) continue;
        const targetKey = `${runDefinitionVersion}`;
        targets.set(targetKey, {
            definitionVersion: runDefinitionVersion,
            temperature: null,
        });
    }

    return [...targets.values()];
}

/**
 * Creates a handler for aggregate_analysis jobs.
 * Returns a function that processes a batch of jobs.
 */
export function createAggregateAnalysisHandler(): PgBoss.WorkHandler<AggregateAnalysisJobData> {
    return async (jobs: PgBoss.Job<AggregateAnalysisJobData>[]) => {
        for (const job of jobs) {
            const { definitionId, preambleVersionId } = job.data;
            // Backward compatibility: jobs queued before this change may omit definitionVersion.
            const definitionVersion = job.data.definitionVersion ?? null;
            const temperature = parseTemperature(job.data.temperature);
            const jobId = job.id;

            log.info(
                { jobId, definitionId, preambleVersionId, definitionVersion, temperature },
                'Processing aggregate_analysis job'
            );

            try {
                if (definitionVersion !== null) {
                    await updateAggregateRun(definitionId, preambleVersionId, definitionVersion, temperature);
                } else {
                    const derivedTargets = await deriveDefinitionTargets(definitionId, preambleVersionId);

                    if (derivedTargets.length === 0) {
                        log.warn(
                            { jobId, definitionId, preambleVersionId },
                            'No definition versions found for legacy aggregate job; skipping'
                        );
                        continue;
                    }

                    for (const target of derivedTargets) {
                        await updateAggregateRun(definitionId, preambleVersionId, target.definitionVersion, target.temperature);
                    }
                }

                // --- Adaptive Sampling Continuation ---
                try {
                    // Fetch recent runs to see if we are in a "Final Trial" context
                    const runs = await db.run.findMany({
                        where: {
                            definitionId,
                            status: 'COMPLETED',
                            deletedAt: null,
                            tags: {
                                none: {
                                    tag: { name: 'Aggregate' },
                                },
                            },
                        },
                        orderBy: { createdAt: 'desc' },
                        take: 50, // Recent history is enough
                    });

                    // Filter for runs matching the current preamble+version and marked as Final Trial
                    const finalTrialRuns = runs.filter((run) => {
                        const parseResult = zRunConfig.safeParse(run.config);
                        if (!parseResult.success) return false;
                        const config = parseResult.data;
                        const snapshot = config.definitionSnapshot;
                        const runPreambleId = snapshot?._meta?.preambleVersionId ?? snapshot?.preambleVersionId ?? null;
                        const runVersion = parseDefinitionVersion(snapshot?._meta?.definitionVersion) ?? parseDefinitionVersion(snapshot?.version);
                        const preambleMatch = preambleVersionId === null ? runPreambleId === null : runPreambleId === preambleVersionId;
                        // Legacy jobs may omit definitionVersion; treat null as wildcard for compatibility.
                        const versionMatch = definitionVersion === null ? true : runVersion === definitionVersion;
                        return preambleMatch && versionMatch && config.isFinalTrial === true;
                    });

                    if (finalTrialRuns.length > 0) {
                        const modelIds = [...new Set(finalTrialRuns.flatMap(r => {
                            const parseResult = zRunConfig.safeParse(r.config);
                            return parseResult.success ? (parseResult.data.models ?? []) : [];
                        }))];
                        const firstRun = finalTrialRuns[0]!;

                        if (modelIds.length > 0) {
                            log.info({ definitionId, modelIds }, 'Checking adaptive sampling stability');
                            const plan = await planFinalTrial(definitionId, modelIds, temperature);

                            if (plan.totalJobs > 0) {
                                log.info({ definitionId, totalJobs: plan.totalJobs }, 'Stability criteria not met. Starting follow-up Final Trial run.');
                                await startRun({
                                    definitionId,
                                    models: modelIds,
                                    finalTrial: true,
                                    temperature: temperature ?? undefined,
                                    userId: firstRun.createdByUserId ?? 'system',
                                    experimentId: firstRun.experimentId ?? undefined,
                                });
                            } else {
                                log.info({ definitionId }, 'Stability criteria met or cap reached. Final Trial complete.');
                            }
                        }
                    }
                } catch (samplingErr) {
                    log.error({ samplingErr, definitionId }, 'Error in adaptive sampling continuation check');
                }

                log.info(
                    { jobId, definitionId },
                    'Aggregate analysis completed successfully'
                );
            } catch (error) {
                log.error(
                    { jobId, definitionId, err: error },
                    'Aggregate analysis failed'
                );
                throw error;
            }
        }
    };
}
