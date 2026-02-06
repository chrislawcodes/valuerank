#!/usr/bin/env tsx

import { db } from '@valuerank/db';
import { updateAggregateRun } from '../services/analysis/aggregate.js';
import { createLogger } from '@valuerank/shared';

const log = createLogger('cli:trigger-aggregation');

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getPreambleVersionId(config: unknown): string | null {
    if (!isRecord(config)) return null;
    const snapshot = isRecord(config.definitionSnapshot) ? config.definitionSnapshot : undefined;
    if (!snapshot) return null;
    const meta = isRecord(snapshot._meta) ? snapshot._meta : undefined;
    const fromMeta = typeof meta?.preambleVersionId === 'string' ? meta.preambleVersionId : null;
    if (fromMeta) return fromMeta;
    const fromSnapshot = typeof snapshot.preambleVersionId === 'string' ? snapshot.preambleVersionId : null;
    return fromSnapshot ?? null;
}

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
            const preambleVersionId = getPreambleVersionId(run.config);

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
        log.error({ err }, 'Fatal error');
        process.exit(1);
    });
}
