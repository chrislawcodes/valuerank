import { normalizeAnalysisArtifacts } from '../normalize-analysis-output.js';
import { normalizeScenarioAnalysisMetadata } from '../scenario-metadata.js';
import {
  type AggregatedResult,
  type AggregateScenarioInput,
  type AggregateTranscriptInput,
  type AnalysisOutput,
  type ContestedScenario,
  type DecisionStats,
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

type DecisionBucketCode =
  | 'opponentStrongly'
  | 'opponentSomewhat'
  | 'neutral'
  | 'somewhat'
  | 'strongly';

const DECISION_BUCKET_ORDER: readonly DecisionBucketCode[] = [
  'opponentStrongly',
  'opponentSomewhat',
  'neutral',
  'somewhat',
  'strongly',
] as const;

function normalizeDecisionBucketCode(rawCode: string): DecisionBucketCode | null {
  const normalized = rawCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  if (normalized === '1' || normalized === 'opponentstrongly' || normalized === 'stronglyopponent') return 'opponentStrongly';
  if (normalized === '2' || normalized === 'opponentsomewhat' || normalized === 'somewhatopponent') return 'opponentSomewhat';
  if (normalized === '3' || normalized === 'neutral' || normalized === 'middle') return 'neutral';
  if (normalized === '4' || normalized === 'somewhat' || normalized === 'somewhatthis') return 'somewhat';
  if (normalized === '5' || normalized === 'strongly' || normalized === 'stronglythis') return 'strongly';
  if (normalized === 'stronglysupporttheothervalue' || normalized === 'stronglysupportothervalue') return 'opponentStrongly';
  if (normalized === 'somewhatsupporttheothervalue' || normalized === 'somewhatsupportothervalue') return 'opponentSomewhat';
  if (normalized === 'somewhatsupportthisvalue' || normalized === 'somewhatsupportthevalue') return 'somewhat';
  if (normalized === 'stronglysupportthisvalue' || normalized === 'stronglysupportthevalue') return 'strongly';

  return null;
}

function decisionBucketCodeToScore(code: DecisionBucketCode): 1 | 2 | 3 | 4 | 5 {
  if (code === 'opponentStrongly') return 1;
  if (code === 'opponentSomewhat') return 2;
  if (code === 'neutral') return 3;
  if (code === 'somewhat') return 4;
  return 5;
}

function resolveBucketValue(transcript: DecisionAwareAggregateTranscript): DecisionBucketCode | null {
  const resolved = resolveTranscriptDecisionModel({
    decisionCode: transcript.decisionCode,
    decisionMetadata: transcript.decisionMetadata,
    definitionSnapshot: transcript.definitionSnapshot,
    orientationFlipped: transcript.scenario?.orientationFlipped ?? null,
  });

  if (resolved.canonical.direction === 'neutral') {
    return 'neutral';
  }

  if (resolved.canonical.direction === 'favor_first') {
    return resolved.canonical.strength === 'strong' ? 'strongly' : resolved.canonical.strength === 'lean' ? 'somewhat' : null;
  }

  if (resolved.canonical.direction === 'favor_second') {
    return resolved.canonical.strength === 'strong' ? 'opponentStrongly' : resolved.canonical.strength === 'lean' ? 'opponentSomewhat' : null;
  }

  return null;
}

export function aggregateAnalysesLogic(
  analyses: AnalysisOutput[],
  transcripts: AggregateTranscriptInput[],
  scenarios: AggregateScenarioInput[]
): AggregatedResult {
  if (analyses.length === 0) {
    throw new Error('Cannot aggregate empty analyses list');
  }

  const template = analyses[0]!;
  const modelIds = Array.from(new Set(analyses.flatMap((analysis) => Object.keys(analysis.perModel))));
  const aggregatedPerModel: Record<string, ModelStats> = {};
  const decisionStats: Record<string, DecisionStats> = {};
  const valueAggregateStats: Record<string, ValueAggregateStats> = {};

  modelIds.forEach((modelId) => {
    const validAnalyses = analyses.filter((analysis) => Boolean(analysis.perModel[modelId]));
    if (validAnalyses.length === 0) return;

    const totalModelSamples = validAnalyses.reduce((sum, analysis) => {
      const stats = analysis.perModel[modelId];
      if (!stats) return sum;
      return sum + (stats.sampleSize ?? 0);
    }, 0);

    const modelDecisions: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

    validAnalyses.forEach((analysis) => {
      const dist = analysis.visualizationData?.decisionDistribution?.[modelId];
      if (!dist) return;

      const normalizedDist: Record<DecisionBucketCode, number> = {
        opponentStrongly: 0,
        opponentSomewhat: 0,
        neutral: 0,
        somewhat: 0,
        strongly: 0,
      };

      Object.entries(dist).forEach(([option, count]) => {
        const bucket = normalizeDecisionBucketCode(option);
        if (bucket !== null && typeof count === 'number' && Number.isFinite(count)) {
          normalizedDist[bucket] += count;
        }
      });

      const runTotal = Object.values(normalizedDist).reduce((sum, count) => sum + count, 0);
      if (runTotal <= 0) return;

      DECISION_BUCKET_ORDER.forEach((code) => {
        modelDecisions[decisionBucketCodeToScore(code)]!.push(normalizedDist[code] / runTotal);
      });
    });

    decisionStats[modelId] = { options: {} };
    [1, 2, 3, 4, 5].forEach((opt) => {
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
      winRate: number;
      confidenceInterval: { lower: number; upper: number; level: number; method: string };
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
            confidenceInterval: { lower: 0, upper: 0, level: 0.95, method: 'aggregate' },
          };
          modelValueRates[valueId] = [];
        }

        const target = aggregatedValues[valueId];
        target.count.prioritized += valueStats.count.prioritized;
        target.count.deprioritized += valueStats.count.deprioritized;
        target.count.neutral += valueStats.count.neutral;
        modelValueRates[valueId]!.push(valueStats.winRate);
      });
    });

    valueAggregateStats[modelId] = { values: {} };
    Object.keys(aggregatedValues).forEach((valueId) => {
      const target = aggregatedValues[valueId];
      if (!target) return;

      const totalWins = target.count.prioritized;
      const totalBattles = target.count.prioritized + target.count.deprioritized;
      target.winRate = totalBattles > 0 ? totalWins / totalBattles : 0;

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

      target.confidenceInterval = {
        lower: Math.max(0, mean - (1.96 * sem)),
        upper: Math.min(1, mean + (1.96 * sem)),
        level: 0.95,
        method: 'aggregate-sem',
      };
    });

    aggregatedPerModel[modelId] = {
      sampleSize: totalModelSamples,
      values: aggregatedValues,
      overall: { mean: 0, stdDev: 0, min: 0, max: 0 },
    };
  });

  const mergedVizData: AggregatedResult['visualizationData'] = {
    decisionDistribution: {},
    modelScenarioMatrix: {},
    scenarioDimensions: {},
  };

  const decisionCountsByModel: Record<string, Record<DecisionBucketCode, number>> = {};
  const decisionsByScenario: Record<string, Record<string, number[]>> = {};

  modelIds.forEach((modelId) => {
    decisionCountsByModel[modelId] = {
      opponentStrongly: 0,
      opponentSomewhat: 0,
      neutral: 0,
      somewhat: 0,
      strongly: 0,
    };
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
    const code = resolveBucketValue(transcript);
    if (code === null) return;
    const counts = decisionCountsByModel[transcript.modelId];
    if (counts) {
      counts[code] += 1;
    }

    if (decisionsByScenario[transcript.modelId]?.[transcript.scenarioId]) {
      decisionsByScenario[transcript.modelId]![transcript.scenarioId]!.push(decisionBucketCodeToScore(code));
    } else if (decisionsByScenario[transcript.modelId]) {
      decisionsByScenario[transcript.modelId]![transcript.scenarioId] = [decisionBucketCodeToScore(code)];
    } else {
      decisionsByScenario[transcript.modelId] = { [transcript.scenarioId]: [decisionBucketCodeToScore(code)] };
    }
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
    decisionStats,
    valueAggregateStats,
  };
}
