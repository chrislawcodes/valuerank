import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { DomainRef } from '../types/domain.js';
import { normalizeDomainName } from '../../utils/domain-name.js';
import { zAnalysisOutput } from '../../services/analysis/aggregate.js';

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 50;
const DOMAIN_ANALYSIS_VALUE_KEYS = [
  'Self_Direction_Action',
  'Universalism_Nature',
  'Benevolence_Dependability',
  'Security_Personal',
  'Power_Dominance',
  'Achievement',
  'Tradition',
  'Stimulation',
  'Hedonism',
  'Conformity_Interpersonal',
] as const;

type DomainAnalysisValueKey = (typeof DOMAIN_ANALYSIS_VALUE_KEYS)[number];

type DefinitionRow = {
  id: string;
  parentId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type DomainAnalysisValueScore = {
  valueKey: DomainAnalysisValueKey;
  score: number;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalComparisons: number;
};

type DomainAnalysisModel = {
  model: string;
  label: string;
  values: DomainAnalysisValueScore[];
};

type DomainAnalysisUnavailableModel = {
  model: string;
  label: string;
  reason: string;
};

type DomainAnalysisResult = {
  domainId: string;
  domainName: string;
  totalDefinitions: number;
  targetedDefinitions: number;
  definitionsWithAnalysis: number;
  models: DomainAnalysisModel[];
  unavailableModels: DomainAnalysisUnavailableModel[];
  generatedAt: Date;
};

const DomainAnalysisValueScoreRef = builder.objectRef<DomainAnalysisValueScore>('DomainAnalysisValueScore');
const DomainAnalysisModelRef = builder.objectRef<DomainAnalysisModel>('DomainAnalysisModel');
const DomainAnalysisUnavailableModelRef = builder.objectRef<DomainAnalysisUnavailableModel>('DomainAnalysisUnavailableModel');
const DomainAnalysisResultRef = builder.objectRef<DomainAnalysisResult>('DomainAnalysisResult');

builder.objectType(DomainAnalysisValueScoreRef, {
  fields: (t) => ({
    valueKey: t.exposeString('valueKey'),
    score: t.exposeFloat('score'),
    prioritized: t.exposeInt('prioritized'),
    deprioritized: t.exposeInt('deprioritized'),
    neutral: t.exposeInt('neutral'),
    totalComparisons: t.exposeInt('totalComparisons'),
  }),
});

builder.objectType(DomainAnalysisModelRef, {
  fields: (t) => ({
    model: t.exposeString('model'),
    label: t.exposeString('label'),
    values: t.field({
      type: [DomainAnalysisValueScoreRef],
      resolve: (parent) => parent.values,
    }),
  }),
});

builder.objectType(DomainAnalysisUnavailableModelRef, {
  fields: (t) => ({
    model: t.exposeString('model'),
    label: t.exposeString('label'),
    reason: t.exposeString('reason'),
  }),
});

builder.objectType(DomainAnalysisResultRef, {
  fields: (t) => ({
    domainId: t.exposeID('domainId'),
    domainName: t.exposeString('domainName'),
    totalDefinitions: t.exposeInt('totalDefinitions'),
    targetedDefinitions: t.exposeInt('targetedDefinitions'),
    definitionsWithAnalysis: t.exposeInt('definitionsWithAnalysis'),
    models: t.field({
      type: [DomainAnalysisModelRef],
      resolve: (parent) => parent.models,
    }),
    unavailableModels: t.field({
      type: [DomainAnalysisUnavailableModelRef],
      resolve: (parent) => parent.unavailableModels,
    }),
    generatedAt: t.field({
      type: 'DateTime',
      resolve: (parent) => parent.generatedAt,
    }),
  }),
});

function isDomainAnalysisValueKey(value: string): value is DomainAnalysisValueKey {
  return DOMAIN_ANALYSIS_VALUE_KEYS.includes(value as DomainAnalysisValueKey);
}

function getLineageRootId(definition: DefinitionRow, definitionsById: Map<string, DefinitionRow>): string {
  let current = definition;
  const visited = new Set<string>([current.id]);

  while (current.parentId !== null) {
    const parent = definitionsById.get(current.parentId);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
  }

  return current.id;
}

function isNewerDefinition(left: DefinitionRow, right: DefinitionRow): boolean {
  if (left.version !== right.version) return left.version > right.version;
  const leftUpdated = left.updatedAt.getTime();
  const rightUpdated = right.updatedAt.getTime();
  if (leftUpdated !== rightUpdated) return leftUpdated > rightUpdated;
  return left.createdAt.getTime() > right.createdAt.getTime();
}

function selectLatestDefinitionPerLineage(
  definitions: DefinitionRow[],
  definitionsById: Map<string, DefinitionRow> = new Map(definitions.map((definition) => [definition.id, definition])),
): DefinitionRow[] {
  const latestByLineage = new Map<string, DefinitionRow>();

  for (const definition of definitions) {
    const lineageRootId = getLineageRootId(definition, definitionsById);
    const existing = latestByLineage.get(lineageRootId);
    if (!existing || isNewerDefinition(definition, existing)) {
      latestByLineage.set(lineageRootId, definition);
    }
  }

  return Array.from(latestByLineage.values());
}

async function hydrateDefinitionAncestors(definitions: DefinitionRow[]): Promise<Map<string, DefinitionRow>> {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));

  let missingParentIds = new Set(
    definitions
      .map((definition) => definition.parentId)
      .filter((parentId): parentId is string => parentId !== null && !definitionsById.has(parentId)),
  );

  while (missingParentIds.size > 0) {
    const parentIdsBatch = Array.from(missingParentIds);
    missingParentIds = new Set<string>();

    const missingParents = await db.definition.findMany({
      where: { id: { in: parentIdsBatch } },
      select: {
        id: true,
        parentId: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    for (const parent of missingParents) {
      if (definitionsById.has(parent.id)) continue;
      definitionsById.set(parent.id, parent);
      if (parent.parentId !== null && !definitionsById.has(parent.parentId)) {
        missingParentIds.add(parent.parentId);
      }
    }
  }

  return definitionsById;
}

builder.queryField('domains', (t) =>
  t.field({
    type: [DomainRef],
    args: {
      search: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
    },
    resolve: async (_root, args) => {
      const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = args.offset ?? 0;
      const search = args.search?.trim();
      const hasSearch = search !== undefined && search !== null && search !== '';
      const normalizedSearch = hasSearch ? normalizeDomainName(search).normalizedName : undefined;

      const domains = await db.domain.findMany({
        where: hasSearch ? { normalizedName: { contains: normalizedSearch ?? '' } } : undefined,
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      });

      if (domains.length === 0) {
        return domains;
      }

      const definitionCounts = await db.definition.groupBy({
        by: ['domainId'],
        where: {
          deletedAt: null,
          domainId: {
            in: domains.map((domain) => domain.id),
          },
        },
        _count: {
          _all: true,
        },
      });

      const countByDomainId = new Map<string, number>(
        definitionCounts
          .filter((row): row is typeof row & { domainId: string } => row.domainId !== null)
          .map((row) => [row.domainId, row._count._all])
      );

      return domains.map((domain) => ({
        ...domain,
        definitionCount: countByDomainId.get(domain.id) ?? 0,
      }));
    },
  })
);

builder.queryField('domain', (t) =>
  t.field({
    type: DomainRef,
    nullable: true,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args) => {
      return db.domain.findUnique({ where: { id: String(args.id) } });
    },
  })
);

builder.queryField('domainAnalysis', (t) =>
  t.field({
    type: DomainAnalysisResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args) => {
      const domainId = String(args.domainId);
      const domain = await db.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw new Error(`Domain not found: ${domainId}`);

      const definitions = await db.definition.findMany({
        where: { domainId, deletedAt: null },
        select: {
          id: true,
          parentId: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: { modelId: true, displayName: true },
      });
      const activeModelLabelById = new Map(activeModels.map((model) => [model.modelId, model.displayName]));

      if (definitions.length === 0) {
        return {
          domainId: domain.id,
          domainName: domain.name,
          totalDefinitions: 0,
          targetedDefinitions: 0,
          definitionsWithAnalysis: 0,
          models: [],
          unavailableModels: activeModels.map((model) => ({
            model: model.modelId,
            label: model.displayName,
            reason: 'No analyzed vignettes found in this domain.',
          })),
          generatedAt: new Date(),
        };
      }

      const definitionsById = await hydrateDefinitionAncestors(definitions);
      const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
      const latestDefinitionIds = latestDefinitions.map((definition) => definition.id);

      const aggregateRuns = await db.run.findMany({
        where: {
          definitionId: { in: latestDefinitionIds },
          status: 'COMPLETED',
          deletedAt: null,
          tags: {
            some: {
              tag: {
                name: 'Aggregate',
              },
            },
          },
        },
        orderBy: [{ definitionId: 'asc' }, { createdAt: 'desc' }],
        select: {
          definitionId: true,
          createdAt: true,
          analysisResults: {
            where: { status: 'CURRENT' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              output: true,
            },
          },
        },
      });

      const latestRunByDefinition = new Map<string, (typeof aggregateRuns)[number]>();
      for (const run of aggregateRuns) {
        if (latestRunByDefinition.has(run.definitionId)) continue;
        latestRunByDefinition.set(run.definitionId, run);
      }

      const aggregatedByModel = new Map<
        string,
        Map<DomainAnalysisValueKey, { prioritized: number; deprioritized: number; neutral: number }>
      >();
      const analyzedDefinitionIds = new Set<string>();

      for (const definitionId of latestDefinitionIds) {
        const run = latestRunByDefinition.get(definitionId);
        const analysisOutput = run?.analysisResults[0]?.output;
        if (analysisOutput == null) continue;
        const parsedOutput = zAnalysisOutput.safeParse(analysisOutput);
        if (!parsedOutput.success) continue;

        let hadAnyModelData = false;
        const perModelEntries = Object.entries(parsedOutput.data.perModel);
        for (const [modelId, modelStats] of perModelEntries) {
          const modelValues = modelStats.values;
          if (!modelValues) continue;
          hadAnyModelData = true;
          let valueMap = aggregatedByModel.get(modelId);
          if (!valueMap) {
            valueMap = new Map();
            aggregatedByModel.set(modelId, valueMap);
          }

          const valueEntries = Object.entries(modelValues);
          for (const [valueKey, valueStats] of valueEntries) {
            if (!isDomainAnalysisValueKey(valueKey)) continue;
            const existing = valueMap.get(valueKey) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
            existing.prioritized += valueStats.count.prioritized;
            existing.deprioritized += valueStats.count.deprioritized;
            existing.neutral += valueStats.count.neutral;
            valueMap.set(valueKey, existing);
          }
        }

        if (hadAnyModelData) {
          analyzedDefinitionIds.add(definitionId);
        }
      }

      const modelsWithData = Array.from(aggregatedByModel.keys()).sort((left, right) => {
        const leftLabel = activeModelLabelById.get(left) ?? left;
        const rightLabel = activeModelLabelById.get(right) ?? right;
        return leftLabel.localeCompare(rightLabel);
      });

      const models: DomainAnalysisModel[] = modelsWithData.map((modelId) => {
        const valueMap = aggregatedByModel.get(modelId)
          ?? new Map<DomainAnalysisValueKey, { prioritized: number; deprioritized: number; neutral: number }>();
        const values: DomainAnalysisValueScore[] = DOMAIN_ANALYSIS_VALUE_KEYS.map((valueKey) => {
          const counts = valueMap.get(valueKey) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
          const wins = counts.prioritized;
          const losses = counts.deprioritized;
          const score = Math.log((wins + 1) / (losses + 1));
          return {
            valueKey,
            score,
            prioritized: counts.prioritized,
            deprioritized: counts.deprioritized,
            neutral: counts.neutral,
            totalComparisons: wins + losses,
          };
        });

        return {
          model: modelId,
          label: activeModelLabelById.get(modelId) ?? modelId,
          values,
        };
      });

      const unavailableModels = activeModels
        .filter((model) => !aggregatedByModel.has(model.modelId))
        .map((model) => ({
          model: model.modelId,
          label: model.displayName,
          reason: 'No aggregate analysis data available for selected domain.',
        }));

      return {
        domainId: domain.id,
        domainName: domain.name,
        totalDefinitions: definitions.length,
        targetedDefinitions: latestDefinitions.length,
        definitionsWithAnalysis: analyzedDefinitionIds.size,
        models,
        unavailableModels,
        generatedAt: new Date(),
      };
    },
  }),
);
