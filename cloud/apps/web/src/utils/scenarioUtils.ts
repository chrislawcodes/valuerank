import type { VisualizationData } from '../api/operations/analysis';
import type { Transcript } from '../api/operations/runs';

export function normalizeScenarioId(value: string): string {
  return value.toLowerCase().replace(/^.*[/:]/, '').replace(/^scenario-/, '');
}

export function normalizeModelId(value: string): string {
  return value.toLowerCase().replace(/^.*:/, '');
}

export type ScenarioDimensionValues = Record<string, string | number>;

export function buildNormalizedScenarioDimensionsMap(
  scenarioDimensions?: VisualizationData['scenarioDimensions']
): Map<string, ScenarioDimensionValues> {
  const normalizedMap = new Map<string, ScenarioDimensionValues>();
  if (!scenarioDimensions) return normalizedMap;

  for (const [scenarioId, dims] of Object.entries(scenarioDimensions)) {
    normalizedMap.set(normalizeScenarioId(scenarioId), dims);
  }
  return normalizedMap;
}

export function getScenarioDimensionsForId(
  scenarioId: string | null,
  scenarioDimensions?: VisualizationData['scenarioDimensions'],
  normalizedScenarioDimensions?: Map<string, ScenarioDimensionValues>
): ScenarioDimensionValues | null {
  if (!scenarioId || !scenarioDimensions) return null;

  const normalizedMap = normalizedScenarioDimensions
    ?? buildNormalizedScenarioDimensionsMap(scenarioDimensions);

  return scenarioDimensions[scenarioId] ?? normalizedMap.get(normalizeScenarioId(scenarioId)) ?? null;
}

type FilterTranscriptsForPivotCellInput = {
  transcripts: Transcript[];
  scenarioDimensions?: VisualizationData['scenarioDimensions'];
  rowDim: string;
  colDim: string;
  row: string;
  col: string;
  selectedModel?: string;
};

export function filterTranscriptsForPivotCell({
  transcripts,
  scenarioDimensions,
  rowDim,
  colDim,
  row,
  col,
  selectedModel = '',
}: FilterTranscriptsForPivotCellInput): Transcript[] {
  if (!transcripts.length || !scenarioDimensions || !rowDim || !colDim || !row || !col) {
    return [];
  }

  const scenarioIds = new Set<string>();
  const normalizedScenarioIds = new Set<string>();
  for (const [scenarioId, dims] of Object.entries(scenarioDimensions)) {
    const rowValue = String(dims[rowDim] ?? 'N/A');
    const colValue = String(dims[colDim] ?? 'N/A');
    if (rowValue === row && colValue === col) {
      scenarioIds.add(String(scenarioId));
      normalizedScenarioIds.add(normalizeScenarioId(String(scenarioId)));
    }
  }

  const selectedModelNormalized = selectedModel ? normalizeModelId(selectedModel) : '';

  return transcripts.filter((transcript) => {
    if (!transcript.scenarioId) return false;

    const transcriptScenarioId = String(transcript.scenarioId);
    const transcriptScenarioNormalized = normalizeScenarioId(transcriptScenarioId);
    if (
      !scenarioIds.has(transcriptScenarioId)
      && !normalizedScenarioIds.has(transcriptScenarioNormalized)
    ) {
      return false;
    }

    if (!selectedModel) return true;
    if (transcript.modelId === selectedModel) return true;

    const transcriptModelNormalized = normalizeModelId(transcript.modelId);
    if (transcriptModelNormalized === selectedModelNormalized) return true;

    return transcript.modelId.includes(selectedModel) || selectedModel.includes(transcript.modelId);
  });
}
