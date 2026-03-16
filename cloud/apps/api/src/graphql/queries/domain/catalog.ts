import { db } from '@valuerank/db';
import { builder } from '../../builder.js';
import { DomainRef } from '../../types/domain.js';
import { normalizeDomainName } from '../../../utils/domain-name.js';
import { DEFAULT_LIMIT, MAX_LIMIT } from './shared.js';

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
        include: {
          defaultLevelPresetVersion: {
            include: {
              levelPreset: true,
            },
          },
        },
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
          .map((row) => [row.domainId, row._count._all]),
      );

      return domains.map((domain) => ({
        ...domain,
        definitionCount: countByDomainId.get(domain.id) ?? 0,
      }));
    },
  }),
);

builder.queryField('domain', (t) =>
  t.field({
    type: DomainRef,
    nullable: true,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args) =>
      db.domain.findUnique({
        where: { id: String(args.id) },
        include: {
          defaultLevelPresetVersion: {
            include: {
              levelPreset: true,
            },
          },
        },
      }),
  }),
);
