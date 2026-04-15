import type { AnalysisResult, RawPreferenceSummary } from '../../api/operations/analysis';
import type {
  AnalysisSemanticsView,
  PreferenceValueSummary,
  PreferenceViewModel,
  RawModelPreferenceSummary,
  RawPreferenceValueStats,
  SemanticUnavailableReason,
} from './analysisSemantics.types';
import {
  EPSILON,
  availableState,
  averageWeighted,
  isRecord,
  parseRawPreferenceValueStats,
  sanitizeLog,
  unavailableState,
} from './analysisSemantics.utils';

function combineOverallLean(overallSignedCenter: number | null): 'A' | 'B' | 'NEUTRAL' | null {
  if (overallSignedCenter === null) {
    return null;
  }

  if (overallSignedCenter > EPSILON) {
    return 'A';
  }
  if (overallSignedCenter < -EPSILON) {
    return 'B';
  }
  return 'NEUTRAL';
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

  const overallSignedCenter = preferenceDirection.overallSignedCenter ?? null;
  if (overallSignedCenter !== null && typeof overallSignedCenter !== 'number') {
    return null;
  }

  const preferenceStrength = value.preferenceStrength ?? null;
  if (preferenceStrength !== null && (typeof preferenceStrength !== 'number' || preferenceStrength < 0)) {
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

export function deriveValueLists(byValue: Record<string, RawPreferenceValueStats>): {
  topPrioritizedValues: PreferenceValueSummary[];
  topDeprioritizedValues: PreferenceValueSummary[];
  neutralValues: PreferenceValueSummary[];
} {
  const entriesWithWinRate = Object.entries(byValue)
    .map(([valueId, stats]) => ({
      name: valueId,
      winRate: stats.winRate,
    }))
    .filter((entry): entry is { name: string; winRate: number } => entry.winRate != null);

  if (entriesWithWinRate.length === 0) {
    return {
      topPrioritizedValues: [],
      topDeprioritizedValues: [],
      neutralValues: [],
    };
  }

  const modelMean = entriesWithWinRate.reduce((sum, entry) => sum + entry.winRate, 0) / entriesWithWinRate.length;
  const entries = entriesWithWinRate.map((entry) => ({
    ...entry,
    distance: entry.winRate - modelMean,
  }));

  const sortByPositiveDistance = (
    left: { name: string; distance: number },
    right: { name: string; distance: number },
  ) => {
    if (right.distance !== left.distance) {
      return right.distance - left.distance;
    }
    return left.name.localeCompare(right.name);
  };

  const sortByNegativeDistance = (
    left: { name: string; distance: number },
    right: { name: string; distance: number },
  ) => {
    if (left.distance !== right.distance) {
      return left.distance - right.distance;
    }
    return left.name.localeCompare(right.name);
  };

  const sortByNeutralDistance = (
    left: { name: string; distance: number },
    right: { name: string; distance: number },
  ) => {
    const leftDistance = Math.abs(left.distance);
    const rightDistance = Math.abs(right.distance);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    return left.name.localeCompare(right.name);
  };

  const prioritized = entries
    .filter((entry) => entry.distance > EPSILON)
    .sort(sortByPositiveDistance)
    .slice(0, 3)
    .map((entry) => ({ name: entry.name, winRate: entry.winRate }));
  const deprioritized = entries
    .filter((entry) => entry.distance < -EPSILON)
    .sort(sortByNegativeDistance)
    .slice(0, 3)
    .map((entry) => ({ name: entry.name, winRate: entry.winRate }));
  const neutral = entries
    .filter((entry) => Math.abs(entry.distance) <= EPSILON)
    .sort(sortByNeutralDistance)
    .slice(0, 3)
    .map((entry) => ({ name: entry.name, winRate: entry.winRate }));

  return {
    topPrioritizedValues: prioritized,
    topDeprioritizedValues: deprioritized,
    neutralValues: neutral,
  };
}

export function buildPreferenceUnavailableModel(modelId: string, reason: SemanticUnavailableReason): PreferenceViewModel {
  return {
    modelId,
    overallLean: null,
    topPrioritizedValues: [],
    topDeprioritizedValues: [],
    neutralValues: [],
    availability: unavailableState(reason),
  };
}

export function buildMergedPreferenceModel(
  modelId: string,
  analyses: AnalysisResult[],
): PreferenceViewModel {
  const parsedModels = analyses
    .map((analysis) => {
      const perModel = isRecord(analysis.preferenceSummary?.perModel)
        ? analysis.preferenceSummary.perModel
        : null;
      return {
        analysis,
        parsed: parseRawPreferenceSummaryEntry(perModel?.[modelId]),
      };
    })
    .filter((entry): entry is { analysis: AnalysisResult; parsed: RawModelPreferenceSummary } => entry.parsed !== null);

  if (parsedModels.length === 0) {
    return buildPreferenceUnavailableModel(modelId, 'invalid-summary-shape');
  }

  const mergedByValue: Record<string, RawPreferenceValueStats> = {};
  const valueIds = new Set(parsedModels.flatMap(({ parsed }) => Object.keys(parsed.preferenceDirection.byValue)));

  valueIds.forEach((valueId) => {
    const stats = parsedModels
      .map(({ parsed }) => parsed.preferenceDirection.byValue[valueId])
      .filter((entry): entry is RawPreferenceValueStats => entry != null);

    if (stats.length === 0) {
      return;
    }

    const allHaveCounts = stats.every((entry) => entry.count !== undefined);
    if (allHaveCounts) {
      const prioritized = stats.reduce((sum, entry) => sum + (entry.count?.prioritized ?? 0), 0);
      const deprioritized = stats.reduce((sum, entry) => sum + (entry.count?.deprioritized ?? 0), 0);
      const neutral = stats.reduce((sum, entry) => sum + (entry.count?.neutral ?? 0), 0);
      const totalResponses = prioritized + deprioritized + neutral;
      mergedByValue[valueId] = {
        winRate: totalResponses > 0 ? prioritized / totalResponses : 0.5,
        count: {
          prioritized,
          deprioritized,
          neutral,
        },
      };
      return;
    }

    const averagedWinRate = averageWeighted(
      parsedModels
        .map(({ analysis, parsed }) => {
          const entry = parsed.preferenceDirection.byValue[valueId];
          if (!entry) {
            return null;
          }
          return {
            value: entry.winRate,
            weight: analysis.perModel[modelId]?.sampleSize ?? 0,
          };
        })
        .filter((entry): entry is { value: number; weight: number } => entry !== null),
    );

    if (averagedWinRate !== null) {
      mergedByValue[valueId] = { winRate: averagedWinRate };
    }
  });

  const overallSignedCenter = averageWeighted(
    parsedModels
      .filter(({ parsed }) => parsed.preferenceDirection.overallSignedCenter !== null)
      .map(({ analysis, parsed }) => ({
        value: parsed.preferenceDirection.overallSignedCenter ?? 0,
        weight: analysis.perModel[modelId]?.sampleSize ?? 0,
      })),
  );
  const preferenceStrength = averageWeighted(
    parsedModels
      .filter(({ parsed }) => parsed.preferenceStrength !== null)
      .map(({ analysis, parsed }) => ({
        value: parsed.preferenceStrength ?? 0,
        weight: analysis.perModel[modelId]?.sampleSize ?? 0,
      })),
  );
  const valueLists = deriveValueLists(mergedByValue);

  return {
    modelId,
    overallLean: combineOverallLean(overallSignedCenter),
    topPrioritizedValues: valueLists.topPrioritizedValues,
    topDeprioritizedValues: valueLists.topDeprioritizedValues,
    neutralValues: valueLists.neutralValues,
    availability: preferenceStrength === null
      ? unavailableState('insufficient-preference-data')
      : availableState(),
  };
}

export function buildPreferenceSection(
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
