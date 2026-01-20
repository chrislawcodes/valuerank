/**
 * Export Routes
 *
 * REST endpoints for exporting run and definition data.
 *
 * GET /api/export/runs/:id/csv - Download run results as CSV
 * GET /api/export/runs/:id/xlsx - Download run results as Excel with charts
 * GET /api/export/runs/:id/transcripts.json - Download full transcripts as JSON
 * GET /api/export/definitions/:id/md - Download definition as markdown
 * GET /api/export/definitions/:id/scenarios.yaml - Download scenarios as YAML
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { db, resolveDefinitionContent } from '@valuerank/db';
import { createLogger, AuthenticationError, NotFoundError, ValidationError } from '@valuerank/shared';

import {
  getCSVHeader,
  formatCSVRow,
  transcriptToCSVRow,
  generateExportFilename,
} from '../services/export/csv.js';
import { exportDefinitionAsMd } from '../services/export/md.js';
import { exportScenariosAsYaml } from '../services/export/yaml.js';
import { generateExcelExport, type RunExportData } from '../services/export/xlsx/index.js';

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

      // Get transcripts for the run with scenario relation
      const transcripts = await db.transcript.findMany({
        where: { runId },
        include: { scenario: true },
        orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }],
      });

      log.info({ runId, transcriptCount: transcripts.length }, 'Transcripts fetched for export');

      // Collect all variable names from scenario content dimensions
      // Dimensions are stored as { "Freedom": 1, "Harmony": 2, ... } (numeric scores)
      const variableSet = new Set<string>();
      for (const transcript of transcripts) {
        const content = transcript.scenario?.content as { dimensions?: Record<string, unknown> } | null;
        if (content?.dimensions) {
          for (const [key, value] of Object.entries(content.dimensions)) {
            // Only include dimensions with numeric values
            if (typeof value === 'number') {
              variableSet.add(key);
            }
          }
        }
      }
      const variableNames = Array.from(variableSet).sort();

      // Set response headers
      const filename = generateExportFilename(runId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Write BOM for Excel compatibility
      res.write('\uFEFF');

      // Write header with variable columns
      res.write(getCSVHeader(variableNames) + '\n');

      // Stream rows with variable names
      for (const transcript of transcripts) {
        const row = transcriptToCSVRow(transcript);
        res.write(formatCSVRow(row, variableNames) + '\n');
      }

      log.info({ runId, rowsWritten: transcripts.length, variableCount: variableNames.length }, 'CSV export complete');

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
 * Includes multiple worksheets: Raw Data, Model Summary, Charts, and analysis.
 *
 * Requires authentication.
 * Run must be in COMPLETED status.
 */
