/**
 * Queue Mutations
 *
 * GraphQL mutations for global queue control: pause and resume.
 */

import { builder } from '../builder.js';
import { AuthenticationError } from '@valuerank/shared';
import { QueueStatus } from '../types/queue-status.js';
import {
  pauseQueue as pauseQueueService,
  resumeQueue as resumeQueueService,
  getQueueStatus,
} from '../../services/queue/index.js';
import { createAuditLog } from '../../services/audit/index.js';
import { SYSTEM_ACTOR_ID } from '@valuerank/shared';

// pauseQueue mutation
builder.mutationField('pauseQueue', (t) =>
  t.field({
    type: QueueStatus,
    description: `
      Pause the global job queue.

      All job processing will stop until the queue is resumed.
      Jobs will continue to be queued but not processed.

      Requires authentication.
    `,
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      ctx.log.info({ userId: ctx.user.id }, 'Pausing global queue via GraphQL');

      await pauseQueueService();

      // Audit log (non-blocking) - System entity type
      void createAuditLog({
        action: 'ACTION',
        entityType: 'System',
        entityId: SYSTEM_ACTOR_ID,
        userId: ctx.user.id,
        metadata: { action: 'pauseQueue' },
      });

      // Return full queue status
      return getQueueStatus();
    },
  })
);

// resumeQueue mutation
builder.mutationField('resumeQueue', (t) =>
  t.field({
    type: QueueStatus,
    description: `
      Resume the global job queue.

      Job processing will restart from where it left off.

      Requires authentication.
    `,
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      ctx.log.info({ userId: ctx.user.id }, 'Resuming global queue via GraphQL');

      await resumeQueueService();

      // Audit log (non-blocking) - System entity type
      void createAuditLog({
        action: 'ACTION',
        entityType: 'System',
        entityId: SYSTEM_ACTOR_ID,
        userId: ctx.user.id,
        metadata: { action: 'resumeQueue' },
      });

      // Return full queue status
      return getQueueStatus();
    },
  })
);
