import { createLogger } from '@valuerank/shared';
import type {
  AggregateMetadata,
  AnalysisResult,
  RawPreferenceSummary,
  RawReliabilitySummary,
} from '../../api/operations/analysis';

const log = createLogger('analysis-semantics-adapter');

const SUMMARY_VERSION_FLOOR = [1, 1, 1] as const;
const EPSILON = 0.000001;

export type SemanticUnavailableReason =
  | 'legacy-analysis'
  | 'aggregate-analysis'
  | 'suppressed-run-type'
  | 'unknown-analysis-version'
  | 'no-repeat-coverage'
  | 'insufficient-preference-data'
  | 'invalid-summary-shape';

export type AvailabilityState =
  | { status: 'available' }
  | { status: 'unavailable'; reason: SemanticUnavailableReason; message: string };

export type PreferenceViewModel = {
  modelId: string;
  overallLean: 'A' | 'B' | 'NEUTRAL' | null;
  overallSignedCenter: number | null;
  preferenceStrength: number | null;
  topPrioritizedValues: string[];
  topDeprioritizedValues: string[];
  neutralValues: string[];
  availability: AvailabilityState;
};

export type ReliabilityViewModel = {
  modelId: string;
  baselineReliability: number | null;
  baselineNoise: number | null;
  directionalAgreement: number | null;
  neutralShare: number | null;
  coverageCount: number;
  uniqueScenarios: number;
  repeatCoverageShare: number | null;
  contributingRunCount: number | null;
  weightedOverallSignedCenterSd: number | null;
  hasLowCoverageWarning: boolean;
  hasHighDriftWarning: boolean;
  availability: AvailabilityState;
};

export type AnalysisSemanticsView = {
  preference: {
    rowAvailability: AvailabilityState;
    byModel: Record<string, PreferenceViewModel>;
  };
  reliability: {
    rowAvailability: AvailabilityState;
    byModel: Record<string, ReliabilityViewModel>;
    hasAnyAvailableModel: boolean;
    hasMixedAvailability: boolean;
    aggregateWarnings: {
      isEligibleAggregate: boolean;
      lowCoverageModels: string[];
      highDriftModels: string[];
    };
  };
};

type RawPreferenceValueStats = {
  winRate: number;
};

type RawModelPreferenceSummary = {
  preferenceDirection: {
    byValue: Record<string, RawPreferenceValueStats>;
    overallLean: 'A' | 'B' | 'NEUTRAL' | null;
    overallSignedCenter: number | null;
  };
  preferenceStrength: number | null;
};

type RawModelReliabilitySummary = {
  baselineNoise: number | null;
  baselineReliability: number | null;
  directionalAgreement: number | null;
  neutralShare: number | null;
  coverageCount: number;
  uniqueScenarios: number;
};

type ParsedAggregateMetadata = AggregateMetadata;

type SemverTuple = readonly [number, number, number];

type AggregateSource = 'prop' | 'analysisType';

const UNAVAILABLE_MESSAGES: Record<SemanticUnavailableReason, string> = {
  'legacy-analysis': 'This analysis predates vignette preference and reliability summaries. Recompute to populate these views.',
  'aggregate-analysis': 'This aggregate cannot be shown on the new Analysis page because the source runs do not match the pooling rules.',
  'suppressed-run-type': 'This run type does not publish vignette preference or reliability summaries. Recomputing the same run will not populate these views.',
  'unknown-analysis-version': 'This analysis does not expose enough version metadata to classify summary availability.',
  'no-repeat-coverage': 'This model has one sample per scenario, so baseline reliability is unavailable. Recomputing the same run without repeated samples will not populate this section.',
  'insufficient-preference-data': 'Not enough usable scenario means are available to compute preference strength.',
  'invalid-summary-shape': 'Stored analysis summaries are invalid for this UI version.',
};

function availableState(): AvailabilityState {
  return { status: 'available' };
}

function unavailableState(reason: SemanticUnavailableReason): AvailabilityState {
  return {
    status: 'unavailable',
    reason,
    message: UNAVAILABLE_MESSAGES[reason],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isRate(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

function parseSemver(version: string): SemverTuple | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    return null;
  }

  const major = Number.parseInt(match[1] ?? '', 10);
  const minor = Number.parseInt(match[2] ?? '', 10);
  const patch = Number.parseInt(match[3] ?? '', 10);

  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }

  return [major, minor, patch] as const;
}

function compareSemver(left: SemverTuple, right: SemverTuple): number {
  for (const index of [0, 1, 2] as const) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }
  return 0;
}

