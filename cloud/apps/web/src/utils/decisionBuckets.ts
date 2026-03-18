import type { VisualizationData } from '../api/operations/analysis';

export type DecisionBucket = 'a' | 'neutral' | 'b';

export type DecisionBucketCounts = {
  a: number;
  neutral: number;
  b: number;
  total: number;
};

function classifyRoundedDecision(rounded: number): DecisionBucket | null {
  if (rounded <= 2) return 'a';
  if (rounded >= 4) return 'b';
  if (rounded === 3) return 'neutral';
  return null;
}

function groupScenarioIdsByConditionCell(
  scenarioDimensions: VisualizationData['scenarioDimensions'] | null | undefined,
  rowDim: string,
  colDim: string,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  if (!scenarioDimensions || !rowDim || !colDim) {
    return grouped;
  }

  Object.entries(scenarioDimensions).forEach(([scenarioId, dims]) => {
    const rowValue = String(dims[rowDim] ?? 'N/A');
    const colValue = String(dims[colDim] ?? 'N/A');
    const key = `${rowValue}||${colValue}`;
    const current = grouped.get(key);
    if (current) {
      current.push(scenarioId);
    } else {
      grouped.set(key, [scenarioId]);
    }
  });

  return grouped;
}

export function collectDecisionBucketCounts(
  scenarioDimensions: VisualizationData['scenarioDimensions'] | null | undefined,
  modelScenarioMatrix: VisualizationData['modelScenarioMatrix'] | null | undefined,
  modelId: string,
  rowDim: string,
  colDim: string,
): DecisionBucketCounts | null {
  if (!scenarioDimensions || !modelScenarioMatrix || !rowDim || !colDim) {
    return null;
  }

  const modelScores = modelScenarioMatrix[modelId];
  if (!modelScores) {
    return null;
  }

  const grouped = groupScenarioIdsByConditionCell(scenarioDimensions, rowDim, colDim);
  const counts: DecisionBucketCounts = { a: 0, neutral: 0, b: 0, total: 0 };

  grouped.forEach((scenarioIds) => {
    let sum = 0;
    let count = 0;
    scenarioIds.forEach((scenarioId) => {
      const score = modelScores[scenarioId];
      if (typeof score === 'number' && Number.isFinite(score)) {
        sum += score;
        count += 1;
      }
    });
    if (count === 0) return;

    const bucket = classifyRoundedDecision(Math.round(sum / count));
    if (!bucket) return;

    counts.total += 1;
    counts[bucket] += 1;
  });

  return counts.total > 0 ? counts : null;
}

export function collectScenarioIdsForDecisionBucket(
  scenarioDimensions: VisualizationData['scenarioDimensions'] | null | undefined,
  modelScenarioMatrix: VisualizationData['modelScenarioMatrix'] | null | undefined,
  modelId: string,
  decisionBucket: DecisionBucket,
  rowDim: string,
  colDim: string,
): Set<string> {
  const matchingScenarioIds = new Set<string>();
  if (!scenarioDimensions || !modelScenarioMatrix || !rowDim || !colDim) {
    return matchingScenarioIds;
  }

  const modelScores = modelScenarioMatrix[modelId];
  if (!modelScores) {
    return matchingScenarioIds;
  }

  const grouped = groupScenarioIdsByConditionCell(scenarioDimensions, rowDim, colDim);
  grouped.forEach((scenarioIds) => {
    let sum = 0;
    let count = 0;
    scenarioIds.forEach((scenarioId) => {
      const score = modelScores[scenarioId];
      if (typeof score === 'number' && Number.isFinite(score)) {
        sum += score;
        count += 1;
      }
    });
    if (count === 0) return;

    const bucket = classifyRoundedDecision(Math.round(sum / count));
    if (bucket !== decisionBucket) return;

    scenarioIds.forEach((scenarioId) => matchingScenarioIds.add(scenarioId));
  });

  return matchingScenarioIds;
}
