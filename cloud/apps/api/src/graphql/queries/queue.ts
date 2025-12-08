/**
 * Queue Queries
 *
 * GraphQL queries for queue status and health information.
 */

import { builder } from '../builder.js';
import { AuthenticationError } from '@valuerank/shared';
import { QueueStatus } from '../types/queue-status.js';
import { getQueueStatus } from '../../services/queue/index.js';

// Query: queueStatus - Get current queue health and job counts
builder.queryField('queueStatus', (t) =>
  t.field({
    type: QueueStatus,
    description: `
      Get current queue status including job counts by type and state.

      Requires authentication.

      Returns isRunning, isPaused flags, job counts per type,
      and aggregate totals across all types.
    `,
    resolve: async (_root, _args, ctx) => {
      // Require authentication
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      ctx.log.info({ userId: ctx.user.id }, 'Fetching queue status');

      const status = await getQueueStatus();

      ctx.log.debug({ totals: status.totals }, 'Queue status fetched');

      return status;
    },
  })
);
