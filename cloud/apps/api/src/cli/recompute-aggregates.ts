#!/usr/bin/env tsx

import { db } from '@valuerank/db';
import { updateAggregateRun } from '../services/analysis/aggregate.js';
import { logger } from '@valuerank/shared';

const log = logger.child({ context: 'cli:trigger-aggregation' });

async function main() {
    log.info('Starting manual aggregation update...');

    // 1. Find all runs with the "Aggregate" tag
    const aggregateRuns = await db.run.findMany({
        where: {
            tags: {
                some: {
                    tag: {
                        name: 'Aggregate'
                    }
                }
            }
        },
        select: {
            id: true,
            name: true,
            definitionId: true,
            config: true
        }
    });

    log.info({ count: aggregateRuns.length }, `Found ${aggregateRuns.length} aggregate runs.`);

    for (const run of aggregateRuns) {
        log.info({ runId: run.id, name: run.name }, `Updating aggregate run`);
        try {
            // Extract preambleVersionId from config (simulating how analyze-basic or others do it)
            // Config is JsonValue, need to cast or access safely
            const config = run.config as any;
            const preambleVersionId = config?.definitionSnapshot?._meta?.preambleVersionId ||
                config?.definitionSnapshot?.preambleVersionId ||
                null;

            log.info({ definitionId: run.definitionId, preambleVersionId }, 'Calling updateAggregateRun');

            await updateAggregateRun(run.definitionId, preambleVersionId);

            log.info({ runId: run.id }, `Successfully updated run`);
        } catch (err) {
            log.error({ err, runId: run.id }, 'Failed to update aggregate run');
        }
    }

    log.info('Done.');
    process.exit(0);
}

// Run CLI only when executed directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
