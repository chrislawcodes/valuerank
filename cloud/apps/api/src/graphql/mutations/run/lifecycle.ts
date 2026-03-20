import { db, type RunCategory } from '@valuerank/db';
import { AuthenticationError, NotFoundError, ValidationError } from '@valuerank/shared';
import { builder } from '../../builder.js';
import type { Context } from '../../context.js';
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
  finalTrial?: boolean | null;
  launchMode?: string | null;
  scenarioIds?: Array<string | number> | null;
};

type DefinitionMethodology = {
  family?: string;
  response_scale?: string;
  presentation_order?: 'A_first' | 'B_first';
  pair_key?: string;
};

function getDefinitionMethodology(content: unknown): DefinitionMethodology | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return null;
  }

  const methodology = (content as Record<string, unknown>).methodology;
  if (!methodology || typeof methodology !== 'object' || Array.isArray(methodology)) {
    return null;
  }

  const record = methodology as Record<string, unknown>;
  return {
    family: typeof record.family === 'string' ? record.family : undefined,
    response_scale: typeof record.response_scale === 'string' ? record.response_scale : undefined,
    presentation_order:
      record.presentation_order === 'A_first' || record.presentation_order === 'B_first'
        ? record.presentation_order
        : undefined,
    pair_key: typeof record.pair_key === 'string' ? record.pair_key : undefined,
  };
}

async function resolvePairedJobChoiceDefinition(
  definitionId: string,
): Promise<{ primary: { id: string; content: unknown }; companionId: string; presentationOrder: 'A_first' | 'B_first' }> {
  const definition = await db.definition.findUnique({
    where: { id: definitionId },
    select: {
      id: true,
      domainId: true,
      content: true,
      deletedAt: true,
    },
  });

  if (!definition || definition.deletedAt !== null) {
    throw new NotFoundError('Definition', definitionId);
  }

  const methodology = getDefinitionMethodology(definition.content);
  if (methodology?.family !== 'job-choice' || !methodology.pair_key || !methodology.presentation_order) {
    throw new ValidationError('Paired batches require a Job Choice vignette with paired-order metadata.');
  }

  const companionOrder = methodology.presentation_order === 'A_first' ? 'B_first' : 'A_first';
  const companion = await db.definition.findFirst({
    where: {
      id: { not: definition.id },
      deletedAt: null,
      domainId: definition.domainId,
      content: {
        path: ['methodology', 'family'],
        equals: 'job-choice',
      },
      AND: [
        {
          content: {
            path: ['methodology', 'pair_key'],
            equals: methodology.pair_key,
          },
        },
        {
          content: {
            path: ['methodology', 'presentation_order'],
            equals: companionOrder,
          },
        },
      ],
    },
    select: { id: true },
  });

  if (!companion) {
    throw new ValidationError(
      'Paired batch launch requires both A-first and B-first Job Choice definitions. Generate both companion definitions first.'
    );
  }

  return {
    primary: { id: definition.id, content: definition.content },
    companionId: companion.id,
    presentationOrder: methodology.presentation_order,
  };
}

async function loadRunForResult(runId: string, ctx: Context) {
  const run = await ctx.loaders.run.load(runId);
  if (run == null) {
    throw new Error(`Run not found: ${runId}`);
  }
  return run;
}

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
        finalTrial: input.finalTrial ?? false,
        scenarioIds: input.scenarioIds?.map((scenarioId) => String(scenarioId)),
      };

      let result;
      let pairedRunIds: string[] | undefined;

      if (launchMode === 'PAIRED_BATCH') {
        const pair = await resolvePairedJobChoiceDefinition(String(input.definitionId));
        const batchGroupId = crypto.randomUUID();

        const primaryRun = await startRunService({
          definitionId: pair.primary.id,
          ...sharedInput,
          configExtras: {
            jobChoiceLaunchMode: launchMode,
            jobChoiceBatchGroupId: batchGroupId,
            jobChoicePresentationOrder: pair.presentationOrder,
            methodologySafe: true,
          },
        });

        const companionRun = await startRunService({
          definitionId: pair.companionId,
          ...sharedInput,
          configExtras: {
            jobChoiceLaunchMode: launchMode,
            jobChoiceBatchGroupId: batchGroupId,
            jobChoicePresentationOrder: pair.presentationOrder === 'A_first' ? 'B_first' : 'A_first',
            methodologySafe: true,
          },
        });

        result = {
          run: primaryRun.run,
          jobCount: primaryRun.jobCount + companionRun.jobCount,
        };
        pairedRunIds = [companionRun.run.id];
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

      void createAuditLog({
        action: 'CREATE',
        entityType: 'Run',
        entityId: result.run.id,
        userId,
        metadata: {
          definitionId: String(input.definitionId),
          models: input.models,
          jobCount: result.jobCount,
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
