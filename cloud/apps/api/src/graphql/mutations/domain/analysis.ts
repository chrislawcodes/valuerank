import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../../builder.js';
import {
  queueDomainAnalysisRefresh,
  refreshDomainAnalysisSnapshot,
} from '../../../services/analysis/domain-analysis-cache.js';
import { DomainAnalysisRefreshResultRef } from './types.js';
import {
  normalizeDomainIds,
  resolveDomainAnalysisSelection,
} from '../../../services/analysis/domain-analysis-scope.js';

builder.mutationField('refreshDomainAnalysis', (t) =>
  t.field({
    type: DomainAnalysisRefreshResultRef,
    args: {
      domainId: t.arg.id({ required: false }),
      domainIds: t.arg.idList({ required: false }),
      scope: t.arg.string({ required: false }),
      signature: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const domainId = args.domainId != null ? String(args.domainId) : null;
      const domainIds = normalizeDomainIds(args.domainIds?.map(String) ?? null);
      const selection = resolveDomainAnalysisSelection({
        scope: args.scope,
        domainId,
        domainIds,
      });
      const signature = typeof args.signature === 'string' && args.signature.trim() !== ''
        ? args.signature.trim()
        : null;

      const queued = await queueDomainAnalysisRefresh({
        scope: selection.scope,
        domainId: selection.domainId,
        domainIds: selection.domainIds,
        signature,
        reason: 'manual-refresh',
      });

      if (queued) {
        return {
          success: true,
          mode: 'QUEUED' as const,
          message: 'Refresh started in the background.',
        };
      }

      await refreshDomainAnalysisSnapshot({
        scope: selection.scope,
        domainId: selection.domainId,
        domainIds: selection.domainIds,
        requestedSignature: signature,
      });
      return {
        success: true,
        mode: 'REFRESHED' as const,
        message: 'Refresh finished just now.',
      };
    },
  }),
);
