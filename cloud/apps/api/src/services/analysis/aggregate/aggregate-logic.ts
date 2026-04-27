import { normalizeAnalysisArtifacts } from '../normalize-analysis-output.js';
import { normalizeScenarioAnalysisMetadata } from '../scenario-metadata.js';
import { AppError } from '@valuerank/shared';
import {
  type AggregatedResult,
  type AggregateScenarioInput,
  type AggregateTranscriptInput,
  type AnalysisOutput,
  type ContestedScenario,
  type DecisionStats,
  type DecisionStatsOption,
  type ModelStats,
  type ValueAggregateStats,
  isAggregatedVisualizationData,
  isRunVarianceAnalysis,
} from './contracts.js';
import { resolveTranscriptDecisionModel } from '../../../graphql/queries/domain/decision-model.js';
import { computeVarianceAnalysis } from './variance.js';

type DecisionAwareAggregateTranscript = AggregateTranscriptInput & {
  decisionMetadata?: unknown;
  definitionSnapshot?: unknown;
};

const CANONICAL_DECISION_BUCKETS = [
  'opponentStrongly',
  'opponentSomewhat',
  'neutral',
  'somewhat',
  'strongly',
] as const;

type CanonicalDecisionBucket = (typeof CANONICAL_DECISION_BUCKETS)[number];

type CanonicalDecisionStats = {
  options: Partial<Record<CanonicalDecisionBucket, DecisionStatsOption>>;
};

function isCanonicalDecisionBucket(value: string): value is CanonicalDecisionBucket {
  return (CANONICAL_DECISION_BUCKETS as readonly string[]).includes(value);
}

function createEmptyDecisionBucketCounts(): Record<CanonicalDecisionBucket, number> {
  return {
    opponentStrongly: 0,
    opponentSomewhat: 0,
    neutral: 0,
    somewhat: 0,
    strongly: 0,
  };
}

function bucketCodeToSignedValue(code: CanonicalDecisionBucket): number {
  if (code === 'strongly') return 2;
  if (code === 'somewhat') return 1;
  if (code === 'neutral') return 0;
  if (code === 'opponentSomewhat') return -1;
  return -2;
}

