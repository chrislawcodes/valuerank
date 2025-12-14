/**
 * Import Routes
 *
 * REST endpoints for importing definitions from external formats.
 *
 * POST /api/import/definition - Import definition from markdown
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { db } from '@valuerank/db';
import type { DefinitionContent } from '@valuerank/db';
import { createLogger, AuthenticationError, ValidationError } from '@valuerank/shared';

import { parseMdToDefinition, isValidMdFormat } from '../services/import/md.js';
import { validateImport } from '../services/import/validation.js';

const log = createLogger('import');

export const importRouter = Router();

/**
 * Request body for importing a definition.
 */
type ImportDefinitionBody = {
  /** Raw markdown content */
  content: string;
  /** Optional name override (uses frontmatter name if not provided) */
  name?: string;
  /** Force import even if name conflicts (will use suggested alternative name) */
  forceAlternativeName?: boolean;
};

/**
 * POST /api/import/definition
 *
 * Import a definition from markdown content.
 * The client reads the file and sends content as JSON.
 *
 * Body:
 * - content: string (required) - Raw markdown content
 * - name: string (optional) - Override the name from frontmatter
 * - forceAlternativeName: boolean (optional) - Use alternative name on conflict
 *
 * Returns:
 * - 201: Created definition with id and name
 * - 400: Validation errors with field-specific messages
 * - 401: Authentication required
 */
importRouter.post(
  '/definition',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check authentication
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const body = req.body as ImportDefinitionBody;

      // Validate required fields
      if (!body.content || typeof body.content !== 'string') {
        throw new ValidationError('Missing required field: content', {
          field: 'content',
          message: 'Markdown content is required',
        });
      }

      // Quick format check
      if (!isValidMdFormat(body.content)) {
        throw new ValidationError('Invalid markdown format', {
          field: 'content',
          message: 'Content must be valid definition markdown with frontmatter and required sections',
        });
      }

      log.info({ userId: req.user.id, contentLength: body.content.length }, 'Importing definition from MD');

      // Parse markdown to definition structure
      const parseResult = parseMdToDefinition(body.content);

      if (!parseResult.success) {
        log.info({ userId: req.user.id, errors: parseResult.errors }, 'MD parsing failed');
        res.status(400).json({
          error: 'PARSE_ERROR',
          message: 'Failed to parse markdown content',
          details: parseResult.errors,
        });
        return;
      }

      const parsed = parseResult.data;

      // Use override name if provided, otherwise use parsed name
      const definitionName = body.name?.trim() || parsed.name;

      // Validate against database constraints
      const validation = await validateImport(definitionName, parsed.content);

      if (!validation.valid) {
        // Check if we can use alternative name
        if (body.forceAlternativeName && validation.suggestions?.alternativeName) {
          // Retry with suggested name
          const altValidation = await validateImport(
            validation.suggestions.alternativeName,
            parsed.content,
            { checkNameConflict: false }
          );

          if (altValidation.valid) {
            // Use alternative name
            const definition = await createDefinition(
              req.user.id,
              validation.suggestions.alternativeName,
              parsed
            );

            log.info(
              { userId: req.user.id, definitionId: definition.id, originalName: definitionName },
              'Definition imported with alternative name'
            );

            res.status(201).json({
              id: definition.id,
              name: definition.name,
              originalName: definitionName,
              usedAlternativeName: true,
            });
            return;
          }
        }

        log.info({ userId: req.user.id, errors: validation.errors }, 'Import validation failed');
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Definition validation failed',
          details: validation.errors,
          suggestions: validation.suggestions,
        });
        return;
      }

      // Create the definition
      const definition = await createDefinition(req.user.id, definitionName, parsed);

      log.info(
        { userId: req.user.id, definitionId: definition.id, name: definitionName },
        'Definition imported successfully'
      );

      res.status(201).json({
        id: definition.id,
        name: definition.name,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Helper to create a definition from parsed MD data.
 */
async function createDefinition(
  _userId: string,
  name: string,
  parsed: {
    content: DefinitionContent;
    category?: string;
    baseId?: string;
  }
): Promise<{ id: string; name: string }> {
  // Create definition with optional tag for category
  // Note: baseId from devtool format is not stored (not in schema)
  const definition = await db.$transaction(async (tx) => {
    const def = await tx.definition.create({
      data: {
        name,
        content: parsed.content,
      },
    });

    // Create tag if category was specified
    if (parsed.category) {
      const tag = await tx.tag.upsert({
        where: { name: parsed.category },
        update: {},
        create: { name: parsed.category },
      });

      await tx.definitionTag.create({
        data: {
          definitionId: def.id,
          tagId: tag.id,
        },
      });
    }

    return def;
  });

  return { id: definition.id, name: definition.name };
}
