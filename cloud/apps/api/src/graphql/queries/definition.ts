import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import type { Prisma } from '@valuerank/db';
import { DefinitionRef } from '../types/definition.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_DEPTH = 10;

// Type for raw query results - content comes as JsonValue from Prisma
// Note: deletedAt is intentionally omitted - soft delete is filtered at DB layer
type RawDefinitionRow = {
  id: string;
  parent_id: string | null;
  name: string;
  content: Prisma.JsonValue;
  expansion_progress: Prisma.JsonValue | null;
  created_at: Date;
  updated_at: Date;
  last_accessed_at: Date | null;
  created_by_user_id: string | null;
  deleted_by_user_id: string | null;
};

// Query: definition(id: ID!) - Fetch single definition by ID
builder.queryField('definition', (t) =>
  t.field({
    type: DefinitionRef,
    nullable: true,
    description: 'Fetch a single definition by ID. Returns null if not found.',
    args: {
      id: t.arg.id({ required: true, description: 'Definition ID' }),
      includeDeleted: t.arg.boolean({
        required: false,
        description: 'Include soft-deleted definitions (default: false)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      const includeDeleted = args.includeDeleted ?? false;
      ctx.log.debug({ definitionId: id, includeDeleted }, 'Fetching definition');

      const definition = await db.definition.findUnique({
        where: { id },
      });

      // Filter out soft-deleted definitions unless includeDeleted is true
      if (!definition || (!includeDeleted && definition.deletedAt !== null)) {
        ctx.log.debug({ definitionId: id }, 'Definition not found');
        return null;
      }

      return definition;
    },
  })
);

// Query: definitions with enhanced filtering
builder.queryField('definitions', (t) =>
  t.field({
    type: [DefinitionRef],
    description: 'List definitions with enhanced filtering, search, and pagination.',
    args: {
      rootOnly: t.arg.boolean({
        required: false,
        description: 'If true, return only root definitions (no parent)',
      }),
      search: t.arg.string({
        required: false,
        description: 'Search by definition name (case-insensitive contains)',
      }),
      tagIds: t.arg.idList({
        required: false,
        description: 'Filter by tag IDs (OR logic - matches any of the tags)',
      }),
      hasRuns: t.arg.boolean({
        required: false,
        description: 'Only definitions that have been used in runs',
      }),
      limit: t.arg.int({
        required: false,
        description: `Maximum number of results (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`,
      }),
      offset: t.arg.int({
        required: false,
        description: 'Number of results to skip for pagination (default: 0)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      // Validate and apply defaults
      const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = args.offset ?? 0;

      ctx.log.debug(
        { rootOnly: args.rootOnly, search: args.search, tagIds: args.tagIds, hasRuns: args.hasRuns, limit, offset },
        'Listing definitions'
      );

      // Build where clause - always filter out soft-deleted definitions
      const where: Prisma.DefinitionWhereInput = {
        deletedAt: null,
      };

      if (args.rootOnly) {
        where.parentId = null;
      }

      if (args.search) {
        where.name = { contains: args.search, mode: 'insensitive' };
      }

      if (args.tagIds && args.tagIds.length > 0) {
        // Tag filtering with inheritance support:
        // Find definitions that have the tag directly OR have an ancestor with the tag
        const tagIdStrings = args.tagIds.map(String);

        // Use a CTE to find all definitions that match via direct or inherited tags
        const matchingDefinitions = await db.$queryRaw<{ id: string }[]>`
          WITH RECURSIVE
          -- Get definitions with direct tags
          direct_tagged AS (
            SELECT DISTINCT dt.definition_id as id
            FROM definition_tags dt
            WHERE dt.tag_id = ANY(${tagIdStrings}::text[])
            AND dt.deleted_at IS NULL
          ),
          -- Get all descendants of directly tagged definitions (they inherit the tag)
          inherited AS (
            SELECT d.id, d.parent_id
            FROM definitions d
            JOIN direct_tagged dt ON d.id = dt.id
            WHERE d.deleted_at IS NULL
            UNION ALL
            SELECT d.id, d.parent_id
            FROM definitions d
            JOIN inherited i ON d.parent_id = i.id
            WHERE d.deleted_at IS NULL
          )
          SELECT DISTINCT id FROM inherited
        `;

        const matchingIds = matchingDefinitions.map((d) => d.id);

        if (matchingIds.length === 0) {
          // No definitions match the tag filter
          ctx.log.debug({ count: 0 }, 'No definitions match tag filter');
          return [];
        }

        where.id = { in: matchingIds };
      }

      if (args.hasRuns) {
        // Only definitions that have at least one run
        where.runs = { some: {} };
      }

      const definitions = await db.definition.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      });

      ctx.log.debug({ count: definitions.length }, 'Definitions fetched');
      return definitions;
    },
  })
);

// Query: definitionAncestors - Get full ancestry chain to root
builder.queryField('definitionAncestors', (t) =>
  t.field({
    type: [DefinitionRef],
    description: 'Get ancestors of a definition (full chain to root). Returns definitions ordered from root to immediate parent.',
    args: {
      id: t.arg.id({
        required: true,
        description: 'Definition ID to get ancestors for',
      }),
      maxDepth: t.arg.int({
        required: false,
        description: `Maximum depth to traverse (default: ${DEFAULT_MAX_DEPTH})`,
      }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      const maxDepth = args.maxDepth ?? DEFAULT_MAX_DEPTH;

      ctx.log.debug({ definitionId: id, maxDepth }, 'Fetching definition ancestors');

      // Verify definition exists and is not deleted
      const definition = await db.definition.findUnique({
        where: { id },
      });

      if (!definition || definition.deletedAt !== null) {
        throw new Error(`Definition not found: ${id}`);
      }

      // Use recursive CTE to get all ancestors (filtering out deleted)
      const ancestors = await db.$queryRaw<RawDefinitionRow[]>`
        WITH RECURSIVE ancestry AS (
          SELECT d.*, 1 as depth FROM definitions d WHERE d.id = ${id} AND d.deleted_at IS NULL
          UNION ALL
          SELECT d.*, a.depth + 1 FROM definitions d
          JOIN ancestry a ON d.id = a.parent_id
          WHERE a.parent_id IS NOT NULL AND a.depth < ${maxDepth} AND d.deleted_at IS NULL
        )
        SELECT id, parent_id, name, content, expansion_progress, created_at, updated_at, last_accessed_at, created_by_user_id, deleted_by_user_id
        FROM ancestry
        WHERE id != ${id}
        ORDER BY created_at ASC
      `;

      // Map raw results to Definition format with camelCase properties
      const mappedAncestors = ancestors.map((a) => ({
        id: a.id,
        parentId: a.parent_id,
        name: a.name,
        content: a.content,
        expansionProgress: a.expansion_progress,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
        lastAccessedAt: a.last_accessed_at,
        createdByUserId: a.created_by_user_id,
        deletedByUserId: a.deleted_by_user_id,
      }));

      ctx.log.debug({ count: mappedAncestors.length }, 'Ancestors fetched');
      return mappedAncestors;
    },
  })
);

// Query: definitionDescendants - Get full descendant tree
builder.queryField('definitionDescendants', (t) =>
  t.field({
    type: [DefinitionRef],
    description: 'Get descendants of a definition (full subtree). Returns definitions ordered by creation date (newest first).',
    args: {
      id: t.arg.id({
        required: true,
        description: 'Definition ID to get descendants for',
      }),
      maxDepth: t.arg.int({
        required: false,
        description: `Maximum depth to traverse (default: ${DEFAULT_MAX_DEPTH})`,
      }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      const maxDepth = args.maxDepth ?? DEFAULT_MAX_DEPTH;

      ctx.log.debug({ definitionId: id, maxDepth }, 'Fetching definition descendants');

      // Verify definition exists and is not deleted
      const definition = await db.definition.findUnique({
        where: { id },
      });

      if (!definition || definition.deletedAt !== null) {
        throw new Error(`Definition not found: ${id}`);
      }

      // Use recursive CTE to get all descendants (filtering out deleted)
      const descendants = await db.$queryRaw<RawDefinitionRow[]>`
        WITH RECURSIVE tree AS (
          SELECT d.*, 1 as depth FROM definitions d WHERE d.id = ${id} AND d.deleted_at IS NULL
          UNION ALL
          SELECT d.*, t.depth + 1 FROM definitions d
          JOIN tree t ON d.parent_id = t.id
          WHERE t.depth < ${maxDepth} AND d.deleted_at IS NULL
        )
        SELECT id, parent_id, name, content, expansion_progress, created_at, updated_at, last_accessed_at, created_by_user_id, deleted_by_user_id
        FROM tree
        WHERE id != ${id}
        ORDER BY created_at DESC
      `;

      // Map raw results to Definition format with camelCase properties
      const mappedDescendants = descendants.map((d) => ({
        id: d.id,
        parentId: d.parent_id,
        name: d.name,
        content: d.content,
        expansionProgress: d.expansion_progress,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        lastAccessedAt: d.last_accessed_at,
        createdByUserId: d.created_by_user_id,
        deletedByUserId: d.deleted_by_user_id,
      }));

      ctx.log.debug({ count: mappedDescendants.length }, 'Descendants fetched');
      return mappedDescendants;
    },
  })
);
