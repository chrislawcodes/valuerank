import { db } from '@valuerank/db';
import { AuthenticationError, NotFoundError, ValidationError } from '@valuerank/shared';
import { builder } from '../../builder.js';
import { startRun as startRunService } from '../../../services/run/index.js';
import { createAuditLog } from '../../../services/audit/index.js';
import { LOCKED_ASSUMPTION_VIGNETTES } from '../../assumptions-constants.js';
import {
  LaunchOrderInvariancePayloadRef,
  type ExistingTranscriptRecord,
} from './types.js';

function getAssumptionKey(config: unknown): string | null {
  if (config === null || typeof config !== 'object') {
    return null;
  }
  const value = (config as Record<string, unknown>).assumptionKey;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function hasAssumptionRunTag(tags: Array<{ tag: { name: string } }>): boolean {
  return tags.some((entry) => entry.tag.name === 'assumption-run');
}

function createTranscriptGroupMap(records: ExistingTranscriptRecord[]): Map<string, ExistingTranscriptRecord[]> {
  const groups = new Map<string, ExistingTranscriptRecord[]>();

  for (const record of records) {
    if (record.scenarioId == null) continue;
    const key = `${record.modelId}::${record.scenarioId}`;
    const existing = groups.get(key) ?? [];
    existing.push(record);
    groups.set(key, existing);
  }

  for (const [key, group] of groups.entries()) {
    group.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    const latestModelVersion = group[0]?.modelVersion ?? null;
    const sameVersionGroup = group.filter((record) => record.modelVersion === latestModelVersion);
    groups.set(key, sameVersionGroup);
  }

  return groups;
}

async function ensureAssumptionRunTag(runId: string, userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const tag = await tx.tag.upsert({
      where: { name: 'assumption-run' },
      update: {},
      create: {
        name: 'assumption-run',
        createdByUserId: userId,
      },
    });

    await tx.runTag.createMany({
      data: [{ runId, tagId: tag.id }],
      skipDuplicates: true,
    });
  });
}

