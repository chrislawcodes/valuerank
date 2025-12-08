/**
 * Export Mutations
 *
 * GraphQL mutations for exporting data in various formats.
 * Supports MD (definitions), YAML (scenarios), and future formats.
 */

import { builder } from '../builder.js';
import { db, resolveDefinitionContent } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { exportDefinitionAsMd } from '../../services/export/md.js';

const log = createLogger('graphql:export');

// ============================================================================
// EXPORT RESULT TYPE
// ============================================================================

/**
 * Result of a synchronous export operation.
 */
const ExportResultRef = builder.objectRef<{
  content: string;
  filename: string;
  mimeType: string;
}>('ExportResult');

builder.objectType(ExportResultRef, {
  description: 'Result of a synchronous export operation',
  fields: (t) => ({
    content: t.exposeString('content', {
      description: 'The exported content (text/markdown/yaml/etc)',
    }),
    filename: t.exposeString('filename', {
      description: 'Suggested filename for download',
    }),
    mimeType: t.exposeString('mimeType', {
      description: 'MIME type for the content',
    }),
  }),
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Export a definition as markdown (devtool-compatible format).
 * Returns the full markdown content for immediate download.
 */
builder.mutationField('exportDefinitionAsMd', (t) =>
  t.field({
    type: ExportResultRef,
    description: 'Export a definition as markdown in devtool-compatible format',
    args: {
      id: t.arg.id({ required: true, description: 'Definition ID to export' }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);

      log.info({ definitionId: id, userId: ctx.user?.id }, 'Exporting definition as MD');

      // Get definition with resolved content (inheritance applied)
      const definitionWithContent = await resolveDefinitionContent(id);

      // Get tags for category mapping
      const tags = await db.tag.findMany({
        where: {
          definitions: {
            some: {
              definitionId: id,
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
        {
          definitionId: id,
          filename: result.filename,
          contentLength: result.content.length,
        },
        'Definition exported as MD'
      );

      return result;
    },
  })
);
