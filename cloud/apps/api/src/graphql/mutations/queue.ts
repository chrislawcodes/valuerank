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

      // Return full queue status
      return getQueueStatus();
    },
  })
);
