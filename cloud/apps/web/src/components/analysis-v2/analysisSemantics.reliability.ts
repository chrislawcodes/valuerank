import type { AnalysisResult, RawReliabilitySummary } from '../../api/operations/analysis';
import type {
  AnalysisSemanticsView,
  ParsedAggregateMetadata,
  ReliabilityViewModel,
  RawModelReliabilitySummary,
  SemanticUnavailableReason,
} from './analysisSemantics.types';
import {
  availableState,
  averageWeighted,
  isNonNegativeInteger,
  isNonNegativeNumber,
  isRate,
  isRecord,
  parseAggregateMetadata,
  parseRawReliabilitySummaryEntry,
  sanitizeLog,
  unavailableState,
} from './analysisSemantics.utils';

export function buildReliabilityUnavailableModel(modelId: string, reason: SemanticUnavailableReason): ReliabilityViewModel {
  return {
    modelId,
    baselineReliability: null,
    baselineNoise: null,
    directionalAgreement: null,
    neutralShare: null,
    coverageCount: 0,
    uniqueScenarios: 0,
    repeatCoverageShare: null,
    contributingRunCount: null,
    weightedOverallSignedCenterSd: null,
    hasLowCoverageWarning: false,
    hasHighDriftWarning: false,
    availability: unavailableState(reason),
  };
}

export function buildMergedReliabilityModel(
  modelId: string,
  analyses: AnalysisResult[],
): ReliabilityViewModel {
  const parsedModels = analyses
    .map((analysis) => {
      const perModel = isRecord(analysis.reliabilitySummary?.perModel)
        ? analysis.reliabilitySummary.perModel
        : null;
      return parseRawReliabilitySummaryEntry(perModel?.[modelId]);
    })
    .filter((entry): entry is RawModelReliabilitySummary => entry !== null);

  if (parsedModels.length === 0) {
    return buildReliabilityUnavailableModel(modelId, 'invalid-summary-shape');
  }

  const coverageCount = parsedModels.reduce((sum, entry) => sum + entry.coverageCount, 0);
  const uniqueScenarios = parsedModels.reduce((sum, entry) => sum + entry.uniqueScenarios, 0);
  const weightedEntries = parsedModels.map((entry) => ({
    weight: entry.coverageCount,
    baselineNoise: entry.baselineNoise,
    baselineReliability: entry.baselineReliability,
    directionalAgreement: entry.directionalAgreement,
    neutralShare: entry.neutralShare,
  }));
  const aggregateEntries = analyses
    .map((analysis) => parseAggregateMetadata(analysis.aggregateMetadata))
    .filter((entry): entry is ParsedAggregateMetadata => entry !== null);
  const repeatCoverageEntries = aggregateEntries
    .map((entry) => entry.perModelRepeatCoverage[modelId])
    .filter((entry): entry is ParsedAggregateMetadata['perModelRepeatCoverage'][string] => isRecord(entry)
      && isNonNegativeInteger(entry.repeatCoverageCount)
      && isRate(entry.repeatCoverageShare)
      && isNonNegativeInteger(entry.contributingRunCount));
  const driftEntries = aggregateEntries
    .map((entry) => entry.perModelDrift[modelId])
    .filter((entry): entry is ParsedAggregateMetadata['perModelDrift'][string] => isRecord(entry)
      && (entry.weightedOverallSignedCenterSd === null || isNonNegativeNumber(entry.weightedOverallSignedCenterSd))
      && typeof entry.exceedsWarningThreshold === 'boolean');

  const availability = coverageCount === 0 || parsedModels.every((entry) => entry.baselineReliability === null)
    ? unavailableState('no-repeat-coverage')
    : availableState();
  const repeatCoverageShare = averageWeighted(
    repeatCoverageEntries.map((entry) => ({
      value: entry.repeatCoverageShare,
      weight: Math.max(entry.contributingRunCount, 1),
    })),
  );
  const contributingRunCount = repeatCoverageEntries.reduce((sum, entry) => sum + entry.contributingRunCount, 0);
  const weightedOverallSignedCenterSd = averageWeighted(
    driftEntries
      .filter((entry) => entry.weightedOverallSignedCenterSd !== null)
      .map((entry) => ({
        value: entry.weightedOverallSignedCenterSd ?? 0,
        weight: 1,
      })),
  );
  const hasLowCoverageWarning = repeatCoverageEntries.some((entry) => entry.repeatCoverageCount >= 3 && entry.repeatCoverageCount < 5);
  const hasHighDriftWarning = driftEntries.some((entry) => entry.exceedsWarningThreshold);

  return {
    modelId,
    baselineNoise: averageWeighted(
      weightedEntries
        .filter((entry) => entry.baselineNoise !== null)
        .map((entry) => ({ value: entry.baselineNoise ?? 0, weight: entry.weight })),
    ),
    baselineReliability: averageWeighted(
      weightedEntries
        .filter((entry) => entry.baselineReliability !== null)
        .map((entry) => ({ value: entry.baselineReliability ?? 0, weight: entry.weight })),
    ),
    directionalAgreement: averageWeighted(
      weightedEntries
        .filter((entry) => entry.directionalAgreement !== null)
        .map((entry) => ({ value: entry.directionalAgreement ?? 0, weight: entry.weight })),
    ),
    neutralShare: averageWeighted(
      weightedEntries
        .filter((entry) => entry.neutralShare !== null)
        .map((entry) => ({ value: entry.neutralShare ?? 0, weight: entry.weight })),
    ),
    coverageCount,
    uniqueScenarios,
    repeatCoverageShare,
    contributingRunCount: contributingRunCount > 0 ? contributingRunCount : null,
    weightedOverallSignedCenterSd,
    hasLowCoverageWarning,
    hasHighDriftWarning,
    availability,
  };
}

