import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import { formatRunSignature } from './domain-coverage-gql-types.js';
import { AvailableSignatureRef, type AvailableSignatureShape } from '../types/circumplex.js';

builder.queryField('availableSignatures', (t) =>
  t.field({
    type: [AvailableSignatureRef],
    resolve: async () => {
      const runs = await db.run.findMany({
        where: {
          tags: { some: { tag: { name: 'Aggregate' } } },
          status: 'COMPLETED',
          deletedAt: null,
        },
        select: {
          config: true,
          createdAt: true,
        },
      });

      const bySignature = new Map<string, Date>();
      for (const run of runs) {
        const signature = formatRunSignature(run.config);
        const mostRecentRunAt = bySignature.get(signature);
        if (mostRecentRunAt == null || run.createdAt > mostRecentRunAt) {
          bySignature.set(signature, run.createdAt);
        }
      }

      return [...bySignature.entries()]
        .sort((left, right) => right[1].getTime() - left[1].getTime())
        .map(([signature, mostRecentRunAt]) => ({
          signature,
          mostRecentRunAt,
        } satisfies AvailableSignatureShape));
    },
  }),
);
