#!/usr/bin/env tsx

import { db } from '@valuerank/db';
import { updateAggregateRun } from '../services/analysis/aggregate.js';
import { createLogger } from '@valuerank/shared';
import { parseTemperature } from '../utils/temperature.js';

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
    if (fromMeta !== null && fromMeta !== '') return fromMeta;
    const fromSnapshot = typeof snapshot.preambleVersionId === 'string' ? snapshot.preambleVersionId : null;
    return fromSnapshot ?? null;
}

export function getDefinitionVersion(config: unknown): number | null {
    if (!isRecord(config)) return null;
    const snapshot = isRecord(config.definitionSnapshot) ? config.definitionSnapshot : undefined;
    if (!snapshot) return null;
    const meta = isRecord(snapshot._meta) ? snapshot._meta : undefined;
    const raw = meta?.definitionVersion ?? snapshot.version;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw !== 'string' || raw.trim() === '') return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

export function getTemperature(config: unknown): number | null {
    if (!isRecord(config)) return null;
    return parseTemperature(config.temperature);
}

async function main() {
    log.info('Starting manual aggregation update...');

    // 1. Find all completed, non-aggregate runs and regroup by definition+preamble+version.
    const sourceRuns = await db.run.findMany({
        where: {
            status: 'COMPLETED',
            deletedAt: null,
            tags: {
                none: {
                    tag: {
                        name: 'Aggregate',
                    }
                }
            }
        },
        select: {
            id: true,
            definitionId: true,
            config: true
        }
    });

    type Group = {
        definitionId: string;
        preambleVersionId: string | null;
        definitionVersion: number | null;
        temperature: number | null;
        runCount: number;
    };
    const grouped = new Map<string, Group>();

    for (const run of sourceRuns) {
        const preambleVersionId = getPreambleVersionId(run.config);
        const definitionVersion = getDefinitionVersion(run.config);
        const temperature = getTemperature(run.config);
        const key = `${run.definitionId}::${preambleVersionId ?? 'null'}::${definitionVersion ?? 'null'}::${temperature ?? 'null'}`;
        const existing = grouped.get(key);
        if (existing) {
            existing.runCount += 1;
            continue;
        }
        grouped.set(key, {
            definitionId: run.definitionId,
            preambleVersionId,
            definitionVersion,
            temperature,
            runCount: 1,
        });
    }

    log.info(
        { sourceRunCount: sourceRuns.length, aggregateGroupCount: grouped.size },
        `Found ${grouped.size} aggregate groups from ${sourceRuns.length} source runs.`
    );

    for (const group of grouped.values()) {
        log.info(group, 'Updating aggregate group');
        try {
            await updateAggregateRun(group.definitionId, group.preambleVersionId, group.definitionVersion, group.temperature);

            log.info(group, 'Successfully updated aggregate group');
        } catch (err) {
            log.error({ err, ...group }, 'Failed to update aggregate group');
        }
    }

    log.info('Done.');
    process.exit(0);
}

// Run CLI only when executed directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        log.error({ err: err as Error }, 'Fatal error');
        process.exit(1);
    });
}
