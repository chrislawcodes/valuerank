import { builder } from '../builder.js';
import {
  db,
  resolveDefinitionContent,
  parseStoredContent,
  getContentOverrides,
  type Prisma,
  type DefinitionOverrides,
} from '@valuerank/db';
import { DefinitionRef, RunRef, ScenarioRef, TagRef } from './refs.js';
import { UserRef } from './user.js';
import {
  getDefinitionExpansionStatus,
  type DefinitionExpansionStatus,
} from '../../services/scenario/index.js';

// Re-export for backward compatibility
export { DefinitionRef };

const DEFAULT_MAX_DEPTH = 10;

// GraphQL type for inheritance override indicators
const DefinitionOverridesRef = builder.objectRef<DefinitionOverrides>('DefinitionOverrides');

builder.objectType(DefinitionOverridesRef, {
  description: 'Indicates which content fields are locally overridden vs inherited from parent',
  fields: (t) => ({
    preamble: t.exposeBoolean('preamble', {
      description: 'True if preamble is locally defined, false if inherited',
    }),
    template: t.exposeBoolean('template', {
      description: 'True if template is locally defined, false if inherited',
    }),
    dimensions: t.exposeBoolean('dimensions', {
      description: 'True if dimensions are locally defined, false if inherited',
    }),
    matchingRules: t.exposeBoolean('matching_rules', {
      description: 'True if matching rules are locally defined, false if inherited',
    }),
  }),
});

// GraphQL enum for expansion job status
const ExpansionJobStatusEnum = builder.enumType('ExpansionJobStatus', {
  description: 'Status of a scenario expansion job',
  values: {
    PENDING: { value: 'pending', description: 'Job is queued and waiting to run' },
    ACTIVE: { value: 'active', description: 'Job is currently running' },
    COMPLETED: { value: 'completed', description: 'Job completed successfully' },
    FAILED: { value: 'failed', description: 'Job failed' },
    NONE: { value: 'none', description: 'No expansion job exists' },
  },
});

// GraphQL type for expansion status
const ExpansionStatusRef = builder.objectRef<DefinitionExpansionStatus>('ExpansionStatus');

builder.objectType(ExpansionStatusRef, {
  description: 'Status of scenario expansion for a definition',
  fields: (t) => ({
    status: t.field({
      type: ExpansionJobStatusEnum,
      description: 'Current status of the expansion job',
      resolve: (parent) => parent.status,
    }),
    jobId: t.exposeString('jobId', {
      nullable: true,
      description: 'ID of the expansion job (if any)',
    }),
    triggeredBy: t.exposeString('triggeredBy', {
      nullable: true,
      description: 'What triggered the expansion (create, update, fork)',
    }),
    createdAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'When the expansion job was created',
      resolve: (parent) => parent.createdAt,
    }),
    completedAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'When the expansion job completed',
      resolve: (parent) => parent.completedAt,
    }),
    error: t.exposeString('error', {
      nullable: true,
      description: 'Error message if the job failed',
    }),
    scenarioCount: t.exposeInt('scenarioCount', {
      description: 'Number of scenarios currently generated for this definition',
    }),
  }),
});

// Type for raw query results - content comes as unknown
type RawDefinitionRow = {
  id: string;
  parent_id: string | null;
  name: string;
  content: Prisma.JsonValue;
  created_at: Date;
  updated_at: Date;
  last_accessed_at: Date | null;
  created_by_user_id: string | null;
  deleted_by_user_id: string | null;
};

