import { db, type Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { LOCKED_ASSUMPTION_VIGNETTES } from '../../graphql/assumptions-constants.js';
import { parseTemperature } from '../../utils/temperature.js';
import {
  aggregateWithinCellDisagreementRate,
  classifyStableSide,
  computeCanonicalCellScore,
  computeMADMetrics,
  computeMatch,
  ORDER_EFFECT_SNAPSHOT_OUTPUT_SCHEMA_VERSION,
  ORDER_EFFECT_VARIANT_METADATA,
  computePairMarginSummary,
  computeScaleOrderPullLabel,
  computeValueOrderPullLabel,
  computeWithinCellDisagreementRate,
  getConsideredTrials,
  getPairedConsideredTrials,
  isOrderEffectVariantType,
  normalizeDecision,
  type OrderEffectComparisonRecord,
  type OrderEffectVariantType,
  type PairLevelMarginSummary,
} from './order-effect-analysis.js';
import {
  buildOrderEffectCachePayload,
  DuplicateCurrentOrderEffectSnapshotError,
  getCurrentOrderEffectSnapshot,
  writeCurrentOrderEffectSnapshot,
} from './order-effect-cache.js';

const ORDER_INVARIANCE_KEY = 'order_invariance';
const BASELINE_ASSUMPTION_KEYS = new Set(['temp_zero_determinism', ORDER_INVARIANCE_KEY]);
const VALID_DECISIONS = new Set(['1', '2', '3', '4', '5']);
const ORDER_INVARIANCE_REQUIRED_TRIAL_COUNT = 5;
const log = createLogger('assumptions:order-effect-service');

export type OrderInvarianceStatus = 'COMPUTED' | 'INSUFFICIENT_DATA';
export type OrderInvarianceMismatchType = 'direction_flip' | 'exact_flip' | 'missing_pair' | null;

export type OrderInvarianceExclusionCount = {
  reason: string;
  count: number;
};

export type OrderInvarianceSummary = {
  status: OrderInvarianceStatus;
  matchRate: number | null;
  exactMatchRate: number | null;
  presentationEffectMAD: number | null;
  scaleEffectMAD: number | null;
  totalCandidatePairs: number;
  qualifyingPairs: number;
  missingPairs: number;
  comparablePairs: number;
  matchComparablePairs: number;
  presentationComparablePairs: number;
  scaleComparablePairs: number;
  presentationMissingPairs: number;
  scaleMissingPairs: number;
  sensitiveModelCount: number;
  sensitiveVignetteCount: number;
  excludedPairs: OrderInvarianceExclusionCount[];
};

export type OrderInvarianceRow = {
  modelId: string;
  modelLabel: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  variantType: string | null;
  majorityVoteBaseline: number | null;
  majorityVoteFlipped: number | null;
  rawScore: number | null;
  mismatchType: OrderInvarianceMismatchType;
  ordinalDistance: number | null;
  isMatch: boolean | null;
};

export type OrderInvarianceModelMetrics = {
  modelId: string;
  modelLabel: string;
  matchRate: number | null;
  matchCount: number;
  matchEligibleCount: number;
  valueOrderReversalRate: number | null;
  valueOrderEligibleCount: number;
  valueOrderExcludedCount: number;
  valueOrderPull: 'toward first-listed' | 'toward second-listed' | 'no clear pull';
  scaleOrderReversalRate: number | null;
  scaleOrderEligibleCount: number;
  scaleOrderExcludedCount: number;
  scaleOrderPull: 'toward higher numbers' | 'toward lower numbers' | 'no clear pull';
  withinCellDisagreementRate: number | null;
  pairLevelMarginSummary: PairLevelMarginSummary | null;
};

export type OrderInvarianceResult = {
  generatedAt: Date;
  summary: OrderInvarianceSummary;
  modelMetrics: OrderInvarianceModelMetrics[];
  rows: OrderInvarianceRow[];
};

export type OrderInvarianceTranscript = {
  id: string;
  runId: string;
  scenarioId: string;
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
  orderLabel: string;
  attributeALevel: number | null;
  attributeBLevel: number | null;
};

export type OrderInvarianceTranscriptResult = {
  generatedAt: Date;
  vignetteId: string;
  vignetteTitle: string;
  modelId: string;
  modelLabel: string;
  conditionKey: string;
  attributeALabel: string | null;
  attributeBLabel: string | null;
  transcripts: OrderInvarianceTranscript[];
};

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

type CandidateTranscript = {
  id: string;
  scenarioId: string;
  modelId: string;
  modelVersion: string | null;
  rawDecision: number;
  decision: number;
  createdAt: Date;
};

type CandidateTranscriptRecord = {
  id: string;
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  decisionCode: string | null;
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

type PickResult =
  | {
    kind: 'selected';
    selected: CandidateTranscript[];
    modelVersion: string | null;
  }
  | {
    kind: 'insufficient';
  }
  | {
    kind: 'fragmented';
  };

type EffectiveModel = {
  modelId: string;
  modelLabel: string;
};

type ModelMetricsAccumulator = {
  modelId: string;
  modelLabel: string;
  matchCount: number;
  matchEligibleCount: number;
  valueOrderReversalCount: number;
  valueOrderEligibleCount: number;
  valueOrderExcludedCount: number;
  valueOrderDrifts: number[];
  scaleOrderReversalCount: number;
  scaleOrderEligibleCount: number;
  scaleOrderExcludedCount: number;
  scaleOrderDrifts: number[];
  cellDisagreementByScenario: Map<string, number>;
  limitingMargins: number[];
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
    await tx.$queryRawUnsafe(
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
    for (const pair of pairRows) {
      scenarioIdToVariantType.set(pair.sourceScenario.id, null);
      scenarioIdToVariantType.set(pair.variantScenario.id, pair.variantType);
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

      const decision = parseDecision(transcript.decisionCode);
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
        throw error;
      }
      log.error({ err: error, inputHash: cachePayload.inputHash }, 'Order-invariance snapshot lookup failed, recomputing in memory');
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

function computeOrderInvarianceFromSelections(params: {
  relevantPairs: PairRecord[];
  effectiveModels: EffectiveModel[];
  lockedById: Map<string, { id: string; title: string }>;
  trimOutliers: boolean;
  directionOnly: boolean;
  getPick: (scenarioId: string, modelId: string) => PickResult;
}): OrderInvarianceResult {
  const excludedCounts = new Map<string, number>();
  const rows: OrderInvarianceRow[] = [];
  const modelMetricsAccumulators = new Map<string, ModelMetricsAccumulator>(
    params.effectiveModels.map((model) => [
      model.modelId,
      createModelMetricsAccumulator(model.modelId, model.modelLabel),
    ])
  );
  let qualifyingPairs = 0;
  let missingPairs = 0;
  let comparablePairs = 0;
  let legacyMatchEligibleCount = 0;
  let legacyDirectionMatchCount = 0;
  let legacyExactMatchCount = 0;
  let matchComparablePairs = 0;
  let presentationComparablePairs = 0;
  let scaleComparablePairs = 0;
  let presentationMissingPairs = 0;
  let scaleMissingPairs = 0;
  const scorePivot = new Map<string, Record<string, number>>();

  for (const pair of params.relevantPairs) {
    const vignette = params.lockedById.get(pair.sourceScenario.definitionId);
    const vignetteTitle = vignette?.title ?? pair.sourceScenario.definitionId;
    const conditionKey = buildConditionKey(pair.sourceScenario.name);
    const variantMetadata = getVariantMetadata(pair.variantType);

    for (const model of params.effectiveModels) {
      const metrics = modelMetricsAccumulators.get(model.modelId)
        ?? createModelMetricsAccumulator(model.modelId, model.modelLabel);
      modelMetricsAccumulators.set(model.modelId, metrics);

      const baselinePick = params.getPick(pair.sourceScenario.id, model.modelId);
      const flippedPick = params.getPick(pair.variantScenario.id, model.modelId);

      if (baselinePick.kind === 'fragmented' || flippedPick.kind === 'fragmented') {
        excludedCounts.set(
          'model_version_mismatch',
          (excludedCounts.get('model_version_mismatch') ?? 0) + 1
        );
        bumpVariantExcludedCount(metrics, pair.variantType);
        continue;
      }

      qualifyingPairs += 1;

      if (baselinePick.kind !== 'selected' || flippedPick.kind !== 'selected') {
        missingPairs += 1;
        if (pair.variantType === 'presentation_flipped' || pair.variantType === 'fully_flipped') {
          presentationMissingPairs += 1;
        }
        if (pair.variantType === 'scale_flipped' || pair.variantType === 'fully_flipped') {
          scaleMissingPairs += 1;
        }
        bumpVariantExcludedCount(metrics, pair.variantType);
        rows.push({
          modelId: model.modelId,
          modelLabel: model.modelLabel,
          vignetteId: pair.sourceScenario.definitionId,
          vignetteTitle,
          conditionKey,
          variantType: pair.variantType,
          majorityVoteBaseline: null,
          majorityVoteFlipped: null,
          rawScore: null,
          mismatchType: 'missing_pair',
          ordinalDistance: null,
          isMatch: null,
        });
        continue;
      }

      const versionsCompatible = (
        baselinePick.modelVersion === flippedPick.modelVersion
        || (baselinePick.modelVersion == null && flippedPick.modelVersion == null)
      );
      if (!versionsCompatible) {
        qualifyingPairs -= 1;
        excludedCounts.set(
          'model_version_mismatch',
          (excludedCounts.get('model_version_mismatch') ?? 0) + 1
        );
        bumpVariantExcludedCount(metrics, pair.variantType);
        continue;
      }

      const baselineValue = computeMajorityVote(
        baselinePick.selected.map((transcript) => transcript.decision),
        params.trimOutliers
      );
      const flippedValue = computeMajorityVote(
        flippedPick.selected.map((transcript) => transcript.decision),
        params.trimOutliers
      );

      if (baselineValue == null || flippedValue == null) {
        missingPairs += 1;
        if (pair.variantType === 'presentation_flipped' || pair.variantType === 'fully_flipped') {
          presentationMissingPairs += 1;
        }
        if (pair.variantType === 'scale_flipped' || pair.variantType === 'fully_flipped') {
          scaleMissingPairs += 1;
        }
        bumpVariantExcludedCount(metrics, pair.variantType);
        rows.push({
          modelId: model.modelId,
          modelLabel: model.modelLabel,
          vignetteId: pair.sourceScenario.definitionId,
          vignetteTitle,
          conditionKey,
          variantType: pair.variantType,
          majorityVoteBaseline: baselineValue,
          majorityVoteFlipped: flippedValue,
          rawScore: null,
          mismatchType: 'missing_pair',
          ordinalDistance: null,
          isMatch: null,
        });
        continue;
      }

      comparablePairs += 1;
      if (pair.variantType === 'presentation_flipped' || pair.variantType === 'fully_flipped') {
        presentationComparablePairs += 1;
      }
      if (pair.variantType === 'scale_flipped' || pair.variantType === 'fully_flipped') {
        scaleComparablePairs += 1;
      }
      if (pair.variantType === 'fully_flipped') {
        matchComparablePairs += 1;
      }
      const directionMatch = computeMatch(baselineValue, flippedValue, true) ?? false;
      const exactMatch = computeMatch(baselineValue, flippedValue, false) ?? false;
      const isMatch = params.directionOnly ? directionMatch : exactMatch;
      if (variantMetadata?.metricFamily === 'legacy_match') {
        legacyMatchEligibleCount += 1;
        if (directionMatch) {
          legacyDirectionMatchCount += 1;
        }
        if (exactMatch) {
          legacyExactMatchCount += 1;
        }
      }

      const mismatchType: OrderInvarianceMismatchType = isMatch
        ? null
        : (params.directionOnly ? 'direction_flip' : 'exact_flip');
      const pivotKey = `${pair.sourceScenario.definitionId}::${conditionKey}::${model.modelId}`;
      const scores = scorePivot.get(pivotKey) ?? {};
      scores.baseline = baselineValue;
      if (variantMetadata != null) {
        scores[pair.variantType as OrderEffectVariantType] = flippedValue;
      }
      scorePivot.set(pivotKey, scores);

      const comparisonRecord = buildComparisonRecord({
        pair,
        modelId: model.modelId,
        modelLabel: model.modelLabel,
        vignetteTitle,
        conditionKey,
        baselinePick,
        flippedPick,
        trimOutliers: params.trimOutliers,
        directionOnly: params.directionOnly,
      });

      if (comparisonRecord != null) {
        if (
          variantMetadata?.metricFamily === 'legacy_match'
          && comparisonRecord.matchesBaseline != null
        ) {
          metrics.matchEligibleCount += 1;
          if (comparisonRecord.matchesBaseline) {
            metrics.matchCount += 1;
          }
        }

        if (comparisonRecord.withinCellDisagreement.baseline != null) {
          metrics.cellDisagreementByScenario.set(
            pair.sourceScenario.id,
            comparisonRecord.withinCellDisagreement.baseline
          );
        }
        if (comparisonRecord.withinCellDisagreement.variant != null) {
          metrics.cellDisagreementByScenario.set(
            pair.variantScenario.id,
            comparisonRecord.withinCellDisagreement.variant
          );
        }

        if (variantMetadata?.metricFamily === 'value_order') {
          if (comparisonRecord.reversed == null) {
            metrics.valueOrderExcludedCount += 1;
          } else {
            metrics.valueOrderEligibleCount += 1;
            if (comparisonRecord.reversed) {
              metrics.valueOrderReversalCount += 1;
            }
            if (
              comparisonRecord.baselineCellScore != null
              && comparisonRecord.variantCellScore != null
            ) {
              metrics.valueOrderDrifts.push(
                comparisonRecord.variantCellScore - comparisonRecord.baselineCellScore
              );
            }
            if (comparisonRecord.pairMargin.limiting != null) {
              metrics.limitingMargins.push(comparisonRecord.pairMargin.limiting);
            }
          }
        } else if (variantMetadata?.metricFamily === 'scale_order') {
          if (comparisonRecord.reversed == null) {
            metrics.scaleOrderExcludedCount += 1;
          } else {
            metrics.scaleOrderEligibleCount += 1;
            if (comparisonRecord.reversed) {
              metrics.scaleOrderReversalCount += 1;
            }
            if (
              comparisonRecord.rawBaselineCellScore != null
              && comparisonRecord.rawVariantCellScore != null
            ) {
              metrics.scaleOrderDrifts.push(
                comparisonRecord.rawVariantCellScore - comparisonRecord.rawBaselineCellScore
              );
            }
            if (comparisonRecord.pairMargin.limiting != null) {
              metrics.limitingMargins.push(comparisonRecord.pairMargin.limiting);
            }
          }
        }
      }

      rows.push({
        modelId: model.modelId,
        modelLabel: model.modelLabel,
        vignetteId: pair.sourceScenario.definitionId,
        vignetteTitle,
        conditionKey,
        variantType: pair.variantType,
        majorityVoteBaseline: baselineValue,
        majorityVoteFlipped: flippedValue,
        rawScore: comparisonRecord?.rawVariantCellScore ?? null,
        mismatchType,
        ordinalDistance: Math.abs(baselineValue - flippedValue),
        isMatch,
      });
    }
  }

  const comparableRows = rows.filter((row) => row.ordinalDistance != null);
  const sensitiveModelCount = new Set(
    comparableRows
      .filter((row) => (row.ordinalDistance ?? 0) >= 2)
      .map((row) => row.modelId)
  ).size;
  const sensitiveVignetteCount = new Set(
    comparableRows
      .filter((row) => (row.ordinalDistance ?? 0) >= 2)
      .map((row) => row.vignetteId)
  ).size;
  const { presentationEffectMAD, scaleEffectMAD } = computeMADMetrics(scorePivot);

  const summary: OrderInvarianceSummary = {
    status: comparablePairs === 0 ? 'INSUFFICIENT_DATA' : 'COMPUTED',
    matchRate: legacyMatchEligibleCount > 0
      ? (params.directionOnly ? legacyDirectionMatchCount : legacyExactMatchCount) / legacyMatchEligibleCount
      : null,
    exactMatchRate: legacyMatchEligibleCount > 0 ? legacyExactMatchCount / legacyMatchEligibleCount : null,
    presentationEffectMAD,
    scaleEffectMAD,
    totalCandidatePairs: params.relevantPairs.length * params.effectiveModels.length,
    qualifyingPairs,
    missingPairs,
    comparablePairs,
    matchComparablePairs,
    presentationComparablePairs,
    scaleComparablePairs,
    presentationMissingPairs,
    scaleMissingPairs,
    sensitiveModelCount,
    sensitiveVignetteCount,
    excludedPairs: Array.from(excludedCounts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reason, count]) => ({ reason, count })),
  };

  return {
    generatedAt: new Date(),
    summary,
    modelMetrics: params.effectiveModels
      .map((model) => finalizeModelMetrics(
        modelMetricsAccumulators.get(model.modelId)
          ?? createModelMetricsAccumulator(model.modelId, model.modelLabel)
      ))
      .sort((left, right) => left.modelLabel.localeCompare(right.modelLabel)),
    rows: rows.sort((left, right) => (
      left.vignetteTitle.localeCompare(right.vignetteTitle)
      || left.modelLabel.localeCompare(right.modelLabel)
      || left.conditionKey.localeCompare(right.conditionKey, undefined, { numeric: true, sensitivity: 'base' })
    )),
  };
}

function buildConditionKey(name: string): string {
  const match = name.match(/_(\d+)\s*\/.*_(\d+)$/);
  if (!match) {
    return name;
  }
  return `${match[1] ?? '?'}x${match[2] ?? '?'}`;
}

function parseAttributeLabels(vignetteTitle: string): { attributeALabel: string | null; attributeBLabel: string | null } {
  const match = vignetteTitle.match(/\((.+?)\s+vs\s+(.+?)\)$/);
  if (!match) {
    return { attributeALabel: null, attributeBLabel: null };
  }

  return {
    attributeALabel: match[1]?.trim() ?? null,
    attributeBLabel: match[2]?.trim() ?? null,
  };
}

function parseConditionLevels(conditionKey: string): { attributeALevel: number | null; attributeBLevel: number | null } {
  const match = conditionKey.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { attributeALevel: null, attributeBLevel: null };
  }

  const attributeALevel = Number.parseInt(match[1] ?? '', 10);
  const attributeBLevel = Number.parseInt(match[2] ?? '', 10);

  return {
    attributeALevel: Number.isFinite(attributeALevel) ? attributeALevel : null,
    attributeBLevel: Number.isFinite(attributeBLevel) ? attributeBLevel : null,
  };
}

function getRunAssumptionKey(config: unknown): string | null {
  if (config == null || typeof config !== 'object') {
    return null;
  }
  const value = (config as Record<string, unknown>).assumptionKey;
  return typeof value === 'string' && value !== '' ? value : null;
}

function isAssumptionRun(tags: Array<{ tag: { name: string } }>): boolean {
  return tags.some((tag) => tag.tag.name === 'assumption-run');
}

function isTempZeroRun(config: unknown): boolean {
  return parseTemperature((config as { temperature?: unknown } | null)?.temperature) === 0;
}

function parseDecision(decisionCode: string | null): number | null {
  if (decisionCode == null || !VALID_DECISIONS.has(decisionCode)) {
    return null;
  }
  return Number(decisionCode);
}

function pickStableTranscripts(
  candidates: CandidateTranscript[],
  requiredCount: number
): PickResult {
  if (candidates.length < requiredCount) {
    return { kind: 'insufficient' };
  }

  const sorted = [...candidates].sort((left, right) => (
    right.createdAt.getTime() - left.createdAt.getTime()
  ));
  const groups = new Map<string, CandidateTranscript[]>();
  const versionOrder: string[] = [];

  for (const candidate of sorted) {
    const key = candidate.modelVersion ?? '__NULL__';
    const existing = groups.get(key);
    if (existing != null) {
      existing.push(candidate);
      continue;
    }
    groups.set(key, [candidate]);
    versionOrder.push(key);
  }

  for (const versionKey of versionOrder) {
    const group = groups.get(versionKey) ?? [];
    if (group.length >= requiredCount) {
      return {
        kind: 'selected',
        selected: group.slice(0, requiredCount),
        modelVersion: versionKey === '__NULL__' ? null : versionKey,
      };
    }
  }

  return groups.size > 1 ? { kind: 'fragmented' } : { kind: 'insufficient' };
}

function computeMajorityVote(values: number[], trimOutliers: boolean): number | null {
  return computeCanonicalCellScore(getConsideredTrials(values, trimOutliers));
}

function getVariantMetadata(variantType: string | null) {
  if (!isOrderEffectVariantType(variantType)) {
    return null;
  }
  return ORDER_EFFECT_VARIANT_METADATA[variantType];
}

function buildComparisonRecord(params: {
  pair: PairRecord;
  modelId: string;
  modelLabel: string;
  vignetteTitle: string;
  conditionKey: string;
  baselinePick: Extract<PickResult, { kind: 'selected' }>;
  flippedPick: Extract<PickResult, { kind: 'selected' }>;
  trimOutliers: boolean;
  directionOnly: boolean;
}): OrderEffectComparisonRecord | null {
  if (!isOrderEffectVariantType(params.pair.variantType)) {
    return null;
  }

  const baselineNormalizedDecisions = params.baselinePick.selected.map((transcript) => transcript.decision);
  const variantNormalizedDecisions = params.flippedPick.selected.map((transcript) => transcript.decision);
  const baselineRawDecisions = params.baselinePick.selected.map((transcript) => transcript.rawDecision);
  const variantRawDecisions = params.flippedPick.selected.map((transcript) => transcript.rawDecision);
  const baselineConsidered = getPairedConsideredTrials(
    baselineRawDecisions,
    baselineNormalizedDecisions,
    params.trimOutliers
  );
  const variantConsidered = getPairedConsideredTrials(
    variantRawDecisions,
    variantNormalizedDecisions,
    params.trimOutliers
  );
  const baselineConsideredTrials = baselineConsidered.normalized;
  const variantConsideredTrials = variantConsidered.normalized;
  const rawBaselineConsideredTrials = baselineConsidered.raw;
  const rawVariantConsideredTrials = variantConsidered.raw;

  const baselineCellScore = computeCanonicalCellScore(baselineConsideredTrials);
  const variantCellScore = computeCanonicalCellScore(variantConsideredTrials);

  if (baselineCellScore == null || variantCellScore == null) {
    return null;
  }

  const rawBaselineCellScore = computeCanonicalCellScore(rawBaselineConsideredTrials);
  const rawVariantCellScore = computeCanonicalCellScore(rawVariantConsideredTrials);
  const baselineStableBase = classifyStableSide(baselineConsideredTrials);
  const variantStableBase = classifyStableSide(variantConsideredTrials);
  const baselineStableSide = baselineCellScore === 3 ? 'neutral' : baselineStableBase;
  const variantStableSide = variantCellScore === 3 ? 'neutral' : variantStableBase;
  const matchesBaseline = computeMatch(baselineCellScore, variantCellScore, params.directionOnly);
  const eligibleForReversal = (
    (baselineStableSide === 'lean_low' || baselineStableSide === 'lean_high')
    && (variantStableSide === 'lean_low' || variantStableSide === 'lean_high')
  );
  const reversed = eligibleForReversal
    ? baselineStableSide !== variantStableSide
    : null;
  const baselineMargin = Math.abs(baselineCellScore - 3);
  const variantMargin = Math.abs(variantCellScore - 3);

  return {
    modelId: params.modelId,
    modelLabel: params.modelLabel,
    vignetteId: params.pair.sourceScenario.definitionId,
    vignetteTitle: params.vignetteTitle,
    conditionKey: params.conditionKey,
    variantType: params.pair.variantType,
    baselineRawDecisions,
    variantRawDecisions,
    baselineNormalizedDecisions,
    variantNormalizedDecisions,
    baselineConsideredTrials,
    variantConsideredTrials,
    rawBaselineConsideredTrials,
    rawVariantConsideredTrials,
    baselineCellScore,
    variantCellScore,
    rawBaselineCellScore,
    rawVariantCellScore,
    baselineStableSide,
    variantStableSide,
    matchesBaseline,
    reversed,
    withinCellDisagreement: {
      baseline: computeWithinCellDisagreementRate(baselineConsideredTrials),
      variant: computeWithinCellDisagreementRate(variantConsideredTrials),
    },
    pairMargin: {
      baseline: baselineMargin,
      variant: variantMargin,
      limiting: Math.min(baselineMargin, variantMargin),
    },
  };
}

function createModelMetricsAccumulator(modelId: string, modelLabel: string): ModelMetricsAccumulator {
  return {
    modelId,
    modelLabel,
    matchCount: 0,
    matchEligibleCount: 0,
    valueOrderReversalCount: 0,
    valueOrderEligibleCount: 0,
    valueOrderExcludedCount: 0,
    valueOrderDrifts: [],
    scaleOrderReversalCount: 0,
    scaleOrderEligibleCount: 0,
    scaleOrderExcludedCount: 0,
    scaleOrderDrifts: [],
    cellDisagreementByScenario: new Map<string, number>(),
    limitingMargins: [],
  };
}

function finalizeModelMetrics(accumulator: ModelMetricsAccumulator): OrderInvarianceModelMetrics {
  return {
    modelId: accumulator.modelId,
    modelLabel: accumulator.modelLabel,
    matchRate: accumulator.matchEligibleCount > 0
      ? accumulator.matchCount / accumulator.matchEligibleCount
      : null,
    matchCount: accumulator.matchCount,
    matchEligibleCount: accumulator.matchEligibleCount,
    valueOrderReversalRate: accumulator.valueOrderEligibleCount > 0
      ? accumulator.valueOrderReversalCount / accumulator.valueOrderEligibleCount
      : null,
    valueOrderEligibleCount: accumulator.valueOrderEligibleCount,
    valueOrderExcludedCount: accumulator.valueOrderExcludedCount,
    valueOrderPull: computeValueOrderPullLabel(accumulator.valueOrderDrifts),
    scaleOrderReversalRate: accumulator.scaleOrderEligibleCount > 0
      ? accumulator.scaleOrderReversalCount / accumulator.scaleOrderEligibleCount
      : null,
    scaleOrderEligibleCount: accumulator.scaleOrderEligibleCount,
    scaleOrderExcludedCount: accumulator.scaleOrderExcludedCount,
    scaleOrderPull: computeScaleOrderPullLabel(accumulator.scaleOrderDrifts),
    withinCellDisagreementRate: aggregateWithinCellDisagreementRate(
      Array.from(accumulator.cellDisagreementByScenario.values())
    ),
    pairLevelMarginSummary: computePairMarginSummary(accumulator.limitingMargins),
  };
}

function serializeOrderInvarianceSnapshotOutput(result: OrderInvarianceResult): Prisma.InputJsonValue {
  return {
    schemaVersion: ORDER_EFFECT_SNAPSHOT_OUTPUT_SCHEMA_VERSION,
    summary: result.summary,
    modelMetrics: result.modelMetrics,
    rows: result.rows,
  };
}

function deserializeOrderInvarianceSnapshotOutput(snapshot: {
  createdAt: Date;
  output: unknown;
}): OrderInvarianceResult | null {
  if (snapshot.output == null || typeof snapshot.output !== 'object' || Array.isArray(snapshot.output)) {
    return null;
  }

  const candidate = snapshot.output as {
    schemaVersion?: unknown;
    summary?: OrderInvarianceSummary;
    modelMetrics?: OrderInvarianceModelMetrics[];
    rows?: OrderInvarianceRow[];
  };

  if (
    candidate.schemaVersion !== ORDER_EFFECT_SNAPSHOT_OUTPUT_SCHEMA_VERSION
    || !isOrderInvarianceSummary(candidate.summary)
    || !Array.isArray(candidate.modelMetrics)
    || !candidate.modelMetrics.every((entry) => isOrderInvarianceModelMetrics(entry))
    || !Array.isArray(candidate.rows)
    || !candidate.rows.every((entry) => isOrderInvarianceRow(entry))
  ) {
    return null;
  }

  return {
    generatedAt: snapshot.createdAt,
    summary: candidate.summary,
    modelMetrics: candidate.modelMetrics,
    rows: candidate.rows,
  };
}

function bumpVariantExcludedCount(metrics: ModelMetricsAccumulator, variantType: string | null) {
  if (!isOrderEffectVariantType(variantType)) {
    return;
  }

  const metricFamily = ORDER_EFFECT_VARIANT_METADATA[variantType].metricFamily;
  if (metricFamily === 'value_order') {
    metrics.valueOrderExcludedCount += 1;
  } else if (metricFamily === 'scale_order') {
    metrics.scaleOrderExcludedCount += 1;
  }
}

function isOrderInvarianceSummary(value: unknown): value is OrderInvarianceSummary {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.status === 'COMPUTED' || candidate.status === 'INSUFFICIENT_DATA')
    && Array.isArray(candidate.excludedPairs)
    && typeof candidate.totalCandidatePairs === 'number'
    && typeof candidate.qualifyingPairs === 'number'
    && typeof candidate.missingPairs === 'number'
    && typeof candidate.comparablePairs === 'number'
  );
}

