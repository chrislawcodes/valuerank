import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { db, resolveDefinitionContent } from '@valuerank/db';
import { createLogger, AuthenticationError, NotFoundError } from '@valuerank/shared';

import { exportDefinitionAsMd } from '../../services/export/md.js';
import { exportScenariosAsYaml } from '../../services/export/yaml.js';

const log = createLogger('export:definitions');

export const definitionsExportRouter = Router();

/**
 * GET /api/export/definitions/:id/md
 *
 * Download definition as markdown file.
 * Format is compatible with devtool's parseScenarioMd().
 *
 * Requires authentication.
 */
definitionsExportRouter.get(
  '/definitions/:id/md',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const definitionId = req.params.id;
      if (definitionId === undefined || definitionId === null || definitionId === '') {
        throw new NotFoundError('Definition', 'missing');
      }

      log.info({ userId: req.user.id, definitionId }, 'Exporting definition as MD');

      const definitionWithContent = await resolveDefinitionContent(definitionId);

      const tags = await db.tag.findMany({
        where: {
          definitions: {
            some: { definitionId, deletedAt: null },
          },
        },
      });

      const result = exportDefinitionAsMd(
        definitionWithContent,
        definitionWithContent.resolvedContent,
        tags
      );

      log.info(
        { definitionId, filename: result.filename, contentLength: result.content.length },
        'Definition exported as MD'
      );

      res.setHeader('Content-Type', `${result.mimeType}; charset=utf-8`);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
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
definitionsExportRouter.get(
  '/definitions/:id/scenarios.yaml',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const definitionId = req.params.id;
      if (definitionId === undefined || definitionId === null || definitionId === '') {
        throw new NotFoundError('Definition', 'missing');
      }

      log.info({ userId: req.user.id, definitionId }, 'Exporting scenarios as YAML');

      const definitionWithContent = await resolveDefinitionContent(definitionId);

      const scenarios = await db.scenario.findMany({
        where: { definitionId, deletedAt: null },
        include: { definition: true },
      });

      const tags = await db.tag.findMany({
        where: {
          definitions: {
            some: { definitionId, deletedAt: null },
          },
        },
      });

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

      res.setHeader('Content-Type', `${result.mimeType}; charset=utf-8`);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (err) {
      next(err);
    }
  }
);