exportRouter.get(
  '/runs/:id/xlsx',
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

      log.info({ userId: req.user.id, runId }, 'Exporting run as XLSX');

      // Verify run exists and check status
      const run = await db.run.findUnique({
        where: { id: runId },
        select: { id: true, status: true, name: true, createdAt: true },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      // Require COMPLETED status for export
      if (run.status !== 'COMPLETED') {
        throw new ValidationError(
          `Run must be in COMPLETED status to export. Current status: ${run.status}`
        );
      }

      // Get transcripts for the run with scenario relation
      const transcripts = await db.transcript.findMany({
        where: { runId },
        include: { scenario: true },
        orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }],
      });

      // Check for empty run
      if (transcripts.length === 0) {
        throw new ValidationError('Cannot export run with no transcripts');
      }

      log.info({ runId, transcriptCount: transcripts.length }, 'Transcripts fetched for XLSX export');

      // Get analysis results if available
      const analysisResult = await db.analysisResult.findFirst({
        where: { runId },
        orderBy: { createdAt: 'desc' },
      });

      // Build export data - we need to cast the run since we only selected specific fields
      const exportData: RunExportData = {
        run: run as RunExportData['run'],
        transcripts,
        analysisResult: analysisResult?.output
          ? parseAnalysisOutput(analysisResult.output)
          : undefined,
      };

      // Generate Excel export
      const result = await generateExcelExport(exportData, {
        runId,
        includeAnalysis: true,
        includeMethods: true,
        includeCharts: true,
      });

      // Set response headers
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', result.buffer.length);

      log.info(
        { runId, filename: result.filename, bufferSize: result.buffer.length },
        'XLSX export complete'
      );

      // Send buffer
      res.send(result.buffer);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Parse analysis output JSON into typed structure.
 * Returns undefined if parsing fails.
 */
function parseAnalysisOutput(output: unknown): RunExportData['analysisResult'] | undefined {
  if (!output || typeof output !== 'object') {
    return undefined;
  }

  const parsed = output as Record<string, unknown>;
  type AnalysisResult = NonNullable<RunExportData['analysisResult']>;

  return {
    modelAgreement: parsed.modelAgreement as AnalysisResult['modelAgreement'],
    contestedScenarios: parsed.contestedScenarios as AnalysisResult['contestedScenarios'],
    dimensionImpact: parsed.dimensionImpact as AnalysisResult['dimensionImpact'],
  };
}

/**
 * GET /api/export/definitions/:id/md
 *
 * Download definition as markdown file.
 * Format is compatible with devtool's parseScenarioMd().
 *
 * Requires authentication.
 */
exportRouter.get(
  '/definitions/:id/md',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check authentication
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const definitionId = req.params.id;
      if (!definitionId) {
        throw new NotFoundError('Definition', 'missing');
      }

      log.info({ userId: req.user.id, definitionId }, 'Exporting definition as MD');

      // Get definition with resolved content (inheritance applied)
      const definitionWithContent = await resolveDefinitionContent(definitionId);

      // Get tags for category mapping
      const tags = await db.tag.findMany({
        where: {
          definitions: {
            some: {
              definitionId,
              deletedAt: null,
            },
          },
        },
      });

      // Export to MD format
      const result = exportDefinitionAsMd(
        definitionWithContent,
        definitionWithContent.resolvedContent,
        tags
      );

      log.info(
        { definitionId, filename: result.filename, contentLength: result.content.length },
        'Definition exported as MD'
      );

      // Set response headers for file download
      res.setHeader('Content-Type', `${result.mimeType}; charset=utf-8`);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/export/runs/:id/transcripts.json
 *
 * Download all transcripts for a run as a JSON file.
 * Each transcript includes full conversation content.
 *
 * Requires authentication.
 */
exportRouter.get(
  '/runs/:id/transcripts.json',
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

      log.info({ userId: req.user.id, runId }, 'Exporting transcripts as JSON');

      // Verify run exists and get basic info
      const run = await db.run.findUnique({
        where: { id: runId },
        select: {
          id: true,
          name: true,
          status: true,
          config: true,
          createdAt: true,
          completedAt: true,
          definition: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      // Get transcripts for the run with scenario relation
      const transcripts = await db.transcript.findMany({
        where: { runId },
        include: {
          scenario: {
            select: {
              id: true,
              name: true,
              content: true,
            },
          },
        },
        orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }],
      });

      log.info({ runId, transcriptCount: transcripts.length }, 'Transcripts fetched for JSON export');

      // Build export structure
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
        transcripts: transcripts.map((t) => ({
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
          decisionCode: t.decisionCode,
          decisionText: t.decisionText,
          createdAt: t.createdAt,
        })),
      };

      // Set response headers
      const date = new Date().toISOString().slice(0, 10);
      const filename = `transcripts_${runId.slice(0, 8)}_${date}.json`;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Send JSON response
      res.send(JSON.stringify(exportData, null, 2));

      log.info({ runId, transcriptCount: transcripts.length }, 'JSON export complete');
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/export/definitions/:id/scenarios.yaml
 *
 * Download scenarios as CLI-compatible YAML file.
 * Format is compatible with src/probe.py.
 *
 * Requires authentication.
 */
exportRouter.get(
  '/definitions/:id/scenarios.yaml',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check authentication
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const definitionId = req.params.id;
      if (!definitionId) {
        throw new NotFoundError('Definition', 'missing');
      }

      log.info({ userId: req.user.id, definitionId }, 'Exporting scenarios as YAML');

      // Get definition with resolved content (inheritance applied)
      const definitionWithContent = await resolveDefinitionContent(definitionId);

      // Get scenarios for this definition
      const scenarios = await db.scenario.findMany({
        where: {
          definitionId,
          deletedAt: null,
        },
        include: {
          definition: true,
        },
      });

      // Get tags for category mapping
      const tags = await db.tag.findMany({
        where: {
          definitions: {
            some: {
              definitionId,
              deletedAt: null,
            },
          },
        },
      });

      // Export to YAML format
      const result = exportScenariosAsYaml(
        definitionWithContent,
        definitionWithContent.resolvedContent,
        scenarios,
        tags
      );

      log.info(
        { definitionId, filename: result.filename, scenarioCount: scenarios.length },
        'Scenarios exported as YAML'
      );

      // Set response headers for file download
      res.setHeader('Content-Type', `${result.mimeType}; charset=utf-8`);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (err) {
      next(err);
    }
  }
);
