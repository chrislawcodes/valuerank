import { createLogger } from '@valuerank/shared';
import type { AnalysisResult } from '../../api/operations/analysis';
import type {
  AggregateSource,
  AvailabilityState,
  ParsedAggregateMetadata,
  RawModelReliabilitySummary,
  RawPreferenceValueStats,
  SemanticUnavailableReason,
  SemverTuple,
} from './analysisSemantics.types';

export const log: ReturnType<typeof createLogger> = createLogger('analysis-semantics-adapter');

export const SUMMARY_VERSION_FLOOR = [1, 1, 1] as const;
export const EPSILON = 0.000001;

export const UNAVAILABLE_MESSAGES: Record<SemanticUnavailableReason, string> = {
  'legacy-analysis': 'This analysis predates vignette preference and reliability summaries. Recompute to populate these views.',
  'aggregate-analysis': 'This aggregate cannot be shown on the new Analysis page because the source runs do not match the pooling rules.',
  'suppressed-run-type': 'This run type does not publish vignette preference or reliability summaries. Recomputing the same run will not populate these views.',
  'unknown-analysis-version': 'This analysis does not expose enough version metadata to classify summary availability.',
  'no-repeat-coverage': 'This model has one sample per condition, so baseline reliability is unavailable. Recomputing the same run without repeated samples will not populate this section.',
  'insufficient-preference-data': 'Not enough usable condition means are available to compute preference strength.',
  'invalid-summary-shape': 'Stored analysis summaries are invalid for this UI version.',
};

export function availableState(): AvailabilityState {
  return { status: 'available' };
}

export function unavailableState(reason: SemanticUnavailableReason): AvailabilityState {
  return {
    status: 'unavailable',
    reason,
    message: UNAVAILABLE_MESSAGES[reason],
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

export function isRate(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

export function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

export function parseSemver(version: string): SemverTuple | null {
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

export function compareSemver(left: SemverTuple, right: SemverTuple): number {
  for (const index of [0, 1, 2] as const) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }
  return 0;
}

export function sanitizeLog(
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

export function aggregateUnavailableState(
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

export function parseRawPreferenceValueStats(value: unknown): RawPreferenceValueStats | null {
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

  return {
    winRate,
    count: count === undefined
      ? undefined
      : {
          prioritized: Number(count.prioritized),
          deprioritized: Number(count.deprioritized),
          neutral: Number(count.neutral),
        },
  };
}

export function parseRawReliabilitySummaryEntry(value: unknown): RawModelReliabilitySummary | null {
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

export function parseAggregateMetadata(value: ParsedAggregateMetadata | null | undefined): ParsedAggregateMetadata | null {
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

export function averageWeighted(values: Array<{ value: number; weight: number }>): number | null {
  const populated = values.filter((entry) => Number.isFinite(entry.value) && entry.weight > 0);
  if (populated.length === 0) {
    return null;
  }

  const totalWeight = populated.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return null;
  }

  const total = populated.reduce((sum, entry) => sum + (entry.value * entry.weight), 0);
  return total / totalWeight;
}
