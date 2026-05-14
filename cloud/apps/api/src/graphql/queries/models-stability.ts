import { builder } from '../builder.js';
import { ModelsStabilityResultRef } from '../types/models-stability.js';
import { normalizeDomainIds } from '../../services/analysis/domain-analysis-scope.js';
import { getWinRateStabilityResult } from '../../services/analysis/win-rate-stability/snapshot-cache.js';

builder.queryField('modelsWinRateStability', (t) =>
  t.field({
    type: ModelsStabilityResultRef,
    args: {
      signature: t.arg.string({ required: false }),
      domainId: t.arg.id({ required: false }),
      domainIds: t.arg.idList({ required: false }),
    },
    resolve: async (_root, args) => {
      const signature = args.signature != null ? String(args.signature) : null;
      const domainId = args.domainId != null ? String(args.domainId) : null;
      const domainIds = normalizeDomainIds(args.domainIds?.map(String) ?? null);

      return getWinRateStabilityResult({
        domainId,
        domainIds: domainIds.length > 0 ? domainIds : null,
        signature,
      });
    },
  }),
);
