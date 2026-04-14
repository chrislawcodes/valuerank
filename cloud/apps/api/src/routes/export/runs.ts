import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { db } from '@valuerank/db';
import { createLogger, AuthenticationError, NotFoundError, ValidationError } from '@valuerank/shared';

import {
  getCSVHeader,
  formatCSVRow,
  transcriptToCSVRow,
  PRE_VARIABLE_HEADERS,
  POST_VARIABLE_HEADERS,
  POST_VARIABLE_HEADERS_WITH_METADATA,
  generateExportFilename,
} from '../../services/export/csv.js';
import { collectVisibleDimensionColumns } from '../../services/export/decision-display.js';
import { generateExcelExport, type RunExportData } from '../../services/export/xlsx/index.js';
import { resolveTranscriptDecisionModel } from '../../graphql/queries/domain/decision-model.js';
import { parseAnalysisOutput } from './parse-analysis.js';

const log = createLogger('export:runs');

export const runsExportRouter = Router();

function parseBooleanQueryParam(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

/**
 * GET /api/export/runs/:id/csv
 *
 * Download run results as CSV file.
 * Streams the response to handle large exports.
 */
runsExportRouter.get(
  '/runs/:id/csv',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = req.params.id;
      if (runId === undefined || runId === null || runId === '') {
        throw new NotFoundError('Run', 'missing');
      }
      const includeDecisionMetadata = parseBooleanQueryParam(req.query.includeDecisionMetadata);

      log.info({ userId: req.user.id, runId, includeDecisionMetadata }, 'Exporting run as CSV');

      const run = await db.run.findUnique({
        where: { id: runId },
        select: { id: true, status: true, config: true },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      let transcriptWhere: { runId: string } | { runId: { in: string[] } } = { runId };
      const runConfig = run.config as { isAggregate?: boolean; sourceRunIds?: string[] } | null;
      if (runConfig !== null && runConfig.isAggregate === true && Array.isArray(runConfig.sourceRunIds)) {
        log.info({ runId, sourceRunIds: runConfig.sourceRunIds }, 'Exporting aggregate run');
        transcriptWhere = { runId: { in: runConfig.sourceRunIds } };
      }

      const transcripts = await db.transcript.findMany({
        where: transcriptWhere,
        include: {
          scenario: true,
          run: {
            select: { name: true, config: true, definition: { select: { version: true } } },
          },
        },
        orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }],
      });

      log.info({ runId, transcriptCount: transcripts.length }, 'Transcripts fetched for export');

      const fixedHeaders = includeDecisionMetadata === true
        ? [...PRE_VARIABLE_HEADERS, ...POST_VARIABLE_HEADERS_WITH_METADATA]
        : [...PRE_VARIABLE_HEADERS, ...POST_VARIABLE_HEADERS];
      const dimensionColumns = collectVisibleDimensionColumns(transcripts, fixedHeaders);
      const { headers: variableNames } = dimensionColumns;

      const filename = generateExportFilename(runId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.write('\uFEFF');
      res.write(getCSVHeader(variableNames, { includeDecisionMetadata }));
      if (transcripts.length > 0) {
        res.write('\n');
      }

      transcripts.forEach((transcript) => {
        const row = transcriptToCSVRow(transcript, dimensionColumns);
        res.write(formatCSVRow(row, variableNames, { includeDecisionMetadata }));
        res.write('\n');
      });

      log.info(
        { runId, rowsWritten: transcripts.length, variableCount: variableNames.length, includeDecisionMetadata },
        'CSV export complete',
      );
      res.end();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/export/runs/:id/xlsx
 *
 * Download run results as Excel file with charts.
 * Run must be in COMPLETED status.
 */
runsExportRouter.get(
  '/runs/:id/xlsx',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = req.params.id;
      if (runId === undefined || runId === null || runId === '') {
        throw new NotFoundError('Run', 'missing');
      }

      log.info({ userId: req.user.id, runId }, 'Exporting run as XLSX');

      const run = await db.run.findUnique({
        where: { id: runId },
        select: { id: true, status: true, name: true, createdAt: true, config: true },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      if (run.status !== 'COMPLETED') {
        throw new ValidationError(
          `Run must be in COMPLETED status to export. Current status: ${run.status}`
        );
      }

      let transcriptWhere: { runId: string } | { runId: { in: string[] } } = { runId };
      const runConfig = run.config as { isAggregate?: boolean; sourceRunIds?: string[] } | null;
      if (runConfig !== null && runConfig.isAggregate === true && Array.isArray(runConfig.sourceRunIds)) {
        log.info({ runId, sourceRunIds: runConfig.sourceRunIds }, 'Exporting aggregate run (XLSX)');
        transcriptWhere = { runId: { in: runConfig.sourceRunIds } };
      }

      const transcripts = await db.transcript.findMany({
        where: transcriptWhere,
        include: {
          scenario: true,
          run: {
            select: { name: true, config: true, definition: { select: { version: true } } },
          },
        },
        orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }],
      });

      if (transcripts.length === 0) {
        throw new ValidationError('Cannot export run with no transcripts');
      }

      log.info({ runId, transcriptCount: transcripts.length }, 'Transcripts fetched for XLSX export');

      const analysisResult = await db.analysisResult.findFirst({
        where: { runId },
        orderBy: { createdAt: 'desc' },
      });

      const exportData: RunExportData = {
        run: run as RunExportData['run'],
        transcripts,
        analysisResult: (analysisResult !== null && analysisResult.output !== null && analysisResult.output !== undefined)
          ? parseAnalysisOutput(analysisResult.output)
          : undefined,
      };

      const result = await generateExcelExport(exportData, {
        runId,
        includeAnalysis: true,
        includeMethods: true,
        includeCharts: true,
      });

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);

      log.info(
        { runId, filename: result.filename, bufferSize: result.buffer.length },
        'XLSX export complete'
      );

      res.send(result.buffer);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/export/runs/:id/transcripts.json
 *
 * Download all transcripts for a run as a JSON file.
 */
runsExportRouter.get(
  '/runs/:id/transcripts.json',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = req.params.id;
      if (runId === undefined || runId === null || runId === '') {
        throw new NotFoundError('Run', 'missing');
      }

      log.info({ userId: req.user.id, runId }, 'Exporting transcripts as JSON');

      const run = await db.run.findUnique({
        where: { id: runId },
        select: {
          id: true,
          name: true,
          status: true,
          config: true,
          createdAt: true,
          completedAt: true,
          definition: { select: { id: true, name: true } },
        },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      let transcriptWhere: { runId: string } | { runId: { in: string[] } } = { runId };
      const runConfig = run.config as { isAggregate?: boolean; sourceRunIds?: string[] } | null;
      if (runConfig !== null && runConfig.isAggregate === true && Array.isArray(runConfig.sourceRunIds)) {
        log.info({ runId, sourceRunIds: runConfig.sourceRunIds }, 'Exporting aggregate run (JSON)');
        transcriptWhere = { runId: { in: runConfig.sourceRunIds } };
      }

      const transcripts = await db.transcript.findMany({
        where: transcriptWhere,
        include: {
          scenario: {
            select: {
              id: true,
              name: true,
              content: true,
              orientationFlipped: true,
            },
          },
        },
        orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }],
      });

      log.info({ runId, transcriptCount: transcripts.length }, 'Transcripts fetched for JSON export');

      const exportData = {
        exportedAt: new Date().toISOString(),
        run: {
          id: run.id,
          name: run.name,
          status: run.status,
          config: run.config,
          createdAt: run.createdAt,
          completedAt: run.completedAt,
          definition: run.definition,
        },
        transcriptCount: transcripts.length,
        transcripts: transcripts.map((t) => {
          const decision = resolveTranscriptDecisionModel({
            decisionCode: t.decisionCode,
            decisionMetadata: t.decisionMetadata,
            definitionSnapshot: t.definitionSnapshot,
            orientationFlipped: t.scenario?.orientationFlipped ?? null,
          });

          return {
            id: t.id,
            modelId: t.modelId,
            modelVersion: t.modelVersion,
            scenario: t.scenario
              ? {
                id: t.scenario.id,
                name: t.scenario.name,
                dimensions: (t.scenario.content as { dimensions?: Record<string, unknown> } | null)?.dimensions,
              }
              : null,
            content: t.content,
            turnCount: t.turnCount,
            tokenCount: t.tokenCount,
            durationMs: t.durationMs,
            estimatedCost: t.estimatedCost,
            decision: decision.canonical.direction === 'unknown'
              ? null
              : {
                direction: decision.canonical.direction,
                strength: decision.canonical.strength,
                favoredValueKey: decision.canonical.favoredValueKey,
                opposedValueKey: decision.canonical.opposedValueKey,
              },
            decisionText: t.decisionText,
            decisionMetadata: t.decisionMetadata,
            createdAt: t.createdAt,
          };
        }),
      };

      const date = new Date().toISOString().slice(0, 10);
      const filename = `transcripts_${runId.slice(0, 8)}_${date}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(JSON.stringify(exportData, null, 2));

      log.info({ runId, transcriptCount: transcripts.length }, 'JSON export complete');
    } catch (err) {
      next(err);
    }
  }
);
