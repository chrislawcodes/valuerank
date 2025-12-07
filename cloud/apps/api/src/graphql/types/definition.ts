import { builder } from '../builder.js';
import { db, type Prisma } from '@valuerank/db';
import { DefinitionRef, RunRef, ScenarioRef, TagRef } from './refs.js';

// Re-export for backward compatibility
export { DefinitionRef };

const DEFAULT_MAX_DEPTH = 10;

// Type for raw query results - content comes as unknown
type RawDefinitionRow = {
  id: string;
  parent_id: string | null;
  name: string;
  content: Prisma.JsonValue;
  created_at: Date;
  updated_at: Date;
  last_accessed_at: Date | null;
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
          where: { parentId: definition.id },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),

    // Relation: runs
    runs: t.field({
      type: [RunRef],
      description: 'Runs executed with this definition',
      resolve: async (definition) => {
        return db.run.findMany({
          where: { definitionId: definition.id },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),

    // Computed: runCount - Number of runs using this definition
    runCount: t.field({
      type: 'Int',
      description: 'Number of runs using this definition',
      resolve: async (definition) => {
        return db.run.count({
          where: { definitionId: definition.id },
        });
      },
    }),

    // Relation: scenarios
    scenarios: t.field({
      type: [ScenarioRef],
      description: 'Scenarios generated from this definition',
      resolve: async (definition) => {
        return db.scenario.findMany({
          where: { definitionId: definition.id },
          orderBy: { createdAt: 'desc' },
        });
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

    // Computed: ancestors - Full ancestry chain from this definition to root
    ancestors: t.field({
      type: [DefinitionRef],
      description: 'Full ancestry chain from this definition to root (oldest first)',
      resolve: async (definition) => {
        if (!definition.parentId) return [];

        // Use recursive CTE to get all ancestors
        const ancestors = await db.$queryRaw<RawDefinitionRow[]>`
          WITH RECURSIVE ancestry AS (
            SELECT d.*, 1 as depth FROM definitions d WHERE d.id = ${definition.id}
            UNION ALL
            SELECT d.*, a.depth + 1 FROM definitions d
            JOIN ancestry a ON d.id = a.parent_id
            WHERE a.parent_id IS NOT NULL AND a.depth < ${DEFAULT_MAX_DEPTH}
          )
          SELECT id, parent_id, name, content, created_at, updated_at, last_accessed_at
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
        }));
      },
    }),

    // Computed: descendants - All descendants forked from this definition
    descendants: t.field({
      type: [DefinitionRef],
      description: 'All descendants forked from this definition (newest first)',
      resolve: async (definition) => {
        // Use recursive CTE to get all descendants
        const descendants = await db.$queryRaw<RawDefinitionRow[]>`
          WITH RECURSIVE tree AS (
            SELECT d.*, 1 as depth FROM definitions d WHERE d.id = ${definition.id}
            UNION ALL
            SELECT d.*, t.depth + 1 FROM definitions d
            JOIN tree t ON d.parent_id = t.id
            WHERE t.depth < ${DEFAULT_MAX_DEPTH}
          )
          SELECT id, parent_id, name, content, created_at, updated_at, last_accessed_at
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
        }));
      },
    }),
  }),
});
