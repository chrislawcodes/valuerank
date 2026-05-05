import { getDomainAnalysisResult } from '../../../../services/analysis/domain-analysis-cache.js';
import { builder } from '../../../builder.js';
import {
  DomainAnalysisResultRef,
} from '../types.js';
import { parseDomainAnalysisScope } from '../../../../services/analysis/domain-analysis-scope.js';
import type { ClusteringMethod } from '../../domain-clustering.js';

builder.queryField('domainAnalysis', (t) =>
  t.field({
    type: DomainAnalysisResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      scope: t.arg.string({ required: false }),
      signature: t.arg.string({ required: false }),
      clusteringMethod: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = String(args.domainId);
      const scope = parseDomainAnalysisScope(args.scope);
      const requestedSignature = typeof args.signature === 'string' && args.signature.trim() !== ''
        ? args.signature.trim()
        : null;
      const clusteringMethod: ClusteringMethod =
        args.clusteringMethod === 'ward' ? 'ward' : 'upgma';
      if (requestedSignature === null) {
        ctx.log.warn({ domainId }, 'domainAnalysis called without signature; defaulting to first vnew signature');
      }
      return getDomainAnalysisResult({
        scope,
        domainId,
        requestedSignature,
        clusteringMethod,
      });
    },
  }),
);
