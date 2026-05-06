import { db, resolveDefinitionContent, type RunCategory } from '@valuerank/db';
import { AuthenticationError, ValidationError } from '@valuerank/shared';
import { builder } from '../../builder.js';
import { RunRef } from '../../types/refs.js';
import { StartRunInput } from '../../types/inputs/start-run.js';
import {
  cancelRun as cancelRunService,
  pauseRun as pauseRunService,
  resumeRun as resumeRunService,
  startRun as startRunService,
} from '../../../services/run/index.js';
import { createAuditLog } from '../../../services/audit/index.js';
import {
  getEquivalentModelIds,
  resolveModelIdFromAvailable,
} from '../../../services/models/aliases.js';
import { parseRunCategory } from '../../../services/run/query.js';
import { StartRunPayload } from './payloads.js';
import { extractValuePair } from '../../queries/domain-coverage-utils.js';
import {
  loadRunForResult,
  persistPairedCompanionRunIds,
  resolvePairedDefinition,
} from './lifecycle-helpers.js';
import { isRecord } from '../../../utils/isRecord.js';

export { persistPairedCompanionRunIds } from './lifecycle-helpers.js';

type StartRunArgs = {
  definitionId: string | number;
  models: string[];
  samplePercentage?: number | null;
  sampleSeed?: number | null;
  samplesPerScenario?: number | null;
  temperature?: number | null;
  priority?: string | null;
  runCategory?: RunCategory | null;
  experimentId?: string | number | null;
  launchMode?: string | null;
  topUpDirection?: string | null;
  scenarioIds?: Array<string | number> | null;
};

