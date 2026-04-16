import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import {
  buildRunWhere,
  parseAnalysisStatus,
  parseRunCategory,
  parseRunStatus,
  parseRunType,
} from '../../services/run/query.js';

type AnalysisFolderTagCount = {
  tagId: string;
  name: string;
  count: number;
};

type AnalysisFolderCounts = {
  aggregateCount: number;
  untaggedCount: number;
  aggregateUntaggedCount: number;
  tagCounts: AnalysisFolderTagCount[];
  aggregateTagCounts: AnalysisFolderTagCount[];
};

const AnalysisFolderTagCountRef = builder
  .objectRef<AnalysisFolderTagCount>('AnalysisFolderTagCount')
  .implement({
    fields: (t) => ({
      tagId: t.exposeString('tagId'),
      name: t.exposeString('name'),
      count: t.exposeInt('count'),
    }),
  });

const AnalysisFolderCountsRef = builder
  .objectRef<AnalysisFolderCounts>('AnalysisFolderCounts')
  .implement({
    fields: (t) => ({
      aggregateCount: t.exposeInt('aggregateCount'),
      untaggedCount: t.exposeInt('untaggedCount'),
      aggregateUntaggedCount: t.exposeInt('aggregateUntaggedCount'),
      tagCounts: t.expose('tagCounts', { type: [AnalysisFolderTagCountRef] }),
      aggregateTagCounts: t.expose('aggregateTagCounts', { type: [AnalysisFolderTagCountRef] }),
    }),
  });

builder.queryField('analysisFolderCounts', (t) =>
  t.field({
    type: AnalysisFolderCountsRef,
    description: 'Get authoritative analysis folder counts for tag-based folder view.',
    args: {
      definitionId: t.arg.string({
        required: false,
        description: 'Filter by definition ID',
      }),
      definitionTagIds: t.arg.idList({
        required: false,
        description: 'Filter by definition tag IDs',
      }),
      experimentId: t.arg.string({
        required: false,
        description: 'Filter by experiment ID',
      }),
      status: t.arg.string({
        required: false,
        description: 'Filter by status (PENDING, RUNNING, COMPLETED, FAILED, CANCELLED)',
      }),
      runCategory: t.arg.string({
        required: false,
        description: 'Filter by workflow category (PILOT, PRODUCTION, REPLICATION, VALIDATION, UNKNOWN_LEGACY)',
      }),
      analysisStatus: t.arg.string({
        required: false,
        description: 'Filter by analysis status (CURRENT or SUPERSEDED)',
      }),
      runType: t.arg.string({
        required: false,
        description: 'Filter by run type (ALL, SURVEY, NON_SURVEY)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug(
        {
          definitionId: args.definitionId,
          definitionTagIds: args.definitionTagIds,
          experimentId: args.experimentId,
          status: args.status,
          runCategory: args.runCategory,
          analysisStatus: args.analysisStatus,
          runType: args.runType,
        },
        'Counting analysis folders'
      );

      const { where, noMatches } = await buildRunWhere({
        definitionId: args.definitionId,
        definitionTagIds: args.definitionTagIds?.map(String),
        experimentId: args.experimentId,
        status: parseRunStatus(args.status),
        runCategory: parseRunCategory(args.runCategory),
        hasAnalysis: true,
        analysisStatus: parseAnalysisStatus(args.analysisStatus),
        runType: parseRunType(args.runType),
      });

      if (noMatches) {
        return {
          aggregateCount: 0,
          untaggedCount: 0,
          aggregateUntaggedCount: 0,
          tagCounts: [],
          aggregateTagCounts: [],
        };
      }

      const runs = await db.run.findMany({
        where,
        select: {
          tags: {
            select: {
              tag: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          definition: {
            select: {
              tags: {
                where: { deletedAt: null },
                select: {
                  tag: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const tagCounts = new Map<string, AnalysisFolderTagCount>();
      const aggregateTagCounts = new Map<string, AnalysisFolderTagCount>();
      let aggregateCount = 0;
      let untaggedCount = 0;
      let aggregateUntaggedCount = 0;

      for (const run of runs) {
        const isAggregate = run.tags.some((runTag) => runTag.tag.name === 'Aggregate');
        const definitionTags = run.definition.tags
          .map((definitionTag) => definitionTag.tag)
          .filter((tag) => tag.name !== 'Aggregate');

        if (isAggregate) {
          aggregateCount += 1;
        }

        if (definitionTags.length === 0) {
          if (isAggregate) {
            aggregateUntaggedCount += 1;
          } else {
            untaggedCount += 1;
          }
          continue;
        }

        const targetCounts = isAggregate ? aggregateTagCounts : tagCounts;
        for (const tag of definitionTags) {
          const existing = targetCounts.get(tag.id);
          if (existing) {
            existing.count += 1;
            continue;
          }

          targetCounts.set(tag.id, {
            tagId: tag.id,
            name: tag.name,
            count: 1,
          });
        }
      }

      const sortCounts = (counts: Map<string, AnalysisFolderTagCount>) =>
        Array.from(counts.values()).sort((left, right) => left.name.localeCompare(right.name));

      const result = {
        aggregateCount,
        untaggedCount,
        aggregateUntaggedCount,
        tagCounts: sortCounts(tagCounts),
        aggregateTagCounts: sortCounts(aggregateTagCounts),
      };

      ctx.log.debug(
        {
          aggregateCount: result.aggregateCount,
          untaggedCount: result.untaggedCount,
          aggregateUntaggedCount: result.aggregateUntaggedCount,
          tagFolderCount: result.tagCounts.length,
          aggregateTagFolderCount: result.aggregateTagCounts.length,
        },
        'Analysis folder counts fetched'
      );

      return result;
    },
  })
);
