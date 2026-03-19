import type { VisualizationData } from '../api/operations/analysis';

export function computeAttributeSensitivity(
  visualizationData: VisualizationData | null | undefined,
  modelId: string,
  attribute: string,
  side: 'low' | 'high',
  scenarioIds?: string[],
): number | null {
  const scenarioDimensions = visualizationData?.scenarioDimensions;
  const modelScenarioMatrix = visualizationData?.modelScenarioMatrix;
  if (!scenarioDimensions || !modelScenarioMatrix) return null;

  const byScenario = modelScenarioMatrix[modelId];
  if (!byScenario) return null;

  const allowedScenarioIds = scenarioIds ? new Set(scenarioIds) : null;
  const fallbackOrder = new Map<string, number>();
  let nextFallbackIndex = 1;
  const pairs: Array<{ x: number; y: number }> = [];

  Object.entries(scenarioDimensions).forEach(([scenarioId, dimensions]) => {
    if (allowedScenarioIds && !allowedScenarioIds.has(scenarioId)) {
      return;
    }

    const xRaw = dimensions[attribute];
    const yRaw = byScenario[scenarioId];
    const parsedX = typeof xRaw === 'number' ? xRaw : Number.parseFloat(String(xRaw));
    let x = parsedX;
    if (!Number.isFinite(x)) {
      const fallbackKey = String(xRaw ?? 'N/A');
      if (!fallbackOrder.has(fallbackKey)) {
        fallbackOrder.set(fallbackKey, nextFallbackIndex);
        nextFallbackIndex += 1;
      }
      x = fallbackOrder.get(fallbackKey) ?? Number.NaN;
    }

    if (!Number.isFinite(x) || typeof yRaw !== 'number' || !Number.isFinite(yRaw)) {
      return;
    }

    pairs.push({ x, y: yRaw });
  });

  if (pairs.length < 2) return null;

  const meanX = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length;
  const meanY = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length;
  let numerator = 0;
  let denominator = 0;

  pairs.forEach(({ x, y }) => {
    const centeredX = x - meanX;
    numerator += centeredX * (y - meanY);
    denominator += centeredX * centeredX;
  });

  if (denominator === 0) return null;

  const rawSlope = numerator / denominator;
  return side === 'low' ? -rawSlope : rawSlope;
}
