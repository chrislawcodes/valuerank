import { db, softDeleteDefinition } from '@valuerank/db';
import { builder } from '../../builder.js';
import { createAuditLog } from '../../../services/audit/index.js';
import {
  cancelScenarioExpansion,
  queueScenarioExpansion,
} from '../../../services/scenario/index.js';
import {
  CancelExpansionResultRef,
  DeleteDefinitionResultRef,
  RegenerateScenariosResultRef,
} from './results.js';

builder.mutationField('deleteDefinition', (t) =>
  t.field({
    type: DeleteDefinitionResultRef,
    description:
      'Soft delete a definition and all its descendants. Related scenarios and tags are also soft deleted.',
    args: {
      id: t.arg.string({
        required: true,
        description: 'Definition ID to delete',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const { id } = args;

      ctx.log.debug({ definitionId: id }, 'Deleting definition');

      const result = await softDeleteDefinition(id, ctx.user?.id ?? null);

      ctx.log.info({ definitionId: id, deletedCount: result.deletedCount }, 'Definition deleted');

      void createAuditLog({
        action: 'DELETE',
        entityType: 'Definition',
        entityId: id,
        userId: ctx.user?.id ?? null,
        metadata: { deletedIds: result.definitionIds, count: result.definitionIds.length },
      });

      return {
        deletedIds: result.definitionIds,
        count: result.definitionIds.length,
      };
    },
  })
);

builder.mutationField('regenerateScenarios', (t) =>
  t.field({
    type: RegenerateScenariosResultRef,
    description:
      'Manually trigger scenario regeneration for a definition. Queues a new expansion job.',
    args: {
      definitionId: t.arg.string({
        required: true,
        description: 'Definition ID to regenerate scenarios for',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const { definitionId } = args;

      ctx.log.debug({ definitionId }, 'Manual scenario regeneration requested');

      const definition = await db.definition.findUnique({
        where: { id: definitionId, deletedAt: null },
      });

      if (!definition) {
        throw new Error(`Definition not found: ${definitionId}`);
      }

      const queueResult = await queueScenarioExpansion(definitionId, 'update');

      ctx.log.info(
        { definitionId, jobId: queueResult.jobId, queued: queueResult.queued },
        'Manual scenario regeneration queued'
      );

      void createAuditLog({
        action: 'ACTION',
        entityType: 'Definition',
        entityId: definitionId,
        userId: ctx.user?.id ?? null,
        metadata: {
          action: 'regenerateScenarios',
          jobId: queueResult.jobId,
          queued: queueResult.queued,
        },
      });

      return {
        definitionId,
        jobId: queueResult.jobId,
        queued: queueResult.queued,
      };
    },
  })
);

builder.mutationField('cancelScenarioExpansion', (t) =>
  t.field({
    type: CancelExpansionResultRef,
    description: 'Cancel an in-progress scenario expansion for a definition.',
    args: {
      definitionId: t.arg.string({
        required: true,
        description: 'Definition ID to cancel expansion for',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const { definitionId } = args;

      ctx.log.debug({ definitionId }, 'Cancel scenario expansion requested');

      const definition = await db.definition.findUnique({
        where: { id: definitionId, deletedAt: null },
      });

      if (!definition) {
        throw new Error(`Definition not found: ${definitionId}`);
      }

      const result = await cancelScenarioExpansion(definitionId);

      ctx.log.info(
        { definitionId, cancelled: result.cancelled, jobId: result.jobId },
        'Cancel expansion result'
      );

      void createAuditLog({
        action: 'ACTION',
        entityType: 'Definition',
        entityId: definitionId,
        userId: ctx.user?.id ?? null,
        metadata: {
          action: 'cancelScenarioExpansion',
          cancelled: result.cancelled,
          jobId: result.jobId,
        },
      });

      return result;
    },
  })
);