builder.mutationField('launchOrderInvariance', (t) =>
  t.field({
    type: LaunchOrderInvariancePayloadRef,
    args: {
      force: t.arg.boolean({ required: false, defaultValue: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userId = ctx.user.id;
      const lockedDefinitionIds = LOCKED_ASSUMPTION_VIGNETTES.map((vignette) => vignette.id);
      const expectedSourceScenarios = await db.scenario.findMany({
        where: {
          definitionId: { in: lockedDefinitionIds },
          deletedAt: null,
          orientationFlipped: false,
        },
        select: {
          id: true,
          definitionId: true,
        },
      });
      const expectedPairCount = expectedSourceScenarios.length;
      const expectedByDefinition = new Map<string, number>();
      for (const scenario of expectedSourceScenarios) {
        expectedByDefinition.set(
          scenario.definitionId,
          (expectedByDefinition.get(scenario.definitionId) ?? 0) + 1,
        );
      }

      const approvedPairs = await db.assumptionScenarioPair.findMany({
        where: {
          assumptionKey: 'order_invariance',
          equivalenceReviewStatus: 'APPROVED',
          equivalenceReviewedAt: { not: null },
          sourceScenario: {
            definitionId: { in: lockedDefinitionIds },
            deletedAt: null,
          },
          variantScenario: {
            deletedAt: null,
          },
        },
        select: {
          variantType: true,
          sourceScenario: {
            select: {
              id: true,
              definitionId: true,
            },
          },
          variantScenario: {
            select: {
              id: true,
              definitionId: true,
            },
          },
        },
      });

      if (approvedPairs.length === 0) {
        throw new ValidationError('No approved order-invariance pairs are available to launch');
      }

      const domain = await db.domain.findFirst({
        where: { normalizedName: 'professional' },
        select: { id: true },
      });
      if (!domain) {
        throw new NotFoundError('domain', 'professional');
      }

      const approvedPairCount = approvedPairs.length;
      const variantsByDefinition = new Map<string, Map<string, Set<string>>>();
      const approvedCountsByDefinition = new Map<string, number>();
      for (const pair of approvedPairs) {
        const definitionId = pair.sourceScenario.definitionId;
        const variantType = pair.variantType;

        if (!variantsByDefinition.has(definitionId)) {
          variantsByDefinition.set(definitionId, new Map());
        }
        const definitionVariants = variantsByDefinition.get(definitionId)!;

        if (!definitionVariants.has('baseline')) {
          definitionVariants.set('baseline', new Set());
        }
        definitionVariants.get('baseline')!.add(pair.sourceScenario.id);

        if (!definitionVariants.has(variantType)) {
          definitionVariants.set(variantType, new Set());
        }
        definitionVariants.get(variantType)!.add(pair.variantScenario.id);

        approvedCountsByDefinition.set(
          definitionId,
          (approvedCountsByDefinition.get(definitionId) ?? 0) + 1,
        );
      }

      const hasCompleteApprovedSet = approvedPairCount === expectedPairCount * 3
        && variantsByDefinition.size === lockedDefinitionIds.length
        && expectedByDefinition.size === lockedDefinitionIds.length
        && lockedDefinitionIds.every((definitionId) => (
          (approvedCountsByDefinition.get(definitionId) ?? 0) === (expectedByDefinition.get(definitionId) ?? 0) * 3
        ));
      if (!hasCompleteApprovedSet && args.force !== true) {
        throw new ValidationError('Launch blocked: all generated order-invariance condition pairs must be approved across the full locked vignette set');
      }

      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: { modelId: true, isDefault: true },
      });
      const defaultModels = activeModels.filter((model) => model.isDefault).map((model) => model.modelId);
      const fallbackModels = activeModels.map((model) => model.modelId);
      const models = (defaultModels.length > 0 ? defaultModels : fallbackModels)
        .slice()
        .sort((left, right) => left.localeCompare(right));
      if (models.length === 0) {
        throw new ValidationError('No active models are configured');
      }

      const requiredScenarioIds = Array.from(new Set(approvedPairs.flatMap((pair) => [
        pair.sourceScenario.id,
        pair.variantScenario.id,
      ])));

      const activeRuns = await db.run.findMany({
        where: {
          definitionId: { in: Array.from(variantsByDefinition.keys()) },
          status: { in: ['PENDING', 'RUNNING', 'PAUSED', 'SUMMARIZING'] },
          deletedAt: null,
        },
        select: {
          config: true,
        },
      });
      const hasActiveEquivalentRun = activeRuns.some((run) => {
        const config = run.config as { scenarioIds?: unknown; assumptionKey?: unknown } | null;
        if (config?.assumptionKey !== 'order_invariance') {
          return false;
        }
        if (!Array.isArray(config?.scenarioIds)) {
          return true;
        }
        return config.scenarioIds.some((scenarioId) => (
          typeof scenarioId === 'string' && requiredScenarioIds.includes(scenarioId)
        ));
      });
      if (hasActiveEquivalentRun) {
        throw new ValidationError('Launch blocked: matching dedicated runs are already active');
      }

      const completedTranscripts = await db.transcript.findMany({
        where: {
          deletedAt: null,
          decisionCode: { in: ['1', '2', '3', '4', '5'] },
          scenarioId: { in: requiredScenarioIds },
          modelId: { in: models },
          run: {
            status: 'COMPLETED',
            deletedAt: null,
            definitionId: { in: Array.from(variantsByDefinition.keys()) },
          },
        },
        select: {
          scenarioId: true,
          modelId: true,
          modelVersion: true,
          createdAt: true,
          run: {
            select: {
              config: true,
              tags: {
                select: {
                  tag: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      const allRecords = (completedTranscripts as ExistingTranscriptRecord[]).filter((record) => {
        const assumptionKey = getAssumptionKey(record.run.config);
        if (assumptionKey === 'temp_zero_determinism') return true;
        return assumptionKey === 'order_invariance' && hasAssumptionRunTag(record.run.tags);
      });
      const allTranscriptGroups = createTranscriptGroupMap(allRecords);

      const launches: Array<{
        definitionId: string;
        scenarioIds: string[];
        samplesPerScenario: number;
        runType: string;
      }> = [];

      for (const [definitionId, definitionVariants] of variantsByDefinition.entries()) {
        for (const [variantType, scenarioIds] of definitionVariants.entries()) {
          let variantFloor = 5;

          for (const scenarioId of scenarioIds) {
            for (const modelId of models) {
              const count = (allTranscriptGroups.get(`${modelId}::${scenarioId}`) ?? []).length;
              if (count < variantFloor) variantFloor = count;
              if (variantFloor === 0) break;
            }
            if (variantFloor === 0) break;
          }

          const needed = Math.max(0, 5 - Math.min(variantFloor, 5));
          if (needed > 0) {
            launches.push({
              definitionId,
              scenarioIds: Array.from(scenarioIds).sort(),
              samplesPerScenario: needed,
              runType: variantType,
            });
          }
        }
      }

      if (launches.length === 0) {
        return {
          startedRuns: 0,
          runsByVariantType: {},
          approvedPairs: approvedPairCount,
          modelCount: models.length,
          runIds: [],
          failedDefinitionIds: [],
        };
      }

      const runIds: string[] = [];
      const failedDefinitionIds: string[] = [];
      const runsByVariantType: Record<string, number> = {};

      const results = await Promise.allSettled(
        launches.map(async (launch) => {
          const result = await startRunService({
            definitionId: launch.definitionId,
            models,
            samplePercentage: 100,
            samplesPerScenario: launch.samplesPerScenario,
            scenarioIds: launch.scenarioIds,
            temperature: 0,
            priority: 'NORMAL',
            runCategory: 'VALIDATION',
            userId,
            finalTrial: false,
            configExtras: {
              assumptionKey: 'order_invariance',
              assumptionRunType: launch.runType,
            },
          });

          await ensureAssumptionRunTag(result.run.id, userId);

          return {
            runId: result.run.id,
            runType: launch.runType,
            definitionId: launch.definitionId,
          };
        }),
      );

      results.forEach((result, index) => {
        const launch = launches[index]!;
        if (result.status === 'fulfilled') {
          runIds.push(result.value.runId);
          runsByVariantType[result.value.runType] = (runsByVariantType[result.value.runType] ?? 0) + 1;
          return;
        }

        failedDefinitionIds.push(launch.definitionId);
        ctx.log.error(
          {
            definitionId: launch.definitionId,
            runType: launch.runType,
            scenarioCount: launch.scenarioIds.length,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          },
          'Failed to launch order-invariance run',
        );
      });

      void createAuditLog({
        action: 'ACTION',
        entityType: 'Domain',
        entityId: domain.id,
        userId,
        metadata: {
          operationType: 'launch-order-invariance',
          approvedPairs: approvedPairCount,
          models,
          temperature: 0,
          launches,
          startedRuns: runIds.length,
          failedDefinitionIds,
        },
      });

      return {
        startedRuns: runIds.length,
        runsByVariantType,
        approvedPairs: approvedPairCount,
        modelCount: models.length,
        runIds,
        failedDefinitionIds: Array.from(new Set(failedDefinitionIds)).sort(),
      };
    },
  }),
);

