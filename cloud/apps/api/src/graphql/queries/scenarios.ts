/**
 * Scenarios Queries
 *
 * GraphQL queries for scenario data with expanded content.
 */

import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { ScenarioRef } from '../types/refs.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

// Query: scenarios - List scenarios for a definition
builder.queryField('scenarios', (t) =>
  t.field({
    type: [ScenarioRef],
    description: `
      List scenarios for a definition with full content.

      Returns scenarios with their complete content including preamble, prompt,
      followups, and dimension values. Use this to verify scenario generation
      and inspect what will be sent to models during evaluation.
    `,
    args: {
      definitionId: t.arg.id({
        required: true,
        description: 'Definition ID to get scenarios for',
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
      const definitionId = String(args.definitionId);
      const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = args.offset ?? 0;

      ctx.log.debug({ definitionId, limit, offset }, 'Fetching scenarios');

      // Verify definition exists and is not deleted
      const definition = await db.definition.findUnique({
        where: { id: definitionId },
        select: { id: true, deletedAt: true },
      });

      if (!definition || definition.deletedAt !== null) {
        throw new Error(`Definition not found: ${definitionId}`);
      }

      // Fetch scenarios (excluding soft-deleted)
      const scenarios = await db.scenario.findMany({
        where: {
          definitionId,
          deletedAt: null,
        },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'asc' },
      });

      ctx.log.debug({ definitionId, count: scenarios.length }, 'Scenarios fetched');
      return scenarios;
    },
  })
);

// Query: scenario - Get a single scenario by ID
builder.queryField('scenario', (t) =>
  t.field({
    type: ScenarioRef,
    nullable: true,
    description: 'Fetch a single scenario by ID with full content.',
    args: {
      id: t.arg.id({
        required: true,
        description: 'Scenario ID',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);

      ctx.log.debug({ scenarioId: id }, 'Fetching scenario');

      const scenario = await db.scenario.findUnique({
        where: { id },
        include: {
          definition: {
            select: { deletedAt: true },
          },
        },
      });

      // Check scenario and definition are not deleted
      if (!scenario || scenario.deletedAt !== null || scenario.definition.deletedAt !== null) {
        ctx.log.debug({ scenarioId: id }, 'Scenario not found');
        return null;
      }

      return scenario;
    },
  })
);

// Query: scenarioCount - Get count of scenarios for a definition
builder.queryField('scenarioCount', (t) =>
  t.field({
    type: 'Int',
    description: 'Get the count of scenarios for a definition.',
    args: {
      definitionId: t.arg.id({
        required: true,
        description: 'Definition ID to count scenarios for',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const definitionId = String(args.definitionId);

      ctx.log.debug({ definitionId }, 'Counting scenarios');

      // Verify definition exists and is not deleted
      const definition = await db.definition.findUnique({
        where: { id: definitionId },
        select: { id: true, deletedAt: true },
      });

      if (!definition || definition.deletedAt !== null) {
        throw new Error(`Definition not found: ${definitionId}`);
      }

      const count = await db.scenario.count({
        where: {
          definitionId,
          deletedAt: null,
        },
      });

      ctx.log.debug({ definitionId, count }, 'Scenario count fetched');
      return count;
    },
  })
);