export function aggregateAnalysesLogic(
  analyses: AnalysisOutput[],
  transcripts: AggregateTranscriptInput[],
  scenarios: AggregateScenarioInput[]
): AggregatedResult {
  if (analyses.length === 0) {
    throw new AppError('Cannot aggregate empty analyses list', 'INVALID_STATE');
  }

  const template = analyses[0]!;
  const modelIds = Array.from(new Set(analyses.flatMap((analysis) => Object.keys(analysis.perModel))));
  const aggregatedPerModel: Record<string, ModelStats> = {};
  const decisionStats: Record<string, CanonicalDecisionStats> = {};
  const valueAggregateStats: Record<string, ValueAggregateStats> = {};

  modelIds.forEach((modelId) => {
    const validAnalyses = analyses.filter((analysis) => Boolean(analysis.perModel[modelId]));
    if (validAnalyses.length === 0) return;

    const totalModelSamples = validAnalyses.reduce((sum, analysis) => {
      const stats = analysis.perModel[modelId];
      if (!stats) return sum;
      return sum + (stats.sampleSize ?? 0);
    }, 0);

    const modelDecisions: Partial<Record<CanonicalDecisionBucket, number[]>> = {};

    validAnalyses.forEach((analysis) => {
      const dist = analysis.visualizationData?.decisionDistribution?.[modelId];
      if (!dist) return;

      const normalizedDist = createEmptyDecisionBucketCounts();

      Object.entries(dist).forEach(([option, count]) => {
        if (!isCanonicalDecisionBucket(option)) return;
        if (typeof count === 'number' && Number.isFinite(count)) {
          normalizedDist[option] += count;
        }
      });

      const runTotal = Object.values(normalizedDist).reduce((sum, count) => sum + count, 0);
      if (runTotal <= 0) return;

      CANONICAL_DECISION_BUCKETS.forEach((code) => {
        const values = modelDecisions[code] ??= [];
        values.push(normalizedDist[code] / runTotal);
      });
    });

    decisionStats[modelId] = { options: {} };
    CANONICAL_DECISION_BUCKETS.forEach((opt) => {
      const values = modelDecisions[opt] || [];
      if (values.length === 0) return;
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
      const sd = Math.sqrt(variance);
      const sem = sd / Math.sqrt(values.length);
      decisionStats[modelId]!.options[opt] = { mean, sd, sem, n: values.length };
    });

    type ValueStatsBuilder = {
      count: { prioritized: number; deprioritized: number; neutral: number };
      winRate: number | null;
    };
    const aggregatedValues: Record<string, ValueStatsBuilder> = {};
    const modelValueRates: Record<string, number[]> = {};

    validAnalyses.forEach((analysis) => {
      const perModelStats = analysis.perModel[modelId];
      if (!perModelStats?.values) return;

      Object.entries(perModelStats.values).forEach(([valueId, valueStats]) => {
        if (!aggregatedValues[valueId]) {
          aggregatedValues[valueId] = {
            count: { prioritized: 0, deprioritized: 0, neutral: 0 },
            winRate: 0,
          };
          modelValueRates[valueId] = [];
        }

        const target = aggregatedValues[valueId];
        target.count.prioritized += valueStats.count.prioritized;
        target.count.deprioritized += valueStats.count.deprioritized;
        target.count.neutral += valueStats.count.neutral;
        if (valueStats.winRate != null) {
          modelValueRates[valueId]!.push(valueStats.winRate);
        }
      });
    });

    valueAggregateStats[modelId] = { values: {} };
    Object.keys(aggregatedValues).forEach((valueId) => {
      const target = aggregatedValues[valueId];
      if (!target) return;

      const totalWins = target.count.prioritized;
      const totalResponses =
        target.count.prioritized + target.count.deprioritized + target.count.neutral;
      target.winRate = totalResponses > 0 ? totalWins / totalResponses : null;

      const rates = modelValueRates[valueId] || [];
      if (rates.length === 0) return;

      const mean = rates.reduce((sum, value) => sum + value, 0) / rates.length;
      const variance = rates.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / rates.length;
      const sd = Math.sqrt(variance);
      const sem = sd / Math.sqrt(rates.length);

      valueAggregateStats[modelId]!.values[valueId] = {
        winRateMean: mean,
        winRateSd: sd,
        winRateSem: sem,
      };
    });

    // Aggregate overall stats from source runs using sample-weighted pooling
    const overallMeans: number[] = [];
    const overallWeights: number[] = [];
    let overallMin = Infinity;
    let overallMax = -Infinity;

    validAnalyses.forEach((analysis) => {
      const stats = analysis.perModel[modelId];
      if (stats?.overall == null) return;
      const n = stats.sampleSize ?? 0;
      if (n <= 0) return;
      if (!Number.isFinite(stats.overall.mean) || !Number.isFinite(stats.overall.stdDev)) return;
      overallMeans.push(stats.overall.mean);
      overallWeights.push(n);
      if (Number.isFinite(stats.overall.min) && stats.overall.min < overallMin) overallMin = stats.overall.min;
      if (Number.isFinite(stats.overall.max) && stats.overall.max > overallMax) overallMax = stats.overall.max;
    });

    let pooledMean = 0;
    let pooledStdDev = 0;
    const totalWeight = overallWeights.reduce((s, w) => s + w, 0);

    if (totalWeight > 0 && overallMeans.length > 0) {
      // Sample-weighted mean
      pooledMean = overallMeans.reduce((s, m, i) => s + m * overallWeights[i]!, 0) / totalWeight;

      // Pooled stdDev: combine within-run variance + between-run variance of means
      let pooledVariance = 0;
      validAnalyses.forEach((analysis) => {
        const stats = analysis.perModel[modelId];
        if (stats?.overall == null) return;
        const n = stats.sampleSize ?? 0;
        if (n <= 0) return;
        if (!Number.isFinite(stats.overall.mean) || !Number.isFinite(stats.overall.stdDev)) return;
        const w = n / totalWeight;
        // Within-run variance contribution
        pooledVariance += w * (stats.overall.stdDev * stats.overall.stdDev);
        // Between-run mean deviation contribution
        pooledVariance += w * Math.pow(stats.overall.mean - pooledMean, 2);
      });
      pooledStdDev = Math.sqrt(pooledVariance);
    }

    aggregatedPerModel[modelId] = {
      sampleSize: totalModelSamples,
      values: aggregatedValues,
      overall: {
        mean: pooledMean,
        stdDev: pooledStdDev,
        min: overallMin === Infinity ? 0 : overallMin,
        max: overallMax === -Infinity ? 0 : overallMax,
      },
    };
  });

  const mergedVizData: AggregatedResult['visualizationData'] = {
    decisionDistribution: {},
    modelScenarioMatrix: {},
    scenarioDimensions: {},
  };

  const decisionCountsByModel: Record<string, Record<CanonicalDecisionBucket, number>> = {};
  const decisionsByScenario: Record<string, Record<string, number[]>> = {};

  modelIds.forEach((modelId) => {
    decisionCountsByModel[modelId] = createEmptyDecisionBucketCounts();
  });

  transcripts.forEach((rawTranscript) => {
    const transcript = rawTranscript as DecisionAwareAggregateTranscript;
    if (
      transcript.modelId == null ||
      transcript.modelId === '' ||
      transcript.scenarioId == null ||
      transcript.scenarioId === ''
    ) {
      return;
    }
    const resolved = resolveTranscriptDecisionModel({
      decisionMetadata: transcript.decisionMetadata,
      definitionSnapshot: transcript.definitionSnapshot,
      orientationFlipped: transcript.scenario?.orientationFlipped ?? null,
    });

    let code: CanonicalDecisionBucket | null = null;
    if (resolved.canonical.direction === 'neutral') {
      code = 'neutral';
    } else if (resolved.canonical.direction === 'favor_first' && resolved.canonical.strength === 'strong') {
      code = 'strongly';
    } else if (resolved.canonical.direction === 'favor_first' && resolved.canonical.strength === 'lean') {
      code = 'somewhat';
    } else if (resolved.canonical.direction === 'favor_second' && resolved.canonical.strength === 'lean') {
      code = 'opponentSomewhat';
    } else if (resolved.canonical.direction === 'favor_second' && resolved.canonical.strength === 'strong') {
      code = 'opponentStrongly';
    }
    if (code === null) return;
    const counts = decisionCountsByModel[transcript.modelId];
    if (counts) {
      counts[code] += 1;
    }

    const modelScenarioDecisions = decisionsByScenario[transcript.modelId] ??= {};
    const scenarioDecisions = modelScenarioDecisions[transcript.scenarioId] ??= [];
    scenarioDecisions.push(bucketCodeToSignedValue(code));
  });

  modelIds.forEach((modelId) => {
    const dist = decisionCountsByModel[modelId] ?? {
      opponentStrongly: 0,
      opponentSomewhat: 0,
      neutral: 0,
      somewhat: 0,
      strongly: 0,
    };
    const scenarioDecisions = decisionsByScenario[modelId];

    mergedVizData.decisionDistribution[modelId] = dist;

    const scenarioMeans: Record<string, number> = {};
    if (scenarioDecisions) {
      Object.entries(scenarioDecisions).forEach(([scenarioId, decisions]) => {
        if (decisions.length === 0) return;
        const sum = decisions.reduce((a, b) => a + b, 0);
        scenarioMeans[scenarioId] = sum / decisions.length;
      });
    }
    mergedVizData.modelScenarioMatrix[modelId] = scenarioMeans;
  });

  const scenarioMap = new Map<string, { varianceSum: number; count: number; scenario: ContestedScenario }>();
  analyses.forEach((analysis) => {
    analysis.mostContestedScenarios?.forEach((scenario) => {
      const existing = scenarioMap.get(scenario.scenarioId) || { varianceSum: 0, count: 0, scenario };
      existing.varianceSum += scenario.variance;
      existing.count += 1;
      scenarioMap.set(scenario.scenarioId, existing);
    });
  });

  const mergedContested = Array.from(scenarioMap.values())
    .map((value) => ({
      ...value.scenario,
      variance: value.varianceSum / value.count,
    }))
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 20);

  const dimensionsMap: Record<string, Record<string, number | string>> = {};
  scenarios.forEach((scenario) => {
    const normalized = normalizeScenarioAnalysisMetadata(scenario.content);
    if (normalized) {
      dimensionsMap[scenario.id] = normalized.groupingDimensions;
    }
  });
  mergedVizData.scenarioDimensions = dimensionsMap;

  const varianceAnalysis = computeVarianceAnalysis(transcripts, scenarios);
  const normalizedArtifacts = normalizeAnalysisArtifacts({
    visualizationData: mergedVizData,
    varianceAnalysis,
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      content: scenario.content,
    })),
  });

  const normalizedVisualizationData = isAggregatedVisualizationData(normalizedArtifacts.visualizationData)
    ? normalizedArtifacts.visualizationData
    : mergedVizData;
  const normalizedVarianceAnalysis = isRunVarianceAnalysis(normalizedArtifacts.varianceAnalysis)
    ? normalizedArtifacts.varianceAnalysis
    : varianceAnalysis;

  return {
    perModel: aggregatedPerModel,
    modelAgreement: template.modelAgreement,
    visualizationData: normalizedVisualizationData,
    mostContestedScenarios: mergedContested,
    varianceAnalysis: normalizedVarianceAnalysis,
    decisionStats: decisionStats as Record<string, DecisionStats>,
    valueAggregateStats,
  };
}
