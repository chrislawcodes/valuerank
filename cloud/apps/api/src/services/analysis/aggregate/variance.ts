import type {
  AggregateScenarioInput,
  AggregateTranscriptInput,
  ModelVarianceStats,
  RunVarianceAnalysis,
  ScenarioVarianceStats,
  VarianceStats,
} from './contracts.js';

function computeVarianceStats(scores: number[]): VarianceStats {
  if (scores.length === 0) {
    return {
      sampleCount: 0,
      mean: 0,
      stdDev: 0,
      variance: 0,
      min: 0,
      max: 0,
      range: 0,
    };
  }

  const n = scores.length;
  const sum = scores.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  let variance = 0;
  if (n > 1) {
    const sumSqDiff = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
    variance = sumSqDiff / (n - 1);
  }

  const stdDev = Math.sqrt(variance);
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  return {
    sampleCount: n,
    mean: parseFloat(mean.toFixed(6)),
    stdDev: parseFloat(stdDev.toFixed(6)),
    variance: parseFloat(variance.toFixed(6)),
    min: parseFloat(min.toFixed(6)),
    max: parseFloat(max.toFixed(6)),
    range: parseFloat((max - min).toFixed(6)),
  };
}

function computeConsistencyScore(variances: number[], maxPossibleVariance = 4.0): number {
  if (variances.length === 0) return 1.0;
  const sum = variances.reduce((a, b) => a + b, 0);
  const avgVariance = sum / variances.length;
  const score = 1.0 - (avgVariance / maxPossibleVariance);
  return parseFloat(Math.max(0.0, Math.min(1.0, score)).toFixed(6));
}

function computeMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const arr = [...sorted].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0
    ? (arr[mid - 1]! + arr[mid]!) / 2
    : arr[mid]!;
}

function computeIQR(values: number[]): number {
  if (values.length < 2) return 0;
  const arr = [...values].sort((a, b) => a - b);
  const n = arr.length;
  const q1 = arr[Math.floor(n * 0.25)]!;
  const q3 = arr[Math.floor(n * 0.75)]!;
  return q3 - q1;
}

