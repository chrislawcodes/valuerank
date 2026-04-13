import { getDomainAnalysisResult } from '../../../../services/analysis/domain-analysis-cache.js';
import { builder } from '../../../builder.js';
import {
  DomainAnalysisResultRef,
} from '../types.js';
import {
  parseDomainAnalysisScoreMethod,
} from '../shared.js';

builder.queryField('domainAnalysis', (t) =>
  t.field({
    type: DomainAnalysisResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      scoreMethod: t.arg.string({ required: false }),
      signature: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = String(args.domainId);
      const scoreMethod = parseDomainAnalysisScoreMethod(args.scoreMethod);
      const requestedSignature = typeof args.signature === 'string' && args.signature.trim() !== ''
        ? args.signature.trim()
        : null;
      if (requestedSignature === null) {
        ctx.log.warn({ domainId }, 'domainAnalysis called without signature; defaulting to first vnew signature');
      }
      return getDomainAnalysisResult({
        domainId,
        requestedSignature,
        scoreMethod,
      });
    },
  }),
);