function sanitizeLog(
  analysis: AnalysisResult,
  details: {
    section?: 'preference' | 'reliability';
    reason: SemanticUnavailableReason;
    aggregateSource?: AggregateSource;
    aggregateEligibility?: string;
  },
) {
  log.warn({
    analysisId: analysis.id,
    codeVersion: analysis.codeVersion,
    section: details.section,
    reason: details.reason,
    aggregateSource: details.aggregateSource,
    aggregateEligibility: details.aggregateEligibility,
  });
}

function aggregateUnavailableState(
  analysis: AnalysisResult,
  aggregateMetadata: ParsedAggregateMetadata | null,
  aggregateSource: AggregateSource,
): AvailabilityState {
  if (aggregateMetadata?.aggregateEligibility === 'eligible_same_signature_baseline') {
    return availableState();
  }

  const message = aggregateMetadata?.aggregateIneligibilityReason
    ?? (
      compareSemver(parseSemver(analysis.codeVersion) ?? SUMMARY_VERSION_FLOOR, SUMMARY_VERSION_FLOOR) < 0
        ? 'This aggregate was made before the new pooled summaries existed. Use the old view for now, or wait until this aggregate is refreshed.'
        : UNAVAILABLE_MESSAGES['aggregate-analysis']
    );

  sanitizeLog(analysis, {
    reason: 'aggregate-analysis',
    aggregateSource,
    aggregateEligibility: aggregateMetadata?.aggregateEligibility,
  });

  return {
    status: 'unavailable',
    reason: 'aggregate-analysis',
    message,
  };
}

function parseRawPreferenceValueStats(value: unknown): RawPreferenceValueStats | null {
  if (!isRecord(value)) {
    return null;
  }

  const winRate = value.winRate;
  if (!isRate(winRate)) {
    return null;
  }

  const count = value.count;
  if (count !== undefined) {
    if (!isRecord(count)) {
      return null;
    }
    if (
      !isNonNegativeInteger(count.prioritized)
      || !isNonNegativeInteger(count.deprioritized)
      || !isNonNegativeInteger(count.neutral)
    ) {
      return null;
    }
  }

  return { winRate };
}

function parseRawPreferenceSummaryEntry(value: unknown): RawModelPreferenceSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const preferenceDirection = value.preferenceDirection;
  if (!isRecord(preferenceDirection)) {
    return null;
  }

  const byValue = preferenceDirection.byValue;
  if (!isRecord(byValue)) {
    return null;
  }

  const parsedByValue: Record<string, RawPreferenceValueStats> = {};
  for (const [valueId, stats] of Object.entries(byValue)) {
    const parsedStats = parseRawPreferenceValueStats(stats);
    if (!parsedStats) {
      return null;
    }
    parsedByValue[valueId] = parsedStats;
  }

  const overallLean = preferenceDirection.overallLean;
  if (overallLean !== null && overallLean !== 'A' && overallLean !== 'B' && overallLean !== 'NEUTRAL') {
    return null;
  }

  const overallSignedCenter = preferenceDirection.overallSignedCenter;
  if (overallSignedCenter !== null && !isFiniteNumber(overallSignedCenter)) {
    return null;
  }

  const preferenceStrength = value.preferenceStrength;
  if (preferenceStrength !== null && !isNonNegativeNumber(preferenceStrength)) {
    return null;
  }

  return {
    preferenceDirection: {
      byValue: parsedByValue,
      overallLean,
      overallSignedCenter,
    },
    preferenceStrength,
  };
}

function parseRawReliabilitySummaryEntry(value: unknown): RawModelReliabilitySummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const baselineNoise = value.baselineNoise;
  const baselineReliability = value.baselineReliability;
  const directionalAgreement = value.directionalAgreement;
  const neutralShare = value.neutralShare;
  const coverageCount = value.coverageCount;
  const uniqueScenarios = value.uniqueScenarios;

  if (baselineNoise !== null && !isNonNegativeNumber(baselineNoise)) {
    return null;
  }
  if (baselineReliability !== null && !isRate(baselineReliability)) {
    return null;
  }
  if (directionalAgreement !== null && !isRate(directionalAgreement)) {
    return null;
  }
  if (neutralShare !== null && !isRate(neutralShare)) {
    return null;
  }
  if (!isNonNegativeInteger(coverageCount) || !isNonNegativeInteger(uniqueScenarios)) {
    return null;
  }

  return {
    baselineNoise,
    baselineReliability,
    directionalAgreement,
    neutralShare,
    coverageCount,
    uniqueScenarios,
  };
}

