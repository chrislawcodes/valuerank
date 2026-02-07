/**
 * Aggregate Analysis Handler
 *
 * Handles aggregate_analysis jobs by calling the aggregate service.
 * Used to debounce and serialize aggregation requests to prevent race conditions.
 */

import type * as PgBoss from 'pg-boss';
import { createLogger } from '@valuerank/shared';
import type { AggregateAnalysisJobData } from '../types.js';
import { updateAggregateRun } from '../../services/analysis/aggregate.js';

const log = createLogger('queue:aggregate-analysis');

/**
 * Creates a handler for aggregate_analysis jobs.
 * Returns a function that processes a batch of jobs.
 */
export function createAggregateAnalysisHandler(): PgBoss.WorkHandler<AggregateAnalysisJobData> {
    return async (jobs: PgBoss.Job<AggregateAnalysisJobData>[]) => {
        for (const job of jobs) {
            const { definitionId, preambleVersionId, definitionVersion } = job.data;
            const jobId = job.id;

            log.info(
                { jobId, definitionId, preambleVersionId, definitionVersion },
                'Processing aggregate_analysis job'
            );

            try {
                await updateAggregateRun(definitionId, preambleVersionId, definitionVersion);

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