function isOrderInvarianceModelMetrics(value: unknown): value is OrderInvarianceModelMetrics {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.modelId === 'string'
    && typeof candidate.modelLabel === 'string'
    && typeof candidate.matchCount === 'number'
    && typeof candidate.matchEligibleCount === 'number'
    && typeof candidate.valueOrderEligibleCount === 'number'
    && typeof candidate.scaleOrderEligibleCount === 'number'
  );
}

function isOrderInvarianceRow(value: unknown): value is OrderInvarianceRow {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.modelId === 'string'
    && typeof candidate.modelLabel === 'string'
    && typeof candidate.vignetteId === 'string'
    && typeof candidate.vignetteTitle === 'string'
    && typeof candidate.conditionKey === 'string'
  );
}

function fingerprintPick(key: string, pick: PickResult): string {
  if (pick.kind !== 'selected') {
    return `${key}::${pick.kind}`;
  }

  return [
    key,
    'selected',
    pick.modelVersion ?? '__NULL__',
    ...pick.selected.map((transcript) => (
      [
        transcript.id,
        transcript.scenarioId,
        transcript.modelId,
        transcript.modelVersion ?? '__NULL__',
        transcript.rawDecision,
        transcript.decision,
        transcript.createdAt.toISOString(),
      ].join(':')
    )),
  ].join('::');
}
