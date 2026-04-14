/**
 * Export Routes
 *
 * REST endpoints for exporting run, domain, and definition data.
 *
 * GET /api/export/runs/:id/csv               - Run results as CSV
 * GET /api/export/runs/:id/xlsx              - Run results as Excel with charts
 * GET /api/export/runs/:id/transcripts.json  - Full transcripts as JSON
 * GET /api/export/domains/:id/transcripts.csv - Domain transcripts as CSV
 * GET /api/export/definitions/:id/md         - Definition as markdown
 * GET /api/export/definitions/:id/scenarios.yaml - Scenarios as YAML
 */

import { Router } from 'express';

import { runsExportRouter } from './export/runs.js';
import { domainsExportRouter } from './export/domains.js';
import { definitionsExportRouter } from './export/definitions.js';

export const exportRouter = Router();

exportRouter.use(runsExportRouter);
exportRouter.use(domainsExportRouter);
exportRouter.use(definitionsExportRouter);
