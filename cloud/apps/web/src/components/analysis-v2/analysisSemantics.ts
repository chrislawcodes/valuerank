import type { AnalysisResult } from '../../api/operations/analysis';
import type {
  AnalysisSemanticsView,
  AggregateSource,
  AvailabilityState,
  ParsedAggregateMetadata,
  PreferenceViewModel,
  ReliabilityViewModel,
} from './analysisSemantics.types';
import {
  SUMMARY_VERSION_FLOOR,
  aggregateUnavailableState,
  availableState,
  compareSemver,
  parseAggregateMetadata,
  parseSemver,
  sanitizeLog,
  unavailableState,
} from './analysisSemantics.utils';
import { buildPreferenceSection, buildMergedPreferenceModel, buildPreferenceUnavailableModel } from './analysisSemantics.preference';
import { buildReliabilitySection, buildMergedReliabilityModel, buildReliabilityUnavailableModel } from './analysisSemantics.reliability';

// Re-export all public types so consumers can import from this single file
export type {
  AnalysisSemanticsView,
  AvailabilityState,
  PreferenceViewModel,
  ReliabilityViewModel,
  SemanticUnavailableReason,
} from './analysisSemantics.types';

function buildInvalidSummaryView(): AnalysisSemanticsView {
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

function unionModelIds(...analyses: Array<AnalysisResult | null | undefined>): string[] {
  return Array.from(new Set(
    analyses.flatMap((analysis) => Object.keys(analysis?.perModel ?? {})),
  )).sort((left, right) => left.localeCompare(right));
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

export function buildAnalysisSemanticsView(
  analysis: AnalysisResult,
  isAggregate: boolean,
  filteredModelIds?: string[],
): AnalysisSemanticsView {
  const allModelIds = Object.keys(analysis.perModel).sort((left, right) => left.localeCompare(right));
  const modelIds = filteredModelIds
    ? filteredModelIds.filter((id) => allModelIds.includes(id)).sort((left, right) => left.localeCompare(right))
    : allModelIds;

  if (modelIds.length === 0) {
    sanitizeLog(analysis, { section: 'preference', reason: 'invalid-summary-shape' });
    sanitizeLog(analysis, { section: 'reliability', reason: 'invalid-summary-shape' });
    return buildInvalidSummaryView();
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

export function buildPairedAnalysisSemanticsView(
  currentAnalysis: AnalysisResult,
  companionAnalysis: AnalysisResult | null | undefined,
  isAggregate: boolean,
  filteredModelIds?: string[],
): AnalysisSemanticsView {
  if (!companionAnalysis) {
    return buildAnalysisSemanticsView(currentAnalysis, isAggregate, filteredModelIds);
  }

  const analyses = [currentAnalysis, companionAnalysis];
  const allModelIds = unionModelIds(currentAnalysis, companionAnalysis);
  const modelIds = filteredModelIds
    ? filteredModelIds.filter((id) => allModelIds.includes(id)).sort((left, right) => left.localeCompare(right))
    : allModelIds;
  if (modelIds.length === 0) {
    sanitizeLog(currentAnalysis, { section: 'preference', reason: 'invalid-summary-shape' });
    sanitizeLog(currentAnalysis, { section: 'reliability', reason: 'invalid-summary-shape' });
    return buildInvalidSummaryView();
  }

  const preferenceByModel: Record<string, PreferenceViewModel> = {};
  const reliabilityByModel: Record<string, ReliabilityViewModel> = {};
  let hasAvailablePreferenceModel = false;
  let hasAvailableReliabilityModel = false;
  let hasUnavailableReliabilityModel = false;
  const lowCoverageModels: string[] = [];
  const highDriftModels: string[] = [];

  for (const modelId of modelIds) {
    const mergedPreference = buildMergedPreferenceModel(modelId, analyses);
    const mergedReliability = buildMergedReliabilityModel(modelId, analyses);
    preferenceByModel[modelId] = mergedPreference;
    reliabilityByModel[modelId] = mergedReliability;

    if (mergedPreference.availability.status === 'available') {
      hasAvailablePreferenceModel = true;
    }
    if (mergedReliability.availability.status === 'available') {
      hasAvailableReliabilityModel = true;
      if (mergedReliability.hasLowCoverageWarning) {
        lowCoverageModels.push(modelId);
      }
      if (mergedReliability.hasHighDriftWarning) {
        highDriftModels.push(modelId);
      }
    } else {
      hasUnavailableReliabilityModel = true;
    }
  }
  const aggregateEntries = analyses
    .map((analysis) => parseAggregateMetadata(analysis.aggregateMetadata))
    .filter((entry): entry is ParsedAggregateMetadata => entry !== null);

  return {
    preference: {
      rowAvailability: hasAvailablePreferenceModel
        ? availableState()
        : unavailableState('invalid-summary-shape'),
      byModel: preferenceByModel,
    },
    reliability: {
      rowAvailability: hasAvailableReliabilityModel
        ? availableState()
        : unavailableState('no-repeat-coverage'),
      byModel: reliabilityByModel,
      hasAnyAvailableModel: hasAvailableReliabilityModel,
      hasMixedAvailability: hasAvailableReliabilityModel && hasUnavailableReliabilityModel,
      aggregateWarnings: {
        isEligibleAggregate: aggregateEntries.length > 0
          && aggregateEntries.every((entry) => entry.aggregateEligibility === 'eligible_same_signature_baseline'),
        lowCoverageModels,
        highDriftModels,
      },
    },
  };
}
