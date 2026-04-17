import { builder } from '../builder.js';
import { RunRef } from './refs.js';
import { getUnresolvableCount } from '../../services/unresolvable-count.js';

const UnresolvableByModel = builder
  .objectRef<{ modelId: string; count: number }>('UnresolvableByModel')
  .implement({
    fields: (t) => ({
      modelId: t.exposeString('modelId'),
      count: t.exposeInt('count'),
    }),
  });

const UnresolvableCount = builder
  .objectRef<{ total: number; byModel: { modelId: string; count: number }[] }>('UnresolvableCount')
  .implement({
    fields: (t) => ({
      total: t.exposeInt('total'),
      byModel: t.field({
        type: [UnresolvableByModel],
        resolve: (p) => p.byModel,
      }),
    }),
  });

builder.objectField(RunRef, 'unresolvableTranscriptCount', (t) =>
  t.field({
    type: UnresolvableCount,
    nullable: true,
    description: 'Count of summarized transcripts that could not be scored',
    resolve: async (run) => {
      const result = await getUnresolvableCount(run.id);
      return result.total > 0 ? result : null;
    },
  })
);
