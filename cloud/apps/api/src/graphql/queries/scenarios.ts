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

type DefinitionDimension = {
  name?: unknown;
  levels?: unknown;
  values?: unknown;
};

function getDimensionLevelsFromDefinition(definitionDimension: DefinitionDimension | undefined): string[] {
  if (!definitionDimension) {
    return [];
  }

  if (Array.isArray(definitionDimension.levels)) {
    return definitionDimension.levels
      .map((level) => {
        if (level !== null && typeof level === 'object') {
          const score = (level as { score?: unknown }).score;
          if (typeof score === 'number' || typeof score === 'string') {
            return String(score);
          }
          const label = (level as { label?: unknown }).label;
          if (typeof label === 'string' && label.trim() !== '') {
            return label;
          }
        }
        return null;
      })
      .filter((value): value is string => value !== null);
  }

  if (Array.isArray(definitionDimension.values)) {
    return definitionDimension.values
      .map((value) => (typeof value === 'string' ? value : null))
      .filter((value): value is string => value !== null);
  }

  return [];
}

function getScenarioDimensions(content: unknown): Record<string, string> {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) {
    return {};
  }
  const dimensions = (content as { dimensions?: unknown }).dimensions;
  if (dimensions === null || typeof dimensions !== 'object' || Array.isArray(dimensions)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(dimensions)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    } else if (typeof value === 'number') {
      normalized[key] = String(value);
    }
  }
  return normalized;
}

function getLevelNormalizationMap(definitionDimension: DefinitionDimension | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!definitionDimension || !Array.isArray(definitionDimension.levels)) {
    return map;
  }

  for (const level of definitionDimension.levels) {
    if (level === null || typeof level !== 'object') {
      continue;
    }
    const score = (level as { score?: unknown }).score;
    const label = (level as { label?: unknown }).label;
    const scoreText = typeof score === 'number' || typeof score === 'string' ? String(score) : null;
    const labelText = typeof label === 'string' ? label : null;
    if (scoreText !== null) {
      map.set(scoreText, scoreText);
      if (labelText !== null && labelText.trim() !== '') {
        map.set(labelText, scoreText);
      }
    }
  }

  return map;
}

const RunConditionGridCellRef = builder
  .objectRef<{
    rowLevel: string;
    colLevel: string;
    trialCount: number;
    scenarioCount: number;
    scenarioIds: string[];
  }>('RunConditionGridCell')
  .implement({
    fields: (t) => ({
      rowLevel: t.exposeString('rowLevel'),
      colLevel: t.exposeString('colLevel'),
      trialCount: t.exposeInt('trialCount'),
      scenarioCount: t.exposeInt('scenarioCount'),
      scenarioIds: t.exposeStringList('scenarioIds'),
    }),
  });

const RunConditionGridRef = builder
  .objectRef<{
    attributeA: string;
    attributeB: string;
    rowLevels: string[];
    colLevels: string[];
    cells: Array<{
      rowLevel: string;
      colLevel: string;
      trialCount: number;
      scenarioCount: number;
      scenarioIds: string[];
    }>;
  }>('RunConditionGrid')
  .implement({
    fields: (t) => ({
      attributeA: t.exposeString('attributeA'),
      attributeB: t.exposeString('attributeB'),
      rowLevels: t.exposeStringList('rowLevels'),
      colLevels: t.exposeStringList('colLevels'),
      cells: t.field({
        type: [RunConditionGridCellRef],
        resolve: (parent) => parent.cells,
      }),
    }),
  });

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