export function buildReliabilitySection(
  analysis: AnalysisResult,
  modelIds: string[],
  rawSummary: RawReliabilitySummary | null | undefined,
  aggregateMetadata: ParsedAggregateMetadata | null,
): AnalysisSemanticsView['reliability'] {
  if (rawSummary == null) {
    sanitizeLog(analysis, { section: 'reliability', reason: 'invalid-summary-shape' });
    return {
      rowAvailability: unavailableState('invalid-summary-shape'),
      byModel: Object.fromEntries(modelIds.map((modelId) => [modelId, buildReliabilityUnavailableModel(modelId, 'invalid-summary-shape')])),
      hasAnyAvailableModel: false,
      hasMixedAvailability: false,
      aggregateWarnings: {
        isEligibleAggregate: false,
        lowCoverageModels: [],
        highDriftModels: [],
      },
    };
  }

  if (!isRecord(rawSummary.perModel)) {
    sanitizeLog(analysis, { section: 'reliability', reason: 'invalid-summary-shape' });
    return {
      rowAvailability: unavailableState('invalid-summary-shape'),
      byModel: Object.fromEntries(modelIds.map((modelId) => [modelId, buildReliabilityUnavailableModel(modelId, 'invalid-summary-shape')])),
      hasAnyAvailableModel: false,
      hasMixedAvailability: false,
      aggregateWarnings: {
        isEligibleAggregate: false,
        lowCoverageModels: [],
        highDriftModels: [],
      },
    };
  }

  const byModel: Record<string, ReliabilityViewModel> = {};
  let hasValidModel = false;
  let hasAvailableModel = false;
  let hasUnavailableModel = false;
  let allUnavailableAreNoRepeat = true;
  const lowCoverageModels: string[] = [];
  const highDriftModels: string[] = [];

  for (const modelId of modelIds) {
    const rawModel = rawSummary.perModel[modelId];
    const parsedModel = parseRawReliabilitySummaryEntry(rawModel);
    const repeatCoverage = aggregateMetadata?.perModelRepeatCoverage[modelId];
    const drift = aggregateMetadata?.perModelDrift[modelId];
    const repeatCoverageCount = isRecord(repeatCoverage) && isNonNegativeInteger(repeatCoverage.repeatCoverageCount)
      ? repeatCoverage.repeatCoverageCount
      : parsedModel?.coverageCount ?? 0;
    const repeatCoverageShare = isRecord(repeatCoverage) && isRate(repeatCoverage.repeatCoverageShare)
      ? repeatCoverage.repeatCoverageShare
      : null;
    const contributingRunCount = isRecord(repeatCoverage) && isNonNegativeInteger(repeatCoverage.contributingRunCount)
      ? repeatCoverage.contributingRunCount
      : null;
    const weightedOverallSignedCenterSd = isRecord(drift) && (drift.weightedOverallSignedCenterSd === null || isNonNegativeNumber(drift.weightedOverallSignedCenterSd))
      ? drift.weightedOverallSignedCenterSd
      : null;
    const hasHighDriftWarning = isRecord(drift) && drift.exceedsWarningThreshold === true;

    if (!parsedModel) {
      byModel[modelId] = buildReliabilityUnavailableModel(modelId, 'invalid-summary-shape');
      hasUnavailableModel = true;
      allUnavailableAreNoRepeat = false;
      continue;
    }

    hasValidModel = true;
    const noRepeatCoverage = parsedModel.coverageCount === 0 || parsedModel.baselineReliability === null;
    const availability = noRepeatCoverage
      ? unavailableState('no-repeat-coverage')
      : availableState();
    const hasLowCoverageWarning = availability.status === 'available' && repeatCoverageCount >= 3 && repeatCoverageCount < 5;

    if (availability.status === 'available') {
      hasAvailableModel = true;
      if (hasLowCoverageWarning) {
        lowCoverageModels.push(modelId);
      }
      if (hasHighDriftWarning) {
        highDriftModels.push(modelId);
      }
    } else {
      hasUnavailableModel = true;
    }

    if (!(availability.status === 'unavailable' && availability.reason === 'no-repeat-coverage')) {
      allUnavailableAreNoRepeat = false;
    }

    byModel[modelId] = {
      modelId,
      baselineReliability: parsedModel.baselineReliability,
      baselineNoise: parsedModel.baselineNoise,
      directionalAgreement: parsedModel.directionalAgreement,
      neutralShare: parsedModel.neutralShare,
      coverageCount: parsedModel.coverageCount,
      uniqueScenarios: parsedModel.uniqueScenarios,
      repeatCoverageShare,
      contributingRunCount,
      weightedOverallSignedCenterSd,
      hasLowCoverageWarning,
      hasHighDriftWarning,
      availability,
    };
  }

  if (!hasValidModel) {
    sanitizeLog(analysis, { section: 'reliability', reason: 'invalid-summary-shape' });
    return {
      rowAvailability: unavailableState('invalid-summary-shape'),
      byModel,
      hasAnyAvailableModel: false,
      hasMixedAvailability: false,
      aggregateWarnings: {
        isEligibleAggregate: false,
        lowCoverageModels: [],
        highDriftModels: [],
      },
    };
  }

  if (!hasAvailableModel && allUnavailableAreNoRepeat) {
    return {
      rowAvailability: unavailableState('no-repeat-coverage'),
      byModel,
      hasAnyAvailableModel: false,
      hasMixedAvailability: false,
      aggregateWarnings: {
        isEligibleAggregate: false,
        lowCoverageModels: [],
        highDriftModels: [],
      },
    };
  }

  if (!hasAvailableModel) {
    sanitizeLog(analysis, { section: 'reliability', reason: 'invalid-summary-shape' });
    return {
      rowAvailability: unavailableState('invalid-summary-shape'),
      byModel,
      hasAnyAvailableModel: false,
      hasMixedAvailability: false,
      aggregateWarnings: {
        isEligibleAggregate: false,
        lowCoverageModels: [],
        highDriftModels: [],
      },
    };
  }

  return {
    rowAvailability: availableState(),
    byModel,
    hasAnyAvailableModel: true,
    hasMixedAvailability: hasAvailableModel && hasUnavailableModel,
    aggregateWarnings: {
      isEligibleAggregate: aggregateMetadata?.aggregateEligibility === 'eligible_same_signature_baseline',
      lowCoverageModels,
      highDriftModels,
    },
  };
}
