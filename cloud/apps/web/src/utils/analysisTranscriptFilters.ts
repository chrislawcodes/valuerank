/**
 * Pure transcript filtering functions for the AnalysisTranscripts page.
 * All functions here are stateless and depend only on their arguments.
 */

import { filterTranscriptsForPivotCell } from './scenarioUtils';
import { collectScenarioIdsForDecisionBucket } from './decisionBuckets';
import { deriveScenarioAttributesFromDefinition } from './decisionLabels';
import { filterTranscriptsForConditionIds, type PairedConditionSource } from './analysisTranscriptParams';
import type { Transcript } from '../api/operations/runs';
import type { VisualizationData } from '../api/operations/analysis';

type ScenarioDimensions = VisualizationData['scenarioDimensions'] | null;
type ModelScenarioMatrix = VisualizationData['modelScenarioMatrix'] | null | undefined;
type RunWithTranscripts = {
  transcripts?: Transcript[] | null;
} | null | undefined;



export function computeFilteredTranscripts(args: {
  run: RunWithTranscripts;
  companionRun: RunWithTranscripts;
  definitionContent: unknown;
  companionDefinitionContent: unknown;
  scenarioDimensions: ScenarioDimensions;
  companionScenarioDimensions: ScenarioDimensions;
  modelScenarioMatrix: ModelScenarioMatrix;
  companionModelScenarioMatrix: ModelScenarioMatrix;
  selectedModel: string;
  selectedTranscriptId: string;
  conditionIds: string[];
  activeRowDim: string;
  activeColDim: string;
  row: string;
  col: string;
  decisionBucket: string;
  pairedValueKey: string;
  pairedDecisionBucketParam: string;
  pairedConditionSource: PairedConditionSource | null;
  normalizedFavoredValueKey: string | undefined;
  normalizedDecisionStrength: 'strong' | 'lean' | 'neutral' | 'unknown' | undefined;
  hasDirectTranscriptParam: boolean;
  hasRepeatPatternParams: boolean;
  hasPairedConditionFilterParams: boolean;
  hasPairedValueFilterParams: boolean;
  hasBucketFilterParams: boolean;
  resolveDecisionBucketForValue: (
    content: unknown,
    rowDimension: string,
    colDimension: string,
    targetValueKey: string,
  ) => 'a' | 'b' | null;
}): Transcript[] {
  const {
    run, companionRun, definitionContent, companionDefinitionContent,
    scenarioDimensions, companionScenarioDimensions, modelScenarioMatrix, companionModelScenarioMatrix,
    selectedModel, selectedTranscriptId, conditionIds,
    activeRowDim, activeColDim, row, col, decisionBucket,
    pairedValueKey, pairedDecisionBucketParam, pairedConditionSource,
    normalizedFavoredValueKey, normalizedDecisionStrength,
    hasDirectTranscriptParam, hasRepeatPatternParams,
    hasPairedConditionFilterParams, hasPairedValueFilterParams, hasBucketFilterParams,
    resolveDecisionBucketForValue,
  } = args;

  if (hasDirectTranscriptParam) {
    const matched = (run?.transcripts ?? []).find((t) => t.id === selectedTranscriptId);
    return matched ? [matched] : [];
  }

  if (hasRepeatPatternParams) {
    return filterTranscriptsForConditionIds(
      run?.transcripts ?? [],
      selectedModel,
      conditionIds,
      scenarioDimensions,
      activeRowDim,
      activeColDim,
    );
  }

  if (hasPairedConditionFilterParams) {
    const runEntries = [
      { run, source: 'current' as const, scenarioDims: scenarioDimensions },
      { run: companionRun, source: 'companion' as const, scenarioDims: companionScenarioDimensions },
    ];

    return runEntries.flatMap((entry) => {
      if (!entry.run) return [];
      if (pairedConditionSource === 'current' && entry.source !== 'current') return [];
      if (pairedConditionSource === 'companion' && entry.source !== 'companion') return [];
      return filterTranscriptsForPivotCell({
        transcripts: entry.run.transcripts ?? [],
        scenarioDimensions: entry.scenarioDims ?? undefined,
        rowDim: activeRowDim,
        colDim: activeColDim,
        row,
        col,
        selectedModel,
        favoredValueKey: normalizedFavoredValueKey,
        decisionStrength: normalizedDecisionStrength,
      });
    });
  }

  if (hasPairedValueFilterParams) {
    const runEntries = [
      { run, content: definitionContent, scenarioDims: scenarioDimensions, modelMatrix: modelScenarioMatrix },
      { run: companionRun, content: companionDefinitionContent, scenarioDims: companionScenarioDimensions, modelMatrix: companionModelScenarioMatrix },
    ];

    return runEntries.flatMap((entry) => {
      const transcripts = entry.run?.transcripts ?? [];
      const attributes = deriveScenarioAttributesFromDefinition(entry.content);
      const rowDimension = attributes[0] ?? '';
      const colDimension = attributes[1] ?? attributes[0] ?? '';
      const bucket = pairedDecisionBucketParam === 'a' || pairedDecisionBucketParam === 'neutral' || pairedDecisionBucketParam === 'b'
        ? pairedDecisionBucketParam
        : resolveDecisionBucketForValue(entry.content, rowDimension, colDimension, pairedValueKey);
      if (!bucket) return [];

      const matchingScenarioIds = collectScenarioIdsForDecisionBucket(
        entry.scenarioDims ?? undefined,
        entry.modelMatrix ?? undefined,
        selectedModel,
        bucket,
        rowDimension,
        colDimension,
      );

      return transcripts.filter((t) => (
        t.modelId === selectedModel
        && t.scenarioId !== null
        && matchingScenarioIds.has(t.scenarioId)
      ));
    });
  }

  if (hasBucketFilterParams) {
    const transcripts = run?.transcripts ?? [];
    if (!scenarioDimensions || !modelScenarioMatrix) return [];
    const matchingScenarioIds = collectScenarioIdsForDecisionBucket(
      scenarioDimensions,
      modelScenarioMatrix,
      selectedModel,
      decisionBucket as 'a' | 'neutral' | 'b',
      activeRowDim,
      activeColDim,
    );
    return transcripts.filter((t) => (
      t.modelId === selectedModel
      && t.scenarioId !== null
      && matchingScenarioIds.has(t.scenarioId)
    ));
  }

  return filterTranscriptsForPivotCell({
    transcripts: run?.transcripts ?? [],
    scenarioDimensions: scenarioDimensions ?? undefined,
    rowDim: activeRowDim,
    colDim: activeColDim,
    row,
    col,
    selectedModel,
    favoredValueKey: normalizedFavoredValueKey,
    decisionStrength: normalizedDecisionStrength,
  });
}

// Re-export for convenience
export { filterTranscriptsForConditionIds };
