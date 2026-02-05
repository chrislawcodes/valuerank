
/**
 * debug-aggregate-output.ts
 *
 * Debugging utility to inspect aggregate analysis output structure.
 * Used to troubleshoot scenarioDimensions missing from visualization data.
 *
 * Usage:
 *   npx tsx src/cli/debug-aggregate-output.ts
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('cli:debug-aggregate-output');

export type AggregateOutput = {
    visualizationData?: {
        scenarioDimensions?: Record<string, Record<string, number | string>>;
    };
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAggregateOutput(value: unknown): AggregateOutput | null {
    if (!isRecord(value)) return null;
    const visualizationData = isRecord(value.visualizationData) ? value.visualizationData : undefined;
    const scenarioDimensions = visualizationData && isRecord(visualizationData.scenarioDimensions)
        ? visualizationData.scenarioDimensions
        : undefined;
    return {
        visualizationData: scenarioDimensions ? { scenarioDimensions } : undefined,
    };
}

async function main() {
    const analysis = await db.analysisResult.findFirst({
        where: {
            analysisType: 'AGGREGATE',
            run: {
                tags: { some: { tag: { name: 'Aggregate' } } }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    if (!analysis) {
        log.info('No aggregate analysis found');
        return;
    }

    const output = parseAggregateOutput(analysis.output);
    const vizData = output?.visualizationData;
    log.info({ scenarioDimensions: vizData?.scenarioDimensions }, 'Scenario Dimensions');
}

void main()
    .catch((err) => {
        log.error({ err }, 'Failed to debug aggregate output');
    })
    .finally(() => {
        void db.$disconnect();
    });
