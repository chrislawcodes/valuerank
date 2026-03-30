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

type DecisionBucketKey =
  | 'opponentStrongly'
  | 'opponentSomewhat'
  | 'neutral'
  | 'somewhat'
  | 'strongly';

function labelToBucketValue(label: string): number | null {
  if (label === '1' || label === 'opponentStrongly') return 1;
  if (label === '2' || label === 'opponentSomewhat') return 2;
  if (label === '3' || label === 'neutral') return 3;
  if (label === '4' || label === 'somewhat') return 4;
  if (label === '5' || label === 'strongly') return 5;
  return null;
}

function bucketValueToLabel(value: number): DecisionBucketKey {
  if (value <= 1) return 'opponentStrongly';
  if (value === 2) return 'opponentSomewhat';
  if (value === 3) return 'neutral';
  if (value === 4) return 'somewhat';
  return 'strongly';
}

function resolveBucketValue(transcript: DecisionAwareAggregateTranscript): number | null {
  const resolved = resolveTranscriptDecisionModel({
    decisionCode: transcript.decisionCode,
    decisionMetadata: transcript.decisionMetadata,
    definitionSnapshot: transcript.definitionSnapshot,
    orientationFlipped: transcript.scenario?.orientationFlipped ?? null,
  });

  if (resolved.canonical.direction === 'neutral') {
    return 3;
  }

  if (resolved.canonical.direction === 'favor_first') {
    return resolved.canonical.strength === 'strong' ? 5 : resolved.canonical.strength === 'lean' ? 4 : null;
  }

  if (resolved.canonical.direction === 'favor_second') {
    return resolved.canonical.strength === 'strong' ? 1 : resolved.canonical.strength === 'lean' ? 2 : null;
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

      const runTotal = Object.values(dist).reduce((sum, count) => sum + count, 0);
      if (runTotal <= 0) return;

      Object.entries(dist).forEach(([option, count]) => {
        const opt = labelToBucketValue(option);
        if (opt !== null) {
          modelDecisions[opt]!.push(count / runTotal);
        }
      });

      [1, 2, 3, 4, 5].forEach((opt) => {
        if (dist[String(opt)] === undefined) {
          modelDecisions[opt]!.push(0);
        }
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

  const decisionsByScenario: Record<string, Record<string, number[]>> = {};

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

    if (decisionsByScenario[transcript.modelId]?.[transcript.scenarioId]) {
      decisionsByScenario[transcript.modelId]![transcript.scenarioId]!.push(code);
    } else if (decisionsByScenario[transcript.modelId]) {
      decisionsByScenario[transcript.modelId]![transcript.scenarioId] = [code];
    } else {
      decisionsByScenario[transcript.modelId] = { [transcript.scenarioId]: [code] };
    }
  });

  modelIds.forEach((modelId) => {
    const dist: Record<DecisionBucketKey, number> = {
      opponentStrongly: 0,
      opponentSomewhat: 0,
      neutral: 0,
      somewhat: 0,
      strongly: 0,
    };
    const scenarioDecisions = decisionsByScenario[modelId];

    if (scenarioDecisions) {
      Object.values(scenarioDecisions).forEach((decisions) => {
        if (decisions.length === 0) return;
        const sum = decisions.reduce((a, b) => a + b, 0);
        const mean = sum / decisions.length;
        const rounded = Math.round(mean);
        const clamped = Math.max(1, Math.min(5, rounded));
        const bucket = bucketValueToLabel(clamped);
        dist[bucket] += 1;
      });
    }

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
