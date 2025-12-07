/**
 * Export Routes
 *
 * REST endpoints for exporting run data.
 *
 * GET /api/export/runs/:id/csv - Download run results as CSV
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { db } from '@valuerank/db';
import { createLogger, AuthenticationError, NotFoundError } from '@valuerank/shared';

import {
  getCSVHeader,
  formatCSVRow,
  transcriptToCSVRow,
  generateExportFilename,
} from '../services/export/csv.js';

const log = createLogger('export');

export const exportRouter = Router();

/**
 * GET /api/export/runs/:id/csv
 *
 * Download run results as CSV file.
 * Streams the response to handle large exports.
 *
 * Requires authentication.
 */
exportRouter.get(
  '/runs/:id/csv',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check authentication
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = req.params.id;
      if (!runId) {
        throw new NotFoundError('Run', 'missing');
      }

      log.info({ userId: req.user.id, runId }, 'Exporting run as CSV');

      // Verify run exists
      const run = await db.run.findUnique({
        where: { id: runId },
        select: { id: true, status: true },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      // Get transcripts for the run
      const transcripts = await db.transcript.findMany({
        where: { runId },
        orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }],
      });

      log.info({ runId, transcriptCount: transcripts.length }, 'Transcripts fetched for export');

      // Set response headers
      const filename = generateExportFilename(runId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Write BOM for Excel compatibility
      res.write('\uFEFF');

      // Write header
      res.write(getCSVHeader() + '\n');

      // Stream rows
      for (const transcript of transcripts) {
        const row = transcriptToCSVRow(transcript);
        res.write(formatCSVRow(row) + '\n');
      }

      log.info({ runId, rowsWritten: transcripts.length }, 'CSV export complete');

      res.end();
    } catch (err) {
      next(err);
    }
  }
);
