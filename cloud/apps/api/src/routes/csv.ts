/**
 * CSV Feed Routes
 *
 * REST endpoint for streaming CSV data directly (not as attachment).
 * Designed for Google Sheets IMPORTDATA compatibility.
 * Public access: No authentication required.
 *
 * GET /api/csv/runs/:id - Stream run results as text/csv
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { db } from '@valuerank/db';
import { createLogger, NotFoundError } from '@valuerank/shared';

import {
    getCSVHeader,
    formatCSVRow,
    transcriptToCSVRow,
} from '../services/export/csv.js';

const log = createLogger('csv');

export const csvRouter = Router();

/**
 * GET /api/csv/runs/:id
 *
 * Stream run results as plain text/csv.
 * Does NOT set Content-Disposition: attachment, so it renders inline
 * or works with IMPORTDATA.
 */
csvRouter.get(
    '/runs/:id',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Public route - no authentication required for IMPORTDATA support
            // (Removed req.user check)

            const runId = req.params.id;
            if (!runId) {
                throw new NotFoundError('Run', 'missing');
            }

            log.info({ runId }, 'CSV feed request');

            // Verify run exists
            const run = await db.run.findUnique({
                where: { id: runId },
                select: { id: true, status: true },
            });

            if (!run) {
                throw new NotFoundError('Run', runId);
            }

            // Get transcripts
            const transcripts = await db.transcript.findMany({
                where: { runId },
                include: { scenario: true },
                orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }],
            });

            // Collect variable names
            const variableSet = new Set<string>();
            for (const transcript of transcripts) {
                const content = transcript.scenario?.content as { dimensions?: Record<string, unknown> } | null;
                if (content?.dimensions) {
                    for (const [key, value] of Object.entries(content.dimensions)) {
                        if (typeof value === 'number') {
                            variableSet.add(key);
                        }
                    }
                }
            }
            const variableNames = Array.from(variableSet).sort();

            // headers - text/csv, no attachment disposition
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');

            // Write BOM
            res.write('\uFEFF');

            // Write header
            res.write(getCSVHeader(variableNames) + '\n');

            // Stream rows
            for (const transcript of transcripts) {
                const row = transcriptToCSVRow(transcript);
                res.write(formatCSVRow(row, variableNames) + '\n');
            }

            log.info({ runId, rowsWritten: transcripts.length }, 'CSV feed complete');

            res.end();
        } catch (err) {
            next(err);
        }
    }
);
