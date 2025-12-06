import { builder } from '../builder.js';
import { db, type Definition } from '@valuerank/db';
import { RunRef } from './run.js';
import { ScenarioRef } from './scenario.js';

// Definition GraphQL object type
export const DefinitionRef = builder.objectRef<Definition>('Definition');

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
  }),
});
