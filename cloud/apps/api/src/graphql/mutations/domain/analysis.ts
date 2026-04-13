import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../../builder.js';
import {
  queueDomainAnalysisRefresh,
  refreshDomainAnalysisSnapshot,
} from '../../../services/analysis/domain-analysis-cache.js';
import { DomainAnalysisRefreshResultRef } from './types.js';

builder.mutationField('refreshDomainAnalysis', (t) =>
  t.field({
    type: DomainAnalysisRefreshResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      signature: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const domainId = String(args.domainId);
      const signature = typeof args.signature === 'string' && args.signature.trim() !== ''
        ? args.signature.trim()
        : null;

      const queued = await queueDomainAnalysisRefresh({
        domainId,
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

      await refreshDomainAnalysisSnapshot(domainId, signature);
      return {
        success: true,
        mode: 'REFRESHED' as const,
        message: 'Refresh finished just now.',
      };
    },
  }),
);
