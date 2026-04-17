import path from 'path';
import { db, type Prisma } from '@valuerank/db';
import { AppError, createLogger } from '@valuerank/shared';
import { spawnPython } from '../../../queue/spawn.js';
import {
  ANALYZE_WORKER_PATH,
  AGGREGATE_ANALYSIS_CODE_VERSION,
} from './constants.js';
import {
  type AggregateMetadata,
  type AggregateWorkerInput,
  type AggregateWorkerOutput,
  zRunConfig,
} from './contracts.js';
import {
  buildClaimConfig,
  getAggregateRecomputeClaim,
  findMatchingAggregateRun,
  verifyAggregateSnapshot,
} from './aggregate-helpers.js';
import {
  type AggregateClaimRecord,
  type AggregateRunConfig,
  type AggregateRunPreparation,
  type AggregateWorkerSuccessOutput,
  AggregateRecomputeRetryableError,
} from './aggregate-types.js';

const log = createLogger('analysis:aggregate');

export { prepareAggregateRunSnapshot } from './aggregate-preparation.js';
export async function claimAggregateRun(prepared: AggregateRunPreparation): Promise<AggregateClaimRecord> {
  let createdNew = false;
  let previousConfig: AggregateRunConfig | null = null;
  const aggregateRun = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${prepared.definitionId}))`;

    const existingRuns = await tx.run.findMany({
      where: {
        definitionId: prepared.definitionId,
        tags: {
          some: {
            tag: {
              name: 'Aggregate',
            },
          },
        },
        deletedAt: null,
      },
    });

    const aggregateRun = findMatchingAggregateRun(existingRuns, prepared.selection);
    const existingConfigResult = aggregateRun == null ? null : zRunConfig.safeParse(aggregateRun.config);
    previousConfig =
      existingConfigResult != null && existingConfigResult.success ? (existingConfigResult.data as AggregateRunConfig) : null;
    const claimConfig = buildClaimConfig(prepared, previousConfig);

    if (!aggregateRun) {
      createdNew = true;
      return tx.run.create({
        data: {
          definitionId: prepared.definitionId,
          createdByUserId: prepared.templateRun.createdByUserId,
          experimentId: prepared.templateRun.experimentId,
          status: 'RUNNING',
          config: claimConfig as unknown as Prisma.InputJsonValue,
          tags: {
            create: {
              tag: {
                connectOrCreate: {
                  where: { name: 'Aggregate' },
                  create: { name: 'Aggregate' },
                },
              },
            },
          },
        },
      });
    }

    await tx.run.update({
      where: { id: aggregateRun.id },
      data: {
        config: claimConfig as unknown as Prisma.InputJsonValue,
        status: 'RUNNING',
      },
    });

    return aggregateRun;
  });

  return {
    aggregateRunId: aggregateRun.id,
    createdNew,
    previousConfig,
    claim: prepared.claim,
  };
}

export async function persistAggregateRun(
  prepared: AggregateRunPreparation,
  claim: AggregateClaimRecord,
  workerResult: AggregateWorkerSuccessOutput | null,
): Promise<void> {
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${prepared.definitionId}))`;

    const aggregateRun = await tx.run.findUnique({
      where: { id: claim.aggregateRunId },
    });

    if (!aggregateRun) {
      throw new AggregateRecomputeRetryableError('Aggregate run disappeared before the final persist step');
    }

    const configResult = zRunConfig.safeParse(aggregateRun.config);
    const currentConfig = configResult.success ? configResult.data : {};
    const currentClaim = getAggregateRecomputeClaim(currentConfig);

    if (!currentClaim) {
      throw new AggregateRecomputeRetryableError('Aggregate recompute claim is missing before persist');
    }
    if (currentClaim.token !== claim.claim.token) {
      throw new AggregateRecomputeRetryableError('Aggregate recompute claim was replaced before persist');
    }
    if (currentClaim.sourceFingerprint !== prepared.sourceFingerprint) {
      throw new AggregateRecomputeRetryableError('Aggregate recompute claim fingerprint no longer matches the prepared snapshot');
    }
    if (new Date(currentClaim.leaseExpiresAt).getTime() <= Date.now()) {
      throw new AggregateRecomputeRetryableError('Aggregate recompute claim lease expired before persist');
    }

    await verifyAggregateSnapshot(prepared);

    const finalConfig: AggregateRunConfig = {
      ...currentConfig,
      ...prepared.finalRunConfig,
      aggregateSourceFingerprint: prepared.sourceFingerprint,
    };
    delete (finalConfig as Record<string, unknown>).aggregateRecomputeClaim;

    const aggregateMetadata: AggregateMetadata = {
      ...prepared.aggregateMetadataBase,
      perModelRepeatCoverage:
        workerResult != null ? workerResult.analysis.aggregateSemantics?.perModelRepeatCoverage ?? {} : {},
      perModelDrift:
        workerResult != null ? workerResult.analysis.aggregateSemantics?.perModelDrift ?? {} : {},
    };

    const finalOutput: Record<string, unknown> = {
      perModel: prepared.aggregatedResult.perModel,
      preferenceSummary:
        workerResult != null ? workerResult.analysis.preferenceSummary ?? null : null,
      reliabilitySummary:
        workerResult != null ? workerResult.analysis.reliabilitySummary ?? null : null,
      aggregateMetadata,
      modelAgreement: prepared.aggregatedResult.modelAgreement,
      visualizationData: prepared.aggregatedResult.visualizationData,
      mostContestedScenarios: prepared.aggregatedResult.mostContestedScenarios,
      varianceAnalysis: prepared.aggregatedResult.varianceAnalysis,
      decisionStats: prepared.aggregatedResult.decisionStats,
      valueAggregateStats: prepared.aggregatedResult.valueAggregateStats,
      sourceRunIds: prepared.sourceRunIds,
      runCount: prepared.aggregateMetadataBase.sourceRunCount,
      analysisCount: prepared.analysisCount,
      methodsUsed: {
        aggregateSemantics: 'same-signature-v1',
        codeVersion: AGGREGATE_ANALYSIS_CODE_VERSION,
      },
      warnings: [],
      computedAt: new Date().toISOString(),
      durationMs: 0,
    };

    await tx.run.update({
      where: { id: claim.aggregateRunId },
      data: {
        config: finalConfig as unknown as Prisma.InputJsonValue,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    await tx.analysisResult.updateMany({
      where: { runId: claim.aggregateRunId, status: 'CURRENT' },
      data: { status: 'SUPERSEDED' },
    });

    await tx.analysisResult.create({
      data: {
        runId: claim.aggregateRunId,
        analysisType: 'AGGREGATE',
        status: 'CURRENT',
        codeVersion: AGGREGATE_ANALYSIS_CODE_VERSION,
        inputHash: `aggregate-${Date.now()}`,
        output: finalOutput as unknown as Prisma.InputJsonValue,
      },
    });
  });
}