export function computeVarianceAnalysis(
  transcripts: AggregateTranscriptInput[],
  scenarios: AggregateScenarioInput[]
): RunVarianceAnalysis {
  const scenarioNames = new Map<string, string>();
  scenarios.forEach((scenario) => {
    const content = scenario.content as Record<string, unknown>;
    const name = typeof content.name === 'string' ? content.name : scenario.id;
    scenarioNames.set(scenario.id, name);
  });

  const grouped = new Map<string, number[]>();
  const correctedScenarioIds = new Set<string>();

  transcripts.forEach((transcript) => {
    if (
      transcript.scenarioId == null ||
      transcript.scenarioId === '' ||
      transcript.decisionCode == null ||
      transcript.decisionCode === '' ||
      transcript.modelId == null ||
      transcript.modelId === ''
    ) {
      return;
    }

    const rawScore = parseFloat(transcript.decisionCode);
    if (isNaN(rawScore)) return;

    const orientationFlipped = transcript.scenario?.orientationFlipped ?? false;
    const score = orientationFlipped ? 6 - rawScore : rawScore;
    if (orientationFlipped) {
      correctedScenarioIds.add(transcript.scenarioId);
    }

    const key = `${transcript.scenarioId}||${transcript.modelId}`;
    const current = grouped.get(key) || [];
    current.push(score);
    grouped.set(key, current);
  });

  let maxSamples = 1;
  if (grouped.size > 0) {
    maxSamples = Math.max(...Array.from(grouped.values()).map((scores) => scores.length));
  }
  const isMultiSample = maxSamples > 1;

  const perModel: Record<string, ModelVarianceStats> = {};
  const modelScenarioScores = new Map<string, Map<string, number[]>>();

  grouped.forEach((scores, key) => {
    const [scenarioId, modelId] = key.split('||');
    if (modelId === undefined || modelId === '' || scenarioId === undefined || scenarioId === '') return;

    let modelMap = modelScenarioScores.get(modelId);
    if (!modelMap) {
      modelMap = new Map<string, number[]>();
      modelScenarioScores.set(modelId, modelMap);
    }
    modelMap.set(scenarioId, scores);
  });

  modelScenarioScores.forEach((scenarioMap, modelId) => {
    const perScenario: Record<string, VarianceStats> = {};
    const variances: number[] = [];
    let totalSamples = 0;

    scenarioMap.forEach((scores, scenarioId) => {
      const stats = computeVarianceStats(scores);

      if (scores.length > 0) {
        const signed = scores.map((score) => score - 3);
        const medianSd = computeMedian(signed);

        const direction: 'A' | 'B' | 'NEUTRAL' =
          medianSd > 0 ? 'A' : medianSd < 0 ? 'B' : 'NEUTRAL';

        const sameCount = signed.filter((score) =>
          direction === 'A' ? score > 0 :
            direction === 'B' ? score < 0 :
              score === 0
        ).length;

        const n = scores.length;
        const neutralCount = scores.filter((score) => score === 3).length;

        const scoreCounts: Record<string, number> = {};
        for (const scoreValue of [1, 2, 3, 4, 5]) {
          scoreCounts[String(scoreValue)] = scores.filter((score) => score === scoreValue).length;
        }

        const iqrVal = n >= 2 ? computeIQR(signed) : undefined;

        Object.assign(stats, {
          scoreCounts,
          direction,
          directionalAgreement: parseFloat((sameCount / n).toFixed(6)),
          medianSignedDistance: parseFloat(medianSd.toFixed(6)),
          iqr: iqrVal !== undefined ? parseFloat(iqrVal.toFixed(6)) : undefined,
          neutralShare: parseFloat((neutralCount / n).toFixed(6)),
          orientationCorrected: correctedScenarioIds.has(scenarioId),
        });
      }

      perScenario[scenarioId] = stats;

      if (stats.sampleCount > 1) {
        variances.push(stats.variance);
      }
      totalSamples += stats.sampleCount;
    });

    const avgVariance = variances.length > 0
      ? variances.reduce((a, b) => a + b, 0) / variances.length
      : 0;

    const maxVariance = variances.length > 0
      ? Math.max(...variances)
      : 0;

    perModel[modelId] = {
      totalSamples,
      uniqueScenarios: scenarioMap.size,
      samplesPerScenario: maxSamples,
      avgWithinScenarioVariance: parseFloat(avgVariance.toFixed(6)),
      maxWithinScenarioVariance: parseFloat(maxVariance.toFixed(6)),
      consistencyScore: computeConsistencyScore(variances),
      perScenario,
    };
  });

  const allScenarioVariances: ScenarioVarianceStats[] = [];
  grouped.forEach((scores, key) => {
    const [scenarioId, modelId] = key.split('||');
    if (typeof modelId !== 'string' || typeof scenarioId !== 'string') return;

    if (scores.length > 1) {
      const stats = computeVarianceStats(scores);
      allScenarioVariances.push({
        scenarioId,
        scenarioName: scenarioNames.get(scenarioId) ?? scenarioId,
        modelId,
        variance: stats.variance,
        stdDev: stats.stdDev,
        range: stats.range,
        sampleCount: stats.sampleCount,
        mean: stats.mean,
      });
    }
  });

  allScenarioVariances.sort((a, b) => b.variance - a.variance);
  const mostVariable = allScenarioVariances.slice(0, 5);
  const leastVariable = allScenarioVariances.slice(-5).reverse();

  return {
    isMultiSample,
    samplesPerScenario: maxSamples,
    perModel,
    mostVariableScenarios: mostVariable,
    leastVariableScenarios: leastVariable,
    orientationCorrectedCount: correctedScenarioIds.size,
  };
}