function parseAggregateMetadata(value: AggregateMetadata | null | undefined): ParsedAggregateMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const aggregateEligibility = value.aggregateEligibility;
  const sourceRunCount = value.sourceRunCount;
  const sourceRunIds = value.sourceRunIds;
  const aggregateIneligibilityReason = value.aggregateIneligibilityReason;
  const conditionCoverage = value.conditionCoverage;
  const perModelRepeatCoverage = value.perModelRepeatCoverage;
  const perModelDrift = value.perModelDrift;

  if (
    typeof aggregateEligibility !== 'string'
    || !isNonNegativeInteger(sourceRunCount)
    || !Array.isArray(sourceRunIds)
    || !sourceRunIds.every((item) => typeof item === 'string')
    || (aggregateIneligibilityReason !== null && typeof aggregateIneligibilityReason !== 'string')
    || !isRecord(conditionCoverage)
    || !isNonNegativeInteger(conditionCoverage.plannedConditionCount)
    || !isNonNegativeInteger(conditionCoverage.observedConditionCount)
    || typeof conditionCoverage.complete !== 'boolean'
    || !isRecord(perModelRepeatCoverage)
    || !isRecord(perModelDrift)
  ) {
    return null;
  }

  for (const coverage of Object.values(perModelRepeatCoverage)) {
    if (
      !isRecord(coverage)
      || !isNonNegativeInteger(coverage.repeatCoverageCount)
      || !isRate(coverage.repeatCoverageShare)
      || !isNonNegativeInteger(coverage.contributingRunCount)
    ) {
      return null;
    }
  }

  for (const drift of Object.values(perModelDrift)) {
    if (
      !isRecord(drift)
      || (drift.weightedOverallSignedCenterSd !== null && !isNonNegativeNumber(drift.weightedOverallSignedCenterSd))
      || typeof drift.exceedsWarningThreshold !== 'boolean'
    ) {
      return null;
    }
  }

  return value;
}

function deriveValueLists(byValue: Record<string, RawPreferenceValueStats>) {
  const entries = Object.entries(byValue).map(([valueId, stats]) => ({
    valueId,
    winRate: stats.winRate,
    distance: Math.abs(stats.winRate - 0.5),
  }));

  const sortByStrength = (left: { valueId: string; distance: number }, right: { valueId: string; distance: number }) => {
    if (right.distance !== left.distance) {
      return right.distance - left.distance;
    }
    return left.valueId.localeCompare(right.valueId);
  };

  const prioritized = entries
    .filter((entry) => entry.winRate > 0.5 + EPSILON)
    .sort(sortByStrength)
    .slice(0, 3)
    .map((entry) => entry.valueId);
  const deprioritized = entries
    .filter((entry) => entry.winRate < 0.5 - EPSILON)
    .sort(sortByStrength)
    .slice(0, 3)
    .map((entry) => entry.valueId);
  const neutral = entries
    .filter((entry) => Math.abs(entry.winRate - 0.5) <= EPSILON)
    .sort(sortByStrength)
    .slice(0, 3)
    .map((entry) => entry.valueId);

  return {
    topPrioritizedValues: prioritized,
    topDeprioritizedValues: deprioritized,
    neutralValues: neutral,
  };
}

function buildPreferenceUnavailableModel(modelId: string, reason: SemanticUnavailableReason): PreferenceViewModel {
  return {
    modelId,
    overallLean: null,
    overallSignedCenter: null,
    preferenceStrength: null,
    topPrioritizedValues: [],
    topDeprioritizedValues: [],
    neutralValues: [],
    availability: unavailableState(reason),
  };
}