builder.objectType(DefinitionRef, {
  description: 'A scenario definition that can be versioned through parent-child relationships',
  fields: (t) => ({
    // Scalar fields
    id: t.exposeID('id', { description: 'Unique identifier' }),
    name: t.exposeString('name', { description: 'Human-readable name' }),
    parentId: t.exposeID('parentId', {
      nullable: true,
      description: 'ID of parent definition (null for root definitions)',
    }),
    content: t.expose('content', {
      type: 'JSON',
      description: 'JSONB content with scenario configuration',
    }),
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
      description: 'When this definition was created',
    }),
    updatedAt: t.expose('updatedAt', {
      type: 'DateTime',
      description: 'When this definition was last updated',
    }),
    lastAccessedAt: t.expose('lastAccessedAt', {
      type: 'DateTime',
      nullable: true,
      description: 'When this definition was last accessed (for retention)',
    }),

    // Audit field: who created this definition
    createdBy: t.field({
      type: UserRef,
      nullable: true,
      description: 'User who created this definition',
      resolve: async (definition) => {
        if (!definition.createdByUserId) return null;
        return db.user.findUnique({
          where: { id: definition.createdByUserId },
        });
      },
    }),

    // Audit field: who deleted this definition
    deletedBy: t.field({
      type: UserRef,
      nullable: true,
      description: 'User who deleted this definition (only populated for soft-deleted records)',
      resolve: async (definition) => {
        if (!definition.deletedByUserId) return null;
        return db.user.findUnique({
          where: { id: definition.deletedByUserId },
        });
      },
    }),

    // Relation: parent (via DataLoader for N+1 prevention)
    parent: t.field({
      type: DefinitionRef,
      nullable: true,
      description: 'Parent definition in version tree',
      resolve: async (definition, _args, ctx) => {
        if (!definition.parentId) return null;
        return ctx.loaders.definition.load(definition.parentId);
      },
    }),

    // Relation: children (direct query, not via DataLoader since it's a list)
    children: t.field({
      type: [DefinitionRef],
      description: 'Child definitions forked from this one',
      resolve: async (definition) => {
        return db.definition.findMany({
          where: { parentId: definition.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),

    // Relation: runs (excludes soft-deleted)
    runs: t.field({
      type: [RunRef],
      description: 'Runs executed with this definition',
      resolve: async (definition) => {
        return db.run.findMany({
          where: { definitionId: definition.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),

    // Computed: runCount - Number of runs using this definition (excludes soft-deleted)
    runCount: t.field({
      type: 'Int',
      description: 'Number of runs using this definition',
      resolve: async (definition) => {
        return db.run.count({
          where: { definitionId: definition.id, deletedAt: null },
        });
      },
    }),

    // Relation: scenarios
    scenarios: t.field({
      type: [ScenarioRef],
      description: 'Scenarios generated from this definition',
      resolve: async (definition) => {
        return db.scenario.findMany({
          where: { definitionId: definition.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),

    // Computed: scenarioCount - Number of scenarios for this definition
    scenarioCount: t.field({
      type: 'Int',
      description: 'Number of scenarios generated from this definition',
      resolve: async (definition) => {
        return db.scenario.count({
          where: { definitionId: definition.id, deletedAt: null },
        });
      },
    }),

    // Computed: expansionStatus - Status of scenario expansion job
    expansionStatus: t.field({
      type: ExpansionStatusRef,
      description: 'Status of scenario expansion job for this definition',
      resolve: async (definition) => {
        return getDefinitionExpansionStatus(definition.id);
      },
    }),

    // Relation: tags (via DataLoader for N+1 prevention)
    tags: t.field({
      type: [TagRef],
      description: 'Tags assigned to this definition',
      resolve: async (definition, _args, ctx) => {
        return ctx.loaders.tagsByDefinition.load(definition.id);
      },
    }),

    // =========================================================================
    // INHERITANCE FIELDS (Phase 12)
    // =========================================================================

    // Computed: isForked - whether this definition has a parent
    isForked: t.field({
      type: 'Boolean',
      description: 'Whether this definition is a fork (has a parent)',
      resolve: (definition) => definition.parentId !== null,
    }),

    // Computed: resolvedContent - full content with inheritance applied
    resolvedContent: t.field({
      type: 'JSON',
      description: 'Fully resolved content after walking ancestor chain. All fields are guaranteed present.',
      resolve: async (definition) => {
        const resolved = await resolveDefinitionContent(definition.id);
        return resolved.resolvedContent;
      },
    }),

    // Computed: localContent - raw stored content showing only overrides
    localContent: t.field({
      type: 'JSON',
      description: 'Raw stored content. For forked definitions, only locally overridden fields are present.',
      resolve: (definition) => {
        return parseStoredContent(definition.content);
      },
    }),

    // Computed: overrides - which fields are locally overridden
    overrides: t.field({
      type: DefinitionOverridesRef,
      description: 'Indicates which content fields are locally defined vs inherited from parent',
      resolve: (definition) => {
        const stored = parseStoredContent(definition.content);
        return getContentOverrides(stored);
      },
    }),

    // Computed: inheritedTags - tags from all ancestors
    inheritedTags: t.field({
      type: [TagRef],
      description: 'Tags inherited from all ancestor definitions (union of ancestor tags)',
      resolve: async (definition, _args, ctx) => {
        if (!definition.parentId) return [];

        // Get all ancestors using recursive CTE
        const ancestors = await db.$queryRaw<{ id: string }[]>`
          WITH RECURSIVE ancestry AS (
            SELECT id, parent_id FROM definitions WHERE id = ${definition.id} AND deleted_at IS NULL
            UNION ALL
            SELECT d.id, d.parent_id FROM definitions d
            JOIN ancestry a ON d.id = a.parent_id
            WHERE a.parent_id IS NOT NULL AND d.deleted_at IS NULL
          )
          SELECT id FROM ancestry WHERE id != ${definition.id}
        `;

        if (ancestors.length === 0) return [];

        // Get unique tags from all ancestors
        const ancestorIds = ancestors.map((a) => a.id);
        const inheritedTags = await db.tag.findMany({
          where: {
            definitions: {
              some: {
                definitionId: { in: ancestorIds },
                deletedAt: null,
              },
            },
          },
          distinct: ['id'],
        });

        return inheritedTags;
      },
    }),

    // Computed: allTags - local tags + inherited tags (deduplicated)
    allTags: t.field({
      type: [TagRef],
      description: 'All tags including both local and inherited (deduplicated)',
      resolve: async (definition, _args, ctx) => {
        // Get local tags
        const localTags = await ctx.loaders.tagsByDefinition.load(definition.id);
        const localTagIds = new Set(localTags.map((t) => t.id));

        if (!definition.parentId) return localTags;

        // Get inherited tags
        const ancestors = await db.$queryRaw<{ id: string }[]>`
          WITH RECURSIVE ancestry AS (
            SELECT id, parent_id FROM definitions WHERE id = ${definition.id} AND deleted_at IS NULL
            UNION ALL
            SELECT d.id, d.parent_id FROM definitions d
            JOIN ancestry a ON d.id = a.parent_id
            WHERE a.parent_id IS NOT NULL AND d.deleted_at IS NULL
          )
          SELECT id FROM ancestry WHERE id != ${definition.id}
        `;

        if (ancestors.length === 0) return localTags;

        const ancestorIds = ancestors.map((a) => a.id);
        const inheritedTags = await db.tag.findMany({
          where: {
            id: { notIn: Array.from(localTagIds) }, // Exclude local tags
            definitions: {
              some: {
                definitionId: { in: ancestorIds },
                deletedAt: null,
              },
            },
          },
          distinct: ['id'],
        });

        return [...localTags, ...inheritedTags];
      },
    }),

    // Computed: ancestors - Full ancestry chain from this definition to root
    ancestors: t.field({
      type: [DefinitionRef],
      description: 'Full ancestry chain from this definition to root (oldest first)',
      resolve: async (definition) => {
        if (!definition.parentId) return [];

        // Use recursive CTE to get all ancestors (filtering out deleted)
        const ancestors = await db.$queryRaw<RawDefinitionRow[]>`
          WITH RECURSIVE ancestry AS (
            SELECT d.*, 1 as depth FROM definitions d WHERE d.id = ${definition.id} AND d.deleted_at IS NULL
            UNION ALL
            SELECT d.*, a.depth + 1 FROM definitions d
            JOIN ancestry a ON d.id = a.parent_id
            WHERE a.parent_id IS NOT NULL AND a.depth < ${DEFAULT_MAX_DEPTH} AND d.deleted_at IS NULL
          )
          SELECT id, parent_id, name, content, created_at, updated_at, last_accessed_at, created_by_user_id, deleted_by_user_id
          FROM ancestry
          WHERE id != ${definition.id}
          ORDER BY created_at ASC
        `;

        return ancestors.map((a) => ({
          id: a.id,
          parentId: a.parent_id,
          name: a.name,
          content: a.content,
          createdAt: a.created_at,
          updatedAt: a.updated_at,
          lastAccessedAt: a.last_accessed_at,
          createdByUserId: a.created_by_user_id,
          deletedByUserId: a.deleted_by_user_id,
        }));
      },
    }),

    // Computed: descendants - All descendants forked from this definition
    descendants: t.field({
      type: [DefinitionRef],
      description: 'All descendants forked from this definition (newest first)',
      resolve: async (definition) => {
        // Use recursive CTE to get all descendants (filtering out deleted)
        const descendants = await db.$queryRaw<RawDefinitionRow[]>`
          WITH RECURSIVE tree AS (
            SELECT d.*, 1 as depth FROM definitions d WHERE d.id = ${definition.id} AND d.deleted_at IS NULL
            UNION ALL
            SELECT d.*, t.depth + 1 FROM definitions d
            JOIN tree t ON d.parent_id = t.id
            WHERE t.depth < ${DEFAULT_MAX_DEPTH} AND d.deleted_at IS NULL
          )
          SELECT id, parent_id, name, content, created_at, updated_at, last_accessed_at, created_by_user_id, deleted_by_user_id
          FROM tree
          WHERE id != ${definition.id}
          ORDER BY created_at DESC
        `;

        return descendants.map((d) => ({
          id: d.id,
          parentId: d.parent_id,
          name: d.name,
          content: d.content,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          lastAccessedAt: d.last_accessed_at,
          createdByUserId: d.created_by_user_id,
          deletedByUserId: d.deleted_by_user_id,
        }));
      },
    }),
  }),
});