export async function releaseAggregateClaim(
  prepared: AggregateRunPreparation,
  claim: AggregateClaimRecord,
): Promise<void> {
  try {
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${prepared.definitionId}))`;

      const aggregateRun = await tx.run.findUnique({
        where: { id: claim.aggregateRunId },
      });

      if (!aggregateRun) {
        return;
      }

      const currentConfigResult = zRunConfig.safeParse(aggregateRun.config);
      const currentConfig = currentConfigResult.success ? currentConfigResult.data : {};
      const currentClaim = getAggregateRecomputeClaim(currentConfig);
      if (currentClaim?.token !== claim.claim.token) {
        return;
      }

      if (claim.createdNew || claim.previousConfig == null) {
        const failedConfig: AggregateRunConfig = {
          ...(currentConfig as AggregateRunConfig),
        };
        delete failedConfig.aggregateRecomputeClaim;
        delete failedConfig.aggregateSourceFingerprint;

        await tx.run.update({
          where: { id: aggregateRun.id },
          data: {
            config: failedConfig as unknown as Prisma.InputJsonValue,
            status: 'FAILED',
          },
        });
        return;
      }

      const restoredConfig: AggregateRunConfig = { ...claim.previousConfig };
      delete restoredConfig.aggregateRecomputeClaim;

      await tx.run.update({
        where: { id: aggregateRun.id },
        data: {
          config: restoredConfig as unknown as Prisma.InputJsonValue,
          status: 'COMPLETED',
        },
      });
    });
  } catch (err) {
    log.warn({ err, definitionId: prepared.definitionId, runId: claim.aggregateRunId }, 'Best-effort aggregate claim cleanup failed');
  }
}

export async function spawnAggregateWorker(prepared: AggregateRunPreparation): Promise<AggregateWorkerSuccessOutput | null> {
  if (prepared.aggregateWorkerInput == null) {
    return null;
  }

  const workerResult = await spawnPython<AggregateWorkerInput, AggregateWorkerOutput>(
    ANALYZE_WORKER_PATH,
    prepared.aggregateWorkerInput,
    { cwd: path.resolve(process.cwd(), '../..'), timeout: 120000 }
  );

  if (!workerResult.success) {
    throw new AppError(`Aggregate semantic worker failed: ${workerResult.error}`, 'WORKER_FAILED');
  }

  if (!workerResult.data.success) {
    throw new AppError(`${workerResult.data.error.code}: ${workerResult.data.error.message}`, 'WORKER_FAILED');
  }

  return workerResult.data;
}
