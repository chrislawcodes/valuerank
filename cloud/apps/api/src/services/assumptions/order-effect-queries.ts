import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { LOCKED_ASSUMPTION_VIGNETTES } from '../../graphql/assumptions-constants.js';
import {
  buildOrderEffectCachePayload,
  DuplicateCurrentOrderEffectSnapshotError,
  getCurrentOrderEffectSnapshot,
  repairDuplicateCurrentOrderEffectSnapshots,
  writeCurrentOrderEffectSnapshot,
} from './order-effect-cache.js';
import {
  computeOrderInvarianceFromSelections,
  normalizeDecision,
} from './order-effect-analysis.js';
import {
  buildConditionKey,
  buildOrderEffectCacheFailureContext,
  createOrderEffectCacheInvariantError,
  deserializeOrderInvarianceSnapshotOutput,
  fingerprintPick,
  getRunAssumptionKey,
  isAssumptionRun,
  isTempZeroRun,
  parseAttributeLabels,
  parseConditionLevels,
  parseDecision,
  pickStableTranscripts,
  serializeOrderInvarianceSnapshotOutput,
} from './order-effect-comparison.js';
import type {
  CandidateTranscript,
  OrderInvarianceResult,
  OrderInvarianceTranscriptResult,
  PickResult,
} from './order-effect-types.js';

const ORDER_INVARIANCE_KEY = 'order_invariance';
const BASELINE_ASSUMPTION_KEYS = new Set(['temp_zero_determinism', ORDER_INVARIANCE_KEY]);
const VALID_DECISIONS = new Set(['1', '2', '3', '4', '5']);
const ORDER_INVARIANCE_REQUIRED_TRIAL_COUNT = 5;
const log = createLogger('assumptions:order-effect-service');

type PairScenario = {
  id: string;
  name: string;
  definitionId: string;
  orientationFlipped: boolean;
};

type PairRecord = {
  id?: string;
  variantType: string | null;
  sourceScenario: PairScenario;
  variantScenario: PairScenario;
};

type CandidateTranscriptRecord = {
  id: string;
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  decisionCode: string | null;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  createdAt: Date;
  run: {
    deletedAt: Date | null;
    config: unknown;
    tags: Array<{ tag: { name: string } }>;
  };
};

