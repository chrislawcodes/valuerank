import { builder } from '../builder.js';
import { db, type Prisma } from '@valuerank/db';
import { DefinitionRef } from '../types/definition.js';
import { buildDefinitionWhere } from '../utils/definition-filters.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_DEPTH = 10;


// Type for raw query results - content comes as JsonValue from Prisma
// Note: deletedAt is intentionally omitted - soft delete is filtered at DB layer
type RawDefinitionRow = {
  id: string;
  parent_id: string | null;
  domain_id: string | null;
  name: string;
  content: Prisma.JsonValue;
  expansion_progress: Prisma.JsonValue | null;
  expansion_debug: Prisma.JsonValue | null;
  created_at: Date;
  updated_at: Date;
  last_accessed_at: Date | null;
  created_by_user_id: string | null;
  deleted_by_user_id: string | null;
  version: number;
  preamble_version_id: string | null;
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
      if (definition === null || (includeDeleted === false && definition.deletedAt !== null)) {
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
        description: 'Search across vignette metadata. Terms are AND by default; use explicit OR (e.g. "fairness OR safety") for OR matching.',
      }),
      tagIds: t.arg.idList({
        required: false,
        description: 'Filter by tag IDs (OR logic - matches any of the tags)',
      }),
      hasRuns: t.arg.boolean({
        required: false,
        description: 'Only definitions that have been used in runs',
      }),
      domainId: t.arg.id({
        required: false,
        description: 'Filter by domain ID',
      }),
      withoutDomain: t.arg.boolean({
        required: false,
        description: 'Only definitions that are not assigned to any domain',
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
        {
          rootOnly: args.rootOnly,
          search: args.search,
          tagIds: args.tagIds,
          hasRuns: args.hasRuns,
          domainId: args.domainId,
          withoutDomain: args.withoutDomain,
          limit,
          offset,
        },
        'Listing definitions'
      );

      const { where, empty } = await buildDefinitionWhere(args);
      if (empty) {
        ctx.log.debug({ count: 0 }, 'No definitions match filters');
        return [];
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

      if (definition === null || definition.deletedAt !== null) {
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
        SELECT id, parent_id, domain_id, name, content, expansion_progress, expansion_debug, created_at, updated_at, last_accessed_at, created_by_user_id, deleted_by_user_id, version, preamble_version_id
        FROM ancestry
        WHERE id != ${id}
        ORDER BY created_at ASC
      `;

      // Map raw results to Definition format with camelCase properties
      const mappedAncestors = ancestors.map((a) => ({
        id: a.id,
        parentId: a.parent_id,
        domainId: a.domain_id,
        name: a.name,
        content: a.content,
        expansionProgress: a.expansion_progress,
        expansionDebug: a.expansion_debug,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
        lastAccessedAt: a.last_accessed_at,
        createdByUserId: a.created_by_user_id,
        deletedByUserId: a.deleted_by_user_id,
        version: a.version,
        preambleVersionId: a.preamble_version_id,
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

      if (definition === null || definition.deletedAt !== null) {
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
        SELECT id, parent_id, domain_id, name, content, expansion_progress, expansion_debug, created_at, updated_at, last_accessed_at, created_by_user_id, deleted_by_user_id, version, preamble_version_id
        FROM tree
        WHERE id != ${id}
        ORDER BY created_at DESC
      `;

      // Map raw results to Definition format with camelCase properties
      const mappedDescendants = descendants.map((d) => ({
        id: d.id,
        parentId: d.parent_id,
        domainId: d.domain_id,
        name: d.name,
        content: d.content,
        expansionProgress: d.expansion_progress,
        expansionDebug: d.expansion_debug,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        lastAccessedAt: d.last_accessed_at,
        createdByUserId: d.created_by_user_id,
        deletedByUserId: d.deleted_by_user_id,
        version: d.version,
        preambleVersionId: d.preamble_version_id,
      }));

      ctx.log.debug({ count: mappedDescendants.length }, 'Descendants fetched');
      return mappedDescendants;
    },
  })
);

// Query: definitionCount - Get count of definitions matching filters
builder.queryField('definitionCount', (t) =>
  t.field({
    type: 'Int',
    description: 'Get the count of definitions matching the specified filters. Useful for pagination.',
    args: {
      rootOnly: t.arg.boolean({
        required: false,
        description: 'If true, count only root definitions (no parent)',
      }),
      search: t.arg.string({
        required: false,
        description: 'Search across vignette metadata. Terms are AND by default; use explicit OR (e.g. "fairness OR safety") for OR matching.',
      }),
      tagIds: t.arg.idList({
        required: false,
        description: 'Filter by tag IDs (OR logic - matches any of the tags)',
      }),
      hasRuns: t.arg.boolean({
        required: false,
        description: 'Only definitions that have been used in runs',
      }),
      domainId: t.arg.id({
        required: false,
        description: 'Filter by domain ID',
      }),
      withoutDomain: t.arg.boolean({
        required: false,
        description: 'Only definitions that are not assigned to any domain',
      }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug(
        {
          rootOnly: args.rootOnly,
          search: args.search,
          tagIds: args.tagIds,
          hasRuns: args.hasRuns,
          domainId: args.domainId,
          withoutDomain: args.withoutDomain,
        },
        'Counting definitions'
      );

      const { where, empty } = await buildDefinitionWhere(args);
      if (empty) {
        ctx.log.debug({ count: 0 }, 'No definitions match filters');
        return 0;
      }

      const count = await db.definition.count({ where });

      ctx.log.debug({ count }, 'Definition count fetched');
      return count;
    },
  })
);
