import type {
  ModelMetricsAccumulator,
  OrderInvarianceMismatchType,
  OrderInvarianceResult,
  OrderInvarianceRow,
  OrderInvarianceSummary,
  PickResult,
} from './order-effect-types.js';
import {
  type PairRecord,
  type EffectiveModel,
  buildComparisonRecord,
  buildConditionKey,
  createModelMetricsAccumulator,
  finalizeModelMetrics,
  getVariantMetadata,
  bumpVariantExcludedCount,
  computeMajorityVote,
} from './order-effect-comparison.js';
import {
  type OrderEffectVariantType,
  computeMADMetrics,
  computeMatch,
} from './order-effect-statistics.js';

export {
  ORDER_INVARIANCE_ASSUMPTION_KEY,
  REVERSAL_METRICS_ANALYSIS_TYPE,
  REVERSAL_METRICS_CODE_VERSION,
  ORDER_EFFECT_VARIANT_METADATA,
  ORDER_EFFECT_VARIANT_TYPES,
  ORDER_EFFECT_SNAPSHOT_OUTPUT_SCHEMA_VERSION,
  MIDPOINT_SCORE,
  MIN_PULL_DIRECTION_SHARE,
  MIN_PULL_NON_ZERO_PAIRS,
  aggregateWithinCellDisagreementRate,
  classifyStableSide,
  computeCanonicalCellScore,
  computeMADMetrics,
  computeMatch,
  computePairMarginSummary,
  computeScaleOrderPullLabel,
  computeValueOrderPullLabel,
  computeWithinCellDisagreementRate,
  getConsideredTrials,
  getPairedConsideredTrials,
  getScaleEffectStatus,
  isOrderEffectVariantType,
  normalizeDecision,
} from './order-effect-statistics.js';
export type {
  PairLevelMarginSummary,
  PairRecord,
  EffectiveModel,
  OrderEffectComparisonRecord,
} from './order-effect-comparison.js';

export function computeOrderInvarianceFromSelections(params: {
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