type TranscriptDetailRecord = {
  id: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  content: unknown;
  decisionCode: string | null;
  decisionCodeSource: string | null;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  estimatedCost: number | null;
  createdAt: Date;
  lastAccessedAt: Date | null;
  run: {
    deletedAt: Date | null;
    config: unknown;
    tags: Array<{ tag: { name: string } }>;
  };
};
export async function getOrderInvarianceAnalysisResult(params: {
  directionOnly: boolean;
  trimOutliers: boolean;
}): Promise<OrderInvarianceResult> {
  return db.$transaction(async (tx) => {
    const pipelineLockKey = [
      ORDER_INVARIANCE_KEY,
      params.directionOnly ? 'direction' : 'exact',
      params.trimOutliers ? 'trim' : 'no-trim',
      ORDER_INVARIANCE_REQUIRED_TRIAL_COUNT,
    ].join(':');
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      pipelineLockKey
    );

    const pairRows = await tx.assumptionScenarioPair.findMany({
      where: {
        assumptionKey: ORDER_INVARIANCE_KEY,
        equivalenceReviewStatus: 'APPROVED',
        equivalenceReviewedAt: { not: null },
      },
      select: {
        id: true,
        variantType: true,
        sourceScenario: {
          select: {
            id: true,
            name: true,
            definitionId: true,
            orientationFlipped: true,
          },
        },
        variantScenario: {
          select: {
            id: true,
            name: true,
            definitionId: true,
            orientationFlipped: true,
          },
        },
      },
    }) as PairRecord[];

    const lockedById = new Map(
      LOCKED_ASSUMPTION_VIGNETTES.map((vignette) => [vignette.id, vignette])
    );
    const relevantPairs = pairRows.filter((pair) => lockedById.has(pair.sourceScenario.definitionId));

    const activeModels = await tx.llmModel.findMany({
      where: { status: 'ACTIVE' },
      select: { modelId: true, displayName: true },
    });
    const activeModelLabels = new Map(
      activeModels.map((model) => [model.modelId, model.displayName])
    );

    const allScenarioIds = Array.from(new Set(
      relevantPairs.flatMap((pair) => [pair.sourceScenario.id, pair.variantScenario.id])
    ));
    const scenarioIdToVariantType = new Map<string, string | null>();
    const scenarioOrientationById = new Map<string, boolean>();
    for (const pair of pairRows) {
      scenarioIdToVariantType.set(pair.sourceScenario.id, null);
      scenarioIdToVariantType.set(pair.variantScenario.id, pair.variantType);
      scenarioOrientationById.set(pair.sourceScenario.id, pair.sourceScenario.orientationFlipped);
      scenarioOrientationById.set(pair.variantScenario.id, pair.variantScenario.orientationFlipped);
    }

    const transcriptRecords = allScenarioIds.length > 0
      ? await tx.transcript.findMany({
        where: {
          deletedAt: null,
          scenarioId: { in: allScenarioIds },
          decisionCode: { in: Array.from(VALID_DECISIONS) },
        },
        select: {
          id: true,
          scenarioId: true,
          modelId: true,
          modelVersion: true,
          decisionCode: true,
          decisionMetadata: true,
          definitionSnapshot: true,
          createdAt: true,
          run: {
            select: {
              deletedAt: true,
              config: true,
              tags: {
                select: {
                  tag: {
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
      })
      : [];

    const sourceScenarioIds = new Set(relevantPairs.map((pair) => pair.sourceScenario.id));
    const transcriptsByScenarioAndModel = new Map<string, CandidateTranscript[]>();
    const inferredModelIds = new Set<string>();

    for (const transcript of transcriptRecords as CandidateTranscriptRecord[]) {
      if (transcript.scenarioId == null || transcript.run.deletedAt != null) {
        continue;
      }
      if (!isTempZeroRun(transcript.run.config)) {
        continue;
      }

      const assumptionKey = getRunAssumptionKey(transcript.run.config);
      const isBaselineScenario = sourceScenarioIds.has(transcript.scenarioId);
      if (isBaselineScenario) {
        if (assumptionKey == null || !BASELINE_ASSUMPTION_KEYS.has(assumptionKey)) {
          continue;
        }
        if (assumptionKey !== 'temp_zero_determinism' && !isAssumptionRun(transcript.run.tags)) {
          continue;
        }
      } else {
        if (assumptionKey !== ORDER_INVARIANCE_KEY || !isAssumptionRun(transcript.run.tags)) {
          continue;
        }
      }

      const decision = parseDecision({
        decisionCode: transcript.decisionCode,
        decisionMetadata: transcript.decisionMetadata,
        definitionSnapshot: transcript.definitionSnapshot,
        orientationFlipped: scenarioOrientationById.get(transcript.scenarioId) ?? false,
      });
      if (decision == null) {
        continue;
      }

      inferredModelIds.add(transcript.modelId);
      const key = `${transcript.scenarioId}::${transcript.modelId}`;
      const candidate: CandidateTranscript = {
        id: transcript.id,
        scenarioId: transcript.scenarioId,
        modelId: transcript.modelId,
        modelVersion: transcript.modelVersion,
        rawDecision: decision,
        decision: normalizeDecision(
          decision,
          scenarioIdToVariantType.get(transcript.scenarioId) ?? null
        ),
        createdAt: transcript.createdAt,
      };
      const existing = transcriptsByScenarioAndModel.get(key);
      if (existing != null) {
        existing.push(candidate);
      } else {
        transcriptsByScenarioAndModel.set(key, [candidate]);
      }
    }

    const effectiveModels = Array.from(inferredModelIds)
      .sort()
      .map((modelId) => ({
        modelId,
        modelLabel: activeModelLabels.get(modelId) ?? modelId,
      }));

    const pickCache = new Map<string, PickResult>();
    const selectionFingerprints = new Set<string>();

    function getPick(scenarioId: string, modelId: string): PickResult {
      const key = `${scenarioId}::${modelId}`;
      const existing = pickCache.get(key);
      if (existing != null) {
        return existing;
      }
      const next = pickStableTranscripts(
        transcriptsByScenarioAndModel.get(key) ?? [],
        ORDER_INVARIANCE_REQUIRED_TRIAL_COUNT
      );
      pickCache.set(key, next);
      selectionFingerprints.add(fingerprintPick(key, next));
      return next;
    }

    for (const pair of relevantPairs) {
      for (const model of effectiveModels) {
        getPick(pair.sourceScenario.id, model.modelId);
        getPick(pair.variantScenario.id, model.modelId);
      }
    }

    const cachePayload = buildOrderEffectCachePayload({
      trimOutliers: params.trimOutliers,
      directionOnly: params.directionOnly,
      requiredTrialCount: ORDER_INVARIANCE_REQUIRED_TRIAL_COUNT,
      lockedVignetteIds: Array.from(new Set(relevantPairs.map((pair) => pair.sourceScenario.definitionId))),
      approvedPairIds: relevantPairs
        .map((pair) => pair.id)
        .filter((pairId): pairId is string => typeof pairId === 'string' && pairId !== ''),
      snapshotModelIds: effectiveModels.map((model) => model.modelId),
      selectionFingerprints: Array.from(selectionFingerprints),
    });
    const cacheFailureBase = {
      inputHash: cachePayload.inputHash,
      configSignature: cachePayload.configSignature,
      codeVersion: cachePayload.codeVersion,
      selectionFingerprintCount: selectionFingerprints.size,
      approvedPairCount: cachePayload.approvedPairIds.length,
      snapshotModelCount: cachePayload.snapshotModelIds.length,
    };

    let shouldRepairUnreadableSnapshot = false;
    try {
      const cachedSnapshot = await getCurrentOrderEffectSnapshot(tx, cachePayload);
      if (cachedSnapshot != null) {
        const cachedResult = deserializeOrderInvarianceSnapshotOutput(cachedSnapshot);
        if (cachedResult != null) {
          log.debug({
            inputHash: cachePayload.inputHash,
            snapshotId: cachedSnapshot.id,
            selectionFingerprintCount: selectionFingerprints.size,
          }, 'Returning cached order-invariance snapshot');
          return cachedResult;
        }
        log.warn({
          inputHash: cachePayload.inputHash,
          snapshotId: cachedSnapshot.id,
        }, 'Order-invariance snapshot output was unreadable, recomputing');
        shouldRepairUnreadableSnapshot = true;
      }
    } catch (error) {
      if (error instanceof DuplicateCurrentOrderEffectSnapshotError) {
        log.error({
          err: error,
          ...buildOrderEffectCacheFailureContext({
            ...cacheFailureBase,
            duplicateError: error,
            phase: 'cache_read',
          }),
        }, 'Duplicate CURRENT order-effect snapshots detected, attempting repair');
        let repairedSnapshot;
        try {
          repairedSnapshot = await repairDuplicateCurrentOrderEffectSnapshots(tx, cachePayload);
        } catch (repairError) {
          if (repairError instanceof DuplicateCurrentOrderEffectSnapshotError) {
            const failureContext = buildOrderEffectCacheFailureContext({
              ...cacheFailureBase,
              duplicateError: repairError,
              phase: 'cache_repair',
            });
            log.error({
              err: repairError,
              ...failureContext,
            }, 'Order-effect cache repair failed: duplicate CURRENT snapshots were not provably equivalent');
            throw createOrderEffectCacheInvariantError(failureContext);
          }
          throw repairError;
        }
        if (repairedSnapshot != null) {
          const repairedResult = deserializeOrderInvarianceSnapshotOutput(repairedSnapshot);
          if (repairedResult != null) {
            log.warn({
              inputHash: cachePayload.inputHash,
              snapshotId: repairedSnapshot.id,
            }, 'Returning repaired order-invariance snapshot after duplicate CURRENT repair');
            return repairedResult;
          }
          log.warn({
            inputHash: cachePayload.inputHash,
            snapshotId: repairedSnapshot.id,
          }, 'Repaired order-invariance snapshot was unreadable, recomputing');
          shouldRepairUnreadableSnapshot = true;
        }
      } else {
        log.error({ err: error, inputHash: cachePayload.inputHash }, 'Order-invariance snapshot lookup failed, recomputing in memory');
      }
    }

    const computedResult = computeOrderInvarianceFromSelections({
      relevantPairs,
      effectiveModels,
      lockedById,
      trimOutliers: params.trimOutliers,
      directionOnly: params.directionOnly,
      getPick,
    });

    try {
      await writeCurrentOrderEffectSnapshot({
        client: tx,
        payload: cachePayload,
        output: serializeOrderInvarianceSnapshotOutput(computedResult),
        allowReuseCurrent: !shouldRepairUnreadableSnapshot,
      });
    } catch (error) {
      if (error instanceof DuplicateCurrentOrderEffectSnapshotError) {
        const failureContext = buildOrderEffectCacheFailureContext({
          ...cacheFailureBase,
          duplicateError: error,
          phase: 'cache_write',
        });
        log.error({
          err: error,
          ...failureContext,
        }, 'Order-effect snapshot write failed because duplicate CURRENT snapshots require manual repair');
        throw createOrderEffectCacheInvariantError(failureContext);
      }
      log.error({ err: error, inputHash: cachePayload.inputHash }, 'Order-invariance snapshot write failed, returning uncached result');
    }

    return computedResult;
  });
}

export async function getOrderInvarianceTranscriptResult(params: {
  vignetteId: string;
  modelId: string;
  conditionKey: string;
}): Promise<OrderInvarianceTranscriptResult> {
  const activeModels = await db.llmModel.findMany({
    where: { status: 'ACTIVE' },
    select: { modelId: true, displayName: true },
  });
  const activeModelLabels = new Map(
    activeModels.map((model) => [model.modelId, model.displayName])
  );

  const lockedById = new Map(
    LOCKED_ASSUMPTION_VIGNETTES.map((vignette) => [vignette.id, vignette])
  );
  const vignetteTitle = lockedById.get(params.vignetteId)?.title ?? params.vignetteId;
  const labels = parseAttributeLabels(vignetteTitle);
  const levels = parseConditionLevels(params.conditionKey);

  const pairs = await db.assumptionScenarioPair.findMany({
    where: {
      assumptionKey: ORDER_INVARIANCE_KEY,
      equivalenceReviewStatus: 'APPROVED',
      equivalenceReviewedAt: { not: null },
      sourceScenario: {
        definitionId: params.vignetteId,
        deletedAt: null,
      },
      variantScenario: {
        deletedAt: null,
      },
    },
    include: {
      sourceScenario: {
        select: {
          id: true,
          name: true,
          definitionId: true,
          orientationFlipped: true,
        },
      },
      variantScenario: {
        select: {
          id: true,
          name: true,
          definitionId: true,
          orientationFlipped: true,
        },
      },
    },
  }) as unknown as PairRecord[];

  const matchingPair = pairs.find((candidate) => buildConditionKey(candidate.sourceScenario.name) === params.conditionKey) ?? null;

  if (matchingPair == null) {
    return {
      generatedAt: new Date(),
      vignetteId: params.vignetteId,
      vignetteTitle,
      modelId: params.modelId,
      modelLabel: activeModelLabels.get(params.modelId) ?? params.modelId,
      conditionKey: params.conditionKey,
      attributeALabel: labels.attributeALabel,
      attributeBLabel: labels.attributeBLabel,
      transcripts: [],
    };
  }

  const transcriptRecords = await db.transcript.findMany({
    where: {
      deletedAt: null,
      scenarioId: { in: [matchingPair.sourceScenario.id, matchingPair.variantScenario.id] },
      modelId: params.modelId,
    },
    select: {
      id: true,
      runId: true,
      scenarioId: true,
      modelId: true,
      modelVersion: true,
      content: true,
      decisionCode: true,
      decisionCodeSource: true,
      turnCount: true,
      tokenCount: true,
      durationMs: true,
      estimatedCost: true,
      createdAt: true,
      lastAccessedAt: true,
      run: {
        select: {
          deletedAt: true,
          config: true,
          tags: {
            select: {
              tag: {
                select: { name: true },
              },
            },
          },
        },
      },
    },
  }) as TranscriptDetailRecord[];

  const transcripts = transcriptRecords
    .filter((transcript) => {
      if (transcript.scenarioId == null || transcript.run.deletedAt != null) {
        return false;
      }
      if (!isTempZeroRun(transcript.run.config)) {
        return false;
      }

      const assumptionKey = getRunAssumptionKey(transcript.run.config);
      const isBaselineScenario = transcript.scenarioId === matchingPair.sourceScenario.id;
      if (isBaselineScenario) {
        if (assumptionKey == null || !BASELINE_ASSUMPTION_KEYS.has(assumptionKey)) {
          return false;
        }
        if (assumptionKey !== 'temp_zero_determinism' && !isAssumptionRun(transcript.run.tags)) {
          return false;
        }
      } else if (assumptionKey !== ORDER_INVARIANCE_KEY || !isAssumptionRun(transcript.run.tags)) {
        return false;
      }

      return true;
    })
    .map((transcript) => ({
      id: transcript.id,
      runId: transcript.runId,
      scenarioId: transcript.scenarioId ?? '',
      modelId: transcript.modelId,
      modelVersion: transcript.modelVersion,
      content: transcript.content,
      decisionCode: transcript.decisionCode,
      decisionCodeSource: transcript.decisionCodeSource,
      turnCount: transcript.turnCount,
      tokenCount: transcript.tokenCount,
      durationMs: transcript.durationMs,
      estimatedCost: transcript.estimatedCost,
      createdAt: transcript.createdAt,
      lastAccessedAt: transcript.lastAccessedAt,
      orderLabel: transcript.scenarioId === matchingPair.sourceScenario.id ? 'A First' : 'B First',
      attributeALevel: levels.attributeALevel,
      attributeBLevel: levels.attributeBLevel,
    }))
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

  return {
    generatedAt: new Date(),
    vignetteId: params.vignetteId,
    vignetteTitle,
    modelId: params.modelId,
    modelLabel: activeModelLabels.get(params.modelId) ?? params.modelId,
    conditionKey: params.conditionKey,
    attributeALabel: labels.attributeALabel,
    attributeBLabel: labels.attributeBLabel,
    transcripts,
  };
}