builder.mutationField('startRun', (t) =>
  t.field({
    type: StartRunPayload,
    description: `
      Start a new evaluation run.

      Creates a run record and queues probe_scenario jobs for each model-scenario combination.
      Requires authentication.

      Returns the created run and the number of jobs queued.
    `,
    args: {
      input: t.arg({
        type: StartRunInput,
        required: true,
        description: 'Configuration for the new run',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userId = ctx.user.id;
      const input = args.input as StartRunArgs;

      ctx.log.info(
        { userId, definitionId: input.definitionId, modelCount: input.models.length },
        'Starting run via GraphQL'
      );

      const activeModelsForAliases = await db.llmModel.findMany({
        where: {
          status: 'ACTIVE',
          modelId: {
            in: Array.from(new Set(input.models.flatMap((id) => getEquivalentModelIds(id)))),
          },
        },
        select: { modelId: true },
      });
      const activeModelIdSet = new Set(activeModelsForAliases.map((model) => model.modelId));

      const models = input.models.map((id) => resolveModelIdFromAvailable(id, activeModelIdSet) ?? id);
      const launchMode = input.launchMode ?? 'STANDARD';
      const requestedRunCategory =
        typeof input.runCategory === 'string' && input.runCategory.trim() !== ''
          ? input.runCategory
          : undefined;
      const parsedRunCategory = parseRunCategory(requestedRunCategory);
      if (requestedRunCategory !== undefined && parsedRunCategory === undefined) {
        throw new ValidationError(
          'Invalid runCategory. Expected PILOT, PRODUCTION, REPLICATION, VALIDATION, or UNKNOWN_LEGACY.'
        );
      }
      const sharedInput = {
        models,
        samplePercentage: input.samplePercentage ?? undefined,
        sampleSeed: input.sampleSeed ?? undefined,
        samplesPerScenario: input.samplesPerScenario ?? undefined,
        temperature: input.temperature ?? undefined,
        priority: input.priority ?? 'NORMAL',
        runCategory: parsedRunCategory ?? (launchMode === 'PAIRED_BATCH' ? 'PRODUCTION' : undefined),
        experimentId:
          input.experimentId !== undefined && input.experimentId !== null && input.experimentId !== ''
            ? String(input.experimentId)
            : undefined,
        userId,
        scenarioIds: input.scenarioIds?.map((scenarioId) => String(scenarioId)),
      };

      let result;
      let pairedRunIds: string[] | undefined;

      if (launchMode === 'PAIRED_BATCH') {
        const pair = await resolvePairedDefinition(String(input.definitionId));
        const batchGroupId = crypto.randomUUID();

        const primaryRun = await startRunService({
          definitionId: pair.primary.id,
          ...sharedInput,
          configExtras: {
            jobChoiceLaunchMode: launchMode,
            jobChoiceBatchGroupId: batchGroupId,
            jobChoiceValueFirst: pair.primaryValueFirst,
            methodologySafe: true,
          },
        });

        const companionRun = await startRunService({
          definitionId: pair.companionId,
          ...sharedInput,
          configExtras: {
            jobChoiceLaunchMode: launchMode,
            jobChoiceBatchGroupId: batchGroupId,
            jobChoiceValueFirst: pair.companionValueFirst,
            methodologySafe: true,
          },
        });

        await persistPairedCompanionRunIds(primaryRun.run.id, companionRun.run.id);

        result = {
          run: {
            ...primaryRun.run,
            config: {
              ...(isRecord(primaryRun.run.config) ? primaryRun.run.config : {}),
              companionRunId: companionRun.run.id,
            },
          },
          jobCount: primaryRun.jobCount + companionRun.jobCount,
        };
        pairedRunIds = [companionRun.run.id];
      } else if (launchMode === 'PAIRED_BATCH_TOPUP') {
        const topUpDirection = typeof input.topUpDirection === 'string' ? input.topUpDirection.trim() : '';
        if (topUpDirection.length === 0) {
          throw new ValidationError('topUpDirection is required for paired-batch top-up launches');
        }

        if (requestedRunCategory !== undefined && parsedRunCategory !== 'PRODUCTION') {
          throw new ValidationError('paired-batch top-up launches must use runCategory PRODUCTION');
        }

        const definitionId = String(input.definitionId);
        const definition = await db.definition.findUnique({
          where: { id: definitionId },
          select: {
            id: true,
            deletedAt: true,
          },
        });
        if (!definition || definition.deletedAt !== null) {
          throw new ValidationError(`Definition ${definitionId} not found`);
        }

        const resolvedContent = (await resolveDefinitionContent(definition.id) as { resolvedContent: unknown }).resolvedContent;
        const pair = extractValuePair(resolvedContent);
        if (pair == null) {
          throw new ValidationError('Paired-batch top-up launches require a definition with exactly two values');
        }
        if (topUpDirection !== pair.valueA && topUpDirection !== pair.valueB) {
          throw new ValidationError(`topUpDirection must be one of ${pair.valueA} or ${pair.valueB}`);
        }

        result = await startRunService({
          definitionId,
          ...sharedInput,
          runCategory: 'PRODUCTION',
          configExtras: {
            jobChoiceLaunchMode: launchMode,
            jobChoiceBatchGroupId: crypto.randomUUID(),
            jobChoiceValueFirst: topUpDirection,
            methodologySafe: true,
          },
        });
      } else {
        result = await startRunService({
          definitionId: String(input.definitionId),
          ...sharedInput,
          configExtras: launchMode === 'AD_HOC_BATCH'
            ? {
                jobChoiceLaunchMode: launchMode,
                methodologySafe: false,
              }
            : undefined,
        });
      }

      ctx.log.info(
        { userId, runId: result.run.id, jobCount: result.jobCount },
        'Run started successfully'
      );

      if (launchMode === 'PAIRED_BATCH_TOPUP') {
        ctx.log.info(
          {
            runId: result.run.id,
            definitionId: String(input.definitionId),
            userId,
            launchMode: 'PAIRED_BATCH_TOPUP',
            topUpDirection: typeof input.topUpDirection === 'string' ? input.topUpDirection.trim() : '',
          },
          'Top-up run started'
        );
      }

      void createAuditLog({
        action: 'CREATE',
        entityType: 'Run',
        entityId: result.run.id,
        userId,
        metadata: {
          definitionId: String(input.definitionId),
          models: input.models,
          jobCount: result.jobCount,
          ...(launchMode === 'PAIRED_BATCH_TOPUP'
            ? {
                launchMode: 'PAIRED_BATCH_TOPUP',
                topUpDirection: typeof input.topUpDirection === 'string' ? input.topUpDirection.trim() : '',
              }
            : {}),
        },
      });

      return {
        ...result,
        pairedRunIds,
      };
    },
  })
);

builder.mutationField('pauseRun', (t) =>
  t.field({
    type: RunRef,
    description: `
      Pause a running evaluation.

      Jobs currently being processed will complete, but no new jobs
      will be started until the run is resumed.

      Requires authentication. Run must be in PENDING or RUNNING state.
    `,
    args: {
      runId: t.arg.id({
        required: true,
        description: 'The ID of the run to pause',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = String(args.runId);
      ctx.log.info({ userId: ctx.user.id, runId }, 'Pausing run via GraphQL');

      const result = await pauseRunService(runId);

      ctx.log.info({ userId: ctx.user.id, runId, status: result.status }, 'Run paused');

      void createAuditLog({
        action: 'ACTION',
        entityType: 'Run',
        entityId: runId,
        userId: ctx.user.id,
        metadata: { action: 'pause', previousStatus: result.status },
      });

      return loadRunForResult(result.id, ctx);
    },
  })
);

builder.mutationField('resumeRun', (t) =>
  t.field({
    type: RunRef,
    description: `
      Resume a paused evaluation.

      Jobs will begin processing again from where they left off.

      Requires authentication. Run must be in PAUSED state.
    `,
    args: {
      runId: t.arg.id({
        required: true,
        description: 'The ID of the run to resume',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = String(args.runId);
      ctx.log.info({ userId: ctx.user.id, runId }, 'Resuming run via GraphQL');

      const result = await resumeRunService(runId);

      ctx.log.info({ userId: ctx.user.id, runId, status: result.status }, 'Run resumed');

      void createAuditLog({
        action: 'ACTION',
        entityType: 'Run',
        entityId: runId,
        userId: ctx.user.id,
        metadata: { action: 'resume', newStatus: result.status },
      });

      return loadRunForResult(result.id, ctx);
    },
  })
);

builder.mutationField('cancelRun', (t) =>
  t.field({
    type: RunRef,
    description: `
      Cancel an evaluation run.

      Jobs currently being processed will complete, but all pending jobs
      will be removed from the queue. Completed results are preserved.

      Requires authentication. Run must be in PENDING, RUNNING, or PAUSED state.
    `,
    args: {
      runId: t.arg.id({
        required: true,
        description: 'The ID of the run to cancel',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const runId = String(args.runId);
      ctx.log.info({ userId: ctx.user.id, runId }, 'Cancelling run via GraphQL');

      const result = await cancelRunService(runId);

      ctx.log.info({ userId: ctx.user.id, runId, status: result.status }, 'Run cancelled');

      void createAuditLog({
        action: 'ACTION',
        entityType: 'Run',
        entityId: runId,
        userId: ctx.user.id,
        metadata: { action: 'cancel', finalStatus: result.status },
      });

      return loadRunForResult(result.id, ctx);
    },
  })
);