function buildReliabilityUnavailableModel(modelId: string, reason: SemanticUnavailableReason): ReliabilityViewModel {
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

function buildRowUnavailableView(
  analysis: AnalysisResult,
  modelIds: string[],
  availability: AvailabilityState,
): AnalysisSemanticsView {
  if (availability.status === 'unavailable' && availability.reason !== 'aggregate-analysis') {
    sanitizeLog(analysis, { section: 'preference', reason: availability.reason });
    sanitizeLog(analysis, { section: 'reliability', reason: availability.reason });
  }

  return {
    preference: {
      rowAvailability: availability,
      byModel: Object.fromEntries(modelIds.map((modelId) => [
        modelId,
        buildPreferenceUnavailableModel(modelId, availability.status === 'unavailable' ? availability.reason : 'invalid-summary-shape'),
      ])),
    },
    reliability: {
      rowAvailability: availability,
      byModel: Object.fromEntries(modelIds.map((modelId) => [
        modelId,
        buildReliabilityUnavailableModel(modelId, availability.status === 'unavailable' ? availability.reason : 'invalid-summary-shape'),
      ])),
      hasAnyAvailableModel: false,
      hasMixedAvailability: false,
      aggregateWarnings: {
        isEligibleAggregate: false,
        lowCoverageModels: [],
        highDriftModels: [],
      },
    },
  };
}

function resolveRowReason(
  analysis: AnalysisResult,
  isAggregate: boolean,
): AvailabilityState | null {
  const aggregateSource: AggregateSource | null = isAggregate
    ? 'prop'
    : analysis.analysisType === 'AGGREGATE'
      ? 'analysisType'
      : null;

  if (aggregateSource) {
    const parsedAggregateMetadata = parseAggregateMetadata(analysis.aggregateMetadata);
    const aggregateState = aggregateUnavailableState(analysis, parsedAggregateMetadata, aggregateSource);
    if (aggregateState.status === 'available') {
      return null;
    }
    return aggregateState;
  }

  const parsedVersion = parseSemver(analysis.codeVersion);
  if (!parsedVersion) {
    return unavailableState('unknown-analysis-version');
  }

  if (analysis.preferenceSummary == null && analysis.reliabilitySummary == null) {
    return compareSemver(parsedVersion, SUMMARY_VERSION_FLOOR) < 0
      ? unavailableState('legacy-analysis')
      : unavailableState('suppressed-run-type');
  }

  return null;
}

function buildPreferenceSection(
  analysis: AnalysisResult,
  modelIds: string[],
  rawSummary: RawPreferenceSummary | null | undefined,
): AnalysisSemanticsView['preference'] {
  if (rawSummary == null) {
    sanitizeLog(analysis, { section: 'preference', reason: 'invalid-summary-shape' });
    return {
      rowAvailability: unavailableState('invalid-summary-shape'),
      byModel: Object.fromEntries(modelIds.map((modelId) => [modelId, buildPreferenceUnavailableModel(modelId, 'invalid-summary-shape')])),
    };
  }

  if (!isRecord(rawSummary.perModel)) {
    sanitizeLog(analysis, { section: 'preference', reason: 'invalid-summary-shape' });
    return {
      rowAvailability: unavailableState('invalid-summary-shape'),
      byModel: Object.fromEntries(modelIds.map((modelId) => [modelId, buildPreferenceUnavailableModel(modelId, 'invalid-summary-shape')])),
    };
  }

  const byModel: Record<string, PreferenceViewModel> = {};
  let hasValidModel = false;

  for (const modelId of modelIds) {
    const rawModel = rawSummary.perModel[modelId];
    const parsedModel = parseRawPreferenceSummaryEntry(rawModel);

    if (!parsedModel) {
      byModel[modelId] = buildPreferenceUnavailableModel(modelId, 'invalid-summary-shape');
      continue;
    }

    hasValidModel = true;
    const valueLists = deriveValueLists(parsedModel.preferenceDirection.byValue);
    byModel[modelId] = {
      modelId,
      overallLean: parsedModel.preferenceDirection.overallLean,
      overallSignedCenter: parsedModel.preferenceDirection.overallSignedCenter,
      preferenceStrength: parsedModel.preferenceStrength,
      topPrioritizedValues: valueLists.topPrioritizedValues,
      topDeprioritizedValues: valueLists.topDeprioritizedValues,
      neutralValues: valueLists.neutralValues,
      availability: parsedModel.preferenceStrength === null
        ? unavailableState('insufficient-preference-data')
        : availableState(),
    };
  }

  if (!hasValidModel) {
    sanitizeLog(analysis, { section: 'preference', reason: 'invalid-summary-shape' });
    return {
      rowAvailability: unavailableState('invalid-summary-shape'),
      byModel,
    };
  }

  return {
    rowAvailability: availableState(),
    byModel,
  };
}

function buildReliabilitySection(
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

export function buildAnalysisSemanticsView(
  analysis: AnalysisResult,
  isAggregate: boolean,
): AnalysisSemanticsView {
  const modelIds = Object.keys(analysis.perModel).sort((left, right) => left.localeCompare(right));

  if (modelIds.length === 0) {
    sanitizeLog(analysis, { section: 'preference', reason: 'invalid-summary-shape' });
    sanitizeLog(analysis, { section: 'reliability', reason: 'invalid-summary-shape' });
    return {
      preference: {
        rowAvailability: unavailableState('invalid-summary-shape'),
        byModel: {},
      },
      reliability: {
        rowAvailability: unavailableState('invalid-summary-shape'),
        byModel: {},
        hasAnyAvailableModel: false,
        hasMixedAvailability: false,
        aggregateWarnings: {
          isEligibleAggregate: false,
          lowCoverageModels: [],
          highDriftModels: [],
        },
      },
    };
  }

  const parsedAggregateMetadata = parseAggregateMetadata(analysis.aggregateMetadata);
  const rowReason = resolveRowReason(analysis, isAggregate);
  if (rowReason) {
    return buildRowUnavailableView(analysis, modelIds, rowReason);
  }

  return {
    preference: buildPreferenceSection(analysis, modelIds, analysis.preferenceSummary),
    reliability: buildReliabilitySection(analysis, modelIds, analysis.reliabilitySummary, parsedAggregateMetadata),
  };
}