builder.queryField('runConditionGrid', (t) =>
  t.field({
    type: RunConditionGridRef,
    nullable: true,
    description: 'Condition grid (attribute A x attribute B) with scenario IDs and existing trial counts.',
    args: {
      definitionId: t.arg.id({
        required: true,
        description: 'Definition ID to build condition grid for',
      }),
    },
    resolve: async (_root, args) => {
      const definitionId = String(args.definitionId);

      const definition = await db.definition.findUnique({
        where: { id: definitionId },
        select: {
          id: true,
          deletedAt: true,
          content: true,
          scenarios: {
            where: { deletedAt: null },
            select: { id: true, content: true },
          },
        },
      });

      if (!definition || definition.deletedAt !== null) {
        throw new Error(`Definition not found: ${definitionId}`);
      }

      if (definition.scenarios.length === 0) {
        return null;
      }

      const definitionContent =
        definition.content !== null && typeof definition.content === 'object' && !Array.isArray(definition.content)
          ? (definition.content as { dimensions?: unknown })
          : {};

      const definitionDimensions = Array.isArray(definitionContent.dimensions)
        ? (definitionContent.dimensions as DefinitionDimension[])
        : [];

      const firstDimensionName =
        typeof definitionDimensions[0]?.name === 'string' ? definitionDimensions[0].name : null;
      const secondDimensionName =
        typeof definitionDimensions[1]?.name === 'string' ? definitionDimensions[1].name : null;

      const fallbackDimensionNames = new Set<string>();
      for (const scenario of definition.scenarios) {
        const dimensions = getScenarioDimensions(scenario.content);
        for (const key of Object.keys(dimensions)) {
          fallbackDimensionNames.add(key);
        }
      }

      const fallbackNames = Array.from(fallbackDimensionNames);
      const attributeA = firstDimensionName ?? fallbackNames[0] ?? null;
      const attributeB = secondDimensionName ?? fallbackNames[1] ?? null;

      if (attributeA === null || attributeB === null) {
        return null;
      }

      const trialCountsByScenario = new Map<string, number>();
      const groupedCounts = await db.transcript.groupBy({
        by: ['scenarioId'],
        where: {
          deletedAt: null,
          scenarioId: { in: definition.scenarios.map((scenario) => scenario.id) },
          run: { definitionId, deletedAt: null },
        },
        _count: {
          _all: true,
        },
      });
      for (const countRow of groupedCounts) {
        if (countRow.scenarioId !== null) {
          trialCountsByScenario.set(countRow.scenarioId, countRow._count._all);
        }
      }

      const rowLevelsSet = new Set<string>();
      const colLevelsSet = new Set<string>();
      const cellMap = new Map<
        string,
        { rowLevel: string; colLevel: string; trialCount: number; scenarioCount: number; scenarioIds: string[] }
      >();
      const definitionDimA = definitionDimensions.find((dimension) => dimension.name === attributeA);
      const definitionDimB = definitionDimensions.find((dimension) => dimension.name === attributeB);
      const normalizationMapA = getLevelNormalizationMap(definitionDimA);
      const normalizationMapB = getLevelNormalizationMap(definitionDimB);

      for (const scenario of definition.scenarios) {
        const dimensions = getScenarioDimensions(scenario.content);
        const rawRowLevel = dimensions[attributeA] ?? 'N/A';
        const rawColLevel = dimensions[attributeB] ?? 'N/A';
        const rowLevel = normalizationMapA.get(rawRowLevel) ?? rawRowLevel;
        const colLevel = normalizationMapB.get(rawColLevel) ?? rawColLevel;
        rowLevelsSet.add(rowLevel);
        colLevelsSet.add(colLevel);
        const key = `${rowLevel}::${colLevel}`;
        const existing = cellMap.get(key) ?? {
          rowLevel,
          colLevel,
          trialCount: 0,
          scenarioCount: 0,
          scenarioIds: [],
        };
        existing.scenarioCount += 1;
        existing.trialCount += trialCountsByScenario.get(scenario.id) ?? 0;
        existing.scenarioIds.push(scenario.id);
        cellMap.set(key, existing);
      }

      const baseRowLevels = getDimensionLevelsFromDefinition(definitionDimA);
      const baseColLevels = getDimensionLevelsFromDefinition(definitionDimB);

      const rowLevels =
        baseRowLevels.length > 0
          ? baseRowLevels
          : Array.from(rowLevelsSet)
            .filter((level) => level !== 'N/A')
            .sort();
      const colLevels =
        baseColLevels.length > 0
          ? baseColLevels
          : Array.from(colLevelsSet)
            .filter((level) => level !== 'N/A')
            .sort();

      const cells = rowLevels.flatMap((rowLevel) =>
        colLevels.map((colLevel) => {
          const key = `${rowLevel}::${colLevel}`;
          return (
            cellMap.get(key) ?? {
              rowLevel,
              colLevel,
              trialCount: 0,
              scenarioCount: 0,
              scenarioIds: [],
            }
          );
        })
      );

      return {
        attributeA,
        attributeB,
        rowLevels,
        colLevels,
        cells,
      };
    },
  })
);
