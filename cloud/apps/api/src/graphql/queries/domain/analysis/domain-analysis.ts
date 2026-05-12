import { getDomainAnalysisResult } from '../../../../services/analysis/domain-analysis-cache.js';
import { builder } from '../../../builder.js';
import {
  DomainAnalysisResultRef,
} from '../types.js';
import {
  normalizeDomainIds,
  resolveDomainAnalysisSelection,
} from '../../../../services/analysis/domain-analysis-scope.js';

builder.queryField('domainAnalysis', (t) =>
  t.field({
    type: DomainAnalysisResultRef,
    args: {
      domainId: t.arg.id({ required: false }),
      domainIds: t.arg.idList({ required: false }),
      scope: t.arg.string({ required: false }),
      signature: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = args.domainId != null ? String(args.domainId) : null;
      const domainIds = normalizeDomainIds(args.domainIds?.map(String) ?? null);
      const selection = resolveDomainAnalysisSelection({
        scope: args.scope,
        domainId,
        domainIds,
      });
      const requestedSignature = typeof args.signature === 'string' && args.signature.trim() !== ''
        ? args.signature.trim()
        : null;
      if (requestedSignature === null) {
        ctx.log.warn({ domainId: selection.domainId, domainIds: selection.domainIds }, 'domainAnalysis called without signature; defaulting to first vnew signature');
      }
      return getDomainAnalysisResult({
        scope: selection.scope,
        domainId: selection.domainId,
        domainIds: selection.domainIds,
        requestedSignature,
      });
    },
  }),
);
