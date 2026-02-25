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
import { resolveDomainSignatureRunIds } from '../services/domain.js';

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
      if (runId === undefined || runId === null || runId === '') {
        throw new NotFoundError('Run', 'missing');
      }

      log.info({ userId: req.user.id, runId }, 'Exporting run as CSV');

      // Verify run exists
      const run = await db.run.findUnique({
        where: { id: runId },
        select: { id: true, status: true, config: true },
      });

      if (!run) {
        throw new NotFoundError('Run', runId);
      }

      // Handle Aggregate Runs
      // If aggregate, fetch transcripts from source runs
      let transcriptWhere: { runId: string } | { runId: { in: string[] } } = { runId };
      const runConfig = run.config as { isAggregate?: boolean; sourceRunIds?: string[] } | null;
      if (runConfig !== null && runConfig.isAggregate === true && Array.isArray(runConfig.sourceRunIds)) {
        log.info({ runId, sourceRunIds: runConfig.sourceRunIds }, 'Exporting aggregate run');
        transcriptWhere = { runId: { in: runConfig.sourceRunIds } };
      }

      // Get transcripts for the run with scenario relation
      const transcripts = await db.transcript.findMany({
        where: transcriptWhere,
        include: {
          scenario: true,
          run: {
            select: { name: true },
          },
        },
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
      if (runId === undefined || runId === null || runId === '') {
        throw new NotFoundError('Run', 'missing');
      }

      log.info({ userId: req.user.id, runId }, 'Exporting run as XLSX');

      // Verify run exists and check status
      const run = await db.run.findUnique({
        where: { id: runId },
        select: { id: true, status: true, name: true, createdAt: true, config: true },
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

      // Handle Aggregate Runs
      // If aggregate, fetch transcripts from source runs
      let transcriptWhere: { runId: string } | { runId: { in: string[] } } = { runId };
      const runConfig = run.config as { isAggregate?: boolean; sourceRunIds?: string[] } | null;
      if (runConfig !== null && runConfig.isAggregate === true && Array.isArray(runConfig.sourceRunIds)) {
        log.info({ runId, sourceRunIds: runConfig.sourceRunIds }, 'Exporting aggregate run (XLSX)');
        transcriptWhere = { runId: { in: runConfig.sourceRunIds } };
      }

      // Get transcripts for the run with scenario relation
      const transcripts = await db.transcript.findMany({
        where: transcriptWhere,
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
        analysisResult: (analysisResult !== null && analysisResult.output !== null && analysisResult.output !== undefined)
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
 * GET /api/export/domains/:id/transcripts.csv
 *
 * Download all analyzable transcripts for a domain scoped to the selected
 * signature (or the default vnew signature if omitted).
 *
 * Includes all models and all latest-vignette runs matching the signature.
 * Only rows with decisionCode in 1–5 are included (consistent with domain analysis).
 * Streams the response to handle large exports.
 *
 * Requires authentication.
 */
exportRouter.get(
  '/domains/:id/transcripts.csv',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const domainId = req.params.id;
      if (domainId === undefined || domainId === null || domainId === '') {
        throw new NotFoundError('Domain', 'missing');
      }

      const signature = typeof req.query.signature === 'string' && req.query.signature !== ''
        ? req.query.signature
        : null;

      log.info({ userId: req.user.id, domainId, signature }, 'Exporting domain transcripts as CSV');

      const resolved = await resolveDomainSignatureRunIds(domainId, signature);
      if (!resolved) {
        throw new NotFoundError('Domain', domainId);
      }

      const { domain, filteredSourceRunIds, resolvedSignature } = resolved;

      const transcripts = filteredSourceRunIds.length > 0
        ? await db.transcript.findMany({
          where: {
            runId: { in: filteredSourceRunIds },
            deletedAt: null,
            decisionCode: { in: ['1', '2', '3', '4', '5'] },
          },
          include: {
            scenario: true,
            run: { select: { name: true } },
          },
          orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }],
        })
        : [];

      log.info(
        { domainId, transcriptCount: transcripts.length, resolvedSignature },
        'Transcripts fetched for domain CSV export',
      );

      // Collect variable names for dynamic column headers
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

      // Build filename: omit signature segment when not resolved
      const safeName = domain.name.replace(/[^a-z0-9-]/gi, '_').toLowerCase();
      const date = new Date().toISOString().slice(0, 10);
      const filename = resolvedSignature !== null
        ? `domain-${safeName}-${resolvedSignature.replace(/[^a-z0-9-]/gi, '_').toLowerCase()}-transcripts-${date}.csv`
        : `domain-${safeName}-transcripts-${date}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      res.write('\uFEFF');
      res.write(getCSVHeader(variableNames) + '\n');

      for (const transcript of transcripts) {
        const row = transcriptToCSVRow(transcript);
        res.write(formatCSVRow(row, variableNames) + '\n');
      }

      log.info(
        { domainId, rowsWritten: transcripts.length, variableCount: variableNames.length },
        'Domain CSV export complete',
      );

      res.end();
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Parse analysis output JSON into typed structure for Excel export.
 * Transforms the database analysis format to the export format.
 * Returns undefined if parsing fails.
 */
function parseAnalysisOutput(output: unknown): RunExportData['analysisResult'] | undefined {
  if (output === null || output === undefined || typeof output !== 'object') {
    return undefined;
  }

  const parsed = output as Record<string, unknown>;

  type AnalysisResult = NonNullable<RunExportData['analysisResult']>;

  // Transform modelAgreement from pairwise format to matrix format
  let modelAgreement: AnalysisResult['modelAgreement'];
  const rawModelAgreement = parsed.modelAgreement as {
    pairwise?: Record<string, { spearmanRho?: number }>;
  } | undefined;

  if (rawModelAgreement?.pairwise) {
    // Extract unique model names from pairwise keys (format: "model1:model2")
    const modelSet = new Set<string>();
    for (const key of Object.keys(rawModelAgreement.pairwise)) {
      const [model1, model2] = key.split(':');
      if (typeof model1 === 'string' && model1 !== '') modelSet.add(model1);
      if (typeof model2 === 'string' && model2 !== '') modelSet.add(model2);
    }
    const models = Array.from(modelSet).sort();

    // Build correlation matrix
    const correlationMatrix: number[][] = models.map((m1, i) =>
      models.map((m2, j) => {
        if (i === j) return 1; // Self-correlation is 1
        // Try both orderings of the model pair
        const key1 = `${m1}:${m2}`;
        const key2 = `${m2}:${m1}`;
        const pairData = rawModelAgreement.pairwise?.[key1] ?? rawModelAgreement.pairwise?.[key2];
        return pairData?.spearmanRho ?? 0;
      })
    );

    if (models.length >= 2) {
      modelAgreement = { models, correlationMatrix };
    }
  }

  // Transform mostContestedScenarios to contestedScenarios format
  let contestedScenarios: AnalysisResult['contestedScenarios'];
  const rawContested = parsed.mostContestedScenarios as Array<{
    scenarioId?: string;
    scenarioName?: string;
    variance?: number;
    modelScores?: Record<string, number>;
  }> | undefined;

  if (rawContested && Array.isArray(rawContested) && rawContested.length > 0) {
    contestedScenarios = rawContested.map((s) => ({
      scenarioId: s.scenarioId ?? '',
      scenarioName: s.scenarioName ?? '',
      variance: s.variance ?? 0,
      modelResponses: s.modelScores ?? {},
    }));
  }

  // Transform dimensionAnalysis to dimensionImpact format
  let dimensionImpact: AnalysisResult['dimensionImpact'];
  const rawDimensions = parsed.dimensionAnalysis as {
    dimensions?: Record<string, { effectSize?: number; pValue?: number }>;
  } | undefined;

  if (rawDimensions?.dimensions) {
    dimensionImpact = Object.entries(rawDimensions.dimensions).map(([name, data]) => ({
      dimensionName: name,
      effectSize: data.effectSize ?? 0,
      pValue: data.pValue ?? 1,
    }));
  }

  return {
    modelAgreement,
    contestedScenarios,
    dimensionImpact,
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
      if (definitionId === undefined || definitionId === null || definitionId === '') {
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
      if (runId === undefined || runId === null || runId === '') {
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

      // Handle Aggregate Runs
      // If aggregate, fetch transcripts from source runs
      let transcriptWhere: { runId: string } | { runId: { in: string[] } } = { runId };
      const runConfig = run.config as { isAggregate?: boolean; sourceRunIds?: string[] } | null;
      if (runConfig !== null && runConfig.isAggregate === true && Array.isArray(runConfig.sourceRunIds)) {
        log.info({ runId, sourceRunIds: runConfig.sourceRunIds }, 'Exporting aggregate run (JSON)');
        transcriptWhere = { runId: { in: runConfig.sourceRunIds } };
      }

      // Get transcripts for the run with scenario relation
      const transcripts = await db.transcript.findMany({
        where: transcriptWhere,
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
      if (definitionId === undefined || definitionId === null || definitionId === '') {
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
