/**
 * URL param parsers and pure utility functions for the AnalysisTranscripts page.
 */

import { formatTrialSignature } from '@valuerank/shared/trial-signature';
import { normalizeModelId, normalizeScenarioId, getScenarioDimensionsForId } from './scenarioUtils';
import {
  deriveDecisionDimensionLabels,
  getDecisionSideNames,
  mapDecisionSidesToScenarioAttributes,
} from './decisionLabels';
import type { Transcript } from '../api/operations/runs';

interface RunWithConfig {
  id: string;
  tags: Array<{ name: string }>;
  config: unknown;
  definitionVersion?: number | null;
}

export interface AggregateRunEntry {
  id: string;
  signature: string;
  count: number;
}

export function buildAggregateRuns(
  runs: RunWithConfig[],
  currentRunId: string | null | undefined,
): AggregateRunEntry[] {
  return runs
    .filter((candidate) => candidate.tags.some((tag) => tag.name === 'Aggregate'))
    .map((candidate) => {
      const config = candidate.config as {
        definitionSnapshot?: { _meta?: { definitionVersion?: unknown }, version?: unknown };
        temperature?: unknown;
      } | null;
      const version = typeof config?.definitionSnapshot?._meta?.definitionVersion === 'number'
        ? config.definitionSnapshot._meta.definitionVersion
        : typeof config?.definitionSnapshot?.version === 'number'
          ? config.definitionSnapshot.version
          : typeof candidate.definitionVersion === 'number'
            ? candidate.definitionVersion
            : null;
      const temp = typeof config?.temperature === 'number' ? config.temperature : null;
      return { id: candidate.id, signature: formatTrialSignature(version, temp) };
    })
    .reduce<AggregateRunEntry[]>((acc, candidate) => {
      const existing = acc.find((item) => item.signature === candidate.signature);
      if (existing) {
        existing.count += 1;
        if (candidate.id === currentRunId) {
          existing.id = candidate.id;
        }
        return acc;
      }
      acc.push({ ...candidate, count: 1 });
      return acc;
    }, []);
}

export function getDisplaySignature(signature: string | null | undefined): string {
  return signature && signature !== 'v?td' ? signature : 'Unknown Signature';
}

export function parseConditionIds(value: string): string[] {
  return value
    .split(',')
    .map((conditionId) => conditionId.trim())
    .filter((conditionId) => conditionId.length > 0);
}

export function formatRepeatPatternLabel(value: string): string {
  switch (value) {
    case 'stable':
      return 'Stable';
    case 'softLean':
      return 'Soft Lean';
    case 'torn':
      return 'Torn';
    case 'noisy':
      return 'Unstable';
    default:
      return value;
  }
}

export function normalizePairedValueKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

export interface FilterModeFlags {
  hasCellFilterParams: boolean;
  hasRepeatPatternParams: boolean;
  hasDirectTranscriptParam: boolean;
  hasBucketFilterParams: boolean;
  hasPairedValueFilterParams: boolean;
  hasPairedConditionFilterParams: boolean;
}

export function computeFilterModeFlags(args: {
  activeRowDim: string;
  activeColDim: string;
  row: string;
  col: string;
  selectedModel: string;
  repeatPattern: string;
  conditionIdsInParams: boolean;
  selectedTranscriptId: string;
  decisionBucket: string;
  analysisMode: string;
  pairedValueKey: string;
  pairedDecisionBucketParam: string;
  pairView: string;
}): FilterModeFlags {
  return {
    hasCellFilterParams: Boolean(args.activeRowDim && args.activeColDim && args.row && args.col),
    hasRepeatPatternParams: Boolean(args.selectedModel && args.repeatPattern && args.conditionIdsInParams),
    hasDirectTranscriptParam: args.selectedTranscriptId.length > 0,
    hasBucketFilterParams: Boolean(
      args.activeRowDim
      && args.activeColDim
      && args.selectedModel
      && (args.decisionBucket === 'a' || args.decisionBucket === 'neutral' || args.decisionBucket === 'b')
    ),
    hasPairedValueFilterParams: Boolean(
      args.analysisMode === 'paired'
      && args.selectedModel
      && (args.pairedValueKey || args.pairedDecisionBucketParam === 'a' || args.pairedDecisionBucketParam === 'neutral' || args.pairedDecisionBucketParam === 'b')
      && args.pairView === 'blended'
    ),
    hasPairedConditionFilterParams: Boolean(
      args.analysisMode === 'paired'
      && args.selectedModel
      && args.activeRowDim
      && args.activeColDim
      && args.row
      && args.col
      && (args.pairView === 'condition-blended' || args.pairView === 'condition-split')
    ),
  };
}

export type PairedConditionSource = 'current' | 'companion' | 'pooled';

export function parsePairedConditionSource(value: string | null): PairedConditionSource | null {
  if (value === 'current' || value === 'companion' || value === 'pooled') {
    return value;
  }
  return null;
}

export function formatPairedConditionSourceLabel(
  source: PairedConditionSource | null,
  currentName?: string | null,
  companionName?: string | null,
): string | null {
  if (!source) {
    return null;
  }

  if (source === 'current') {
    return currentName ?? 'Current vignette';
  }
  if (source === 'companion') {
    return companionName ?? 'Companion vignette';
  }
  return 'Pooled';
}

/**
 * Given a target value key, determine whether it maps to decision side 'a' (low) or 'b' (high).
 * Returns null if the key doesn't match either side.
 */
export function resolveDecisionBucketForValue(
  content: unknown,
  rowDimension: string,
  colDimension: string,
  targetValueKey: string,
): 'a' | 'b' | null {
  const labels = deriveDecisionDimensionLabels(content);
  const sideNames = getDecisionSideNames(labels);
  const mapped = mapDecisionSidesToScenarioAttributes(
    sideNames.aName,
    sideNames.bName,
    [rowDimension, colDimension].filter((value) => value !== ''),
  );
  const normalizedTarget = normalizePairedValueKey(targetValueKey);
  if (normalizePairedValueKey(mapped.lowAttribute) === normalizedTarget) return 'a';
  if (normalizePairedValueKey(mapped.highAttribute) === normalizedTarget) return 'b';
  return null;
}

export function filterTranscriptsForConditionIds(
  transcripts: Transcript[],
  modelId: string,
  conditionIds: string[],
  scenarioDimensions: Record<string, Record<string, string | number>> | null | undefined,
  rowDim: string,
  colDim: string,
): Transcript[] {
  if (!modelId) {
    return [];
  }

  const selectedModelNormalized = normalizeModelId(modelId);
  const canonicalIds = new Set(conditionIds);
  const normalizedIds = new Set(conditionIds.map((conditionId) => normalizeScenarioId(conditionId)));

  return transcripts.filter((transcript) => {
    const transcriptModelNormalized = normalizeModelId(transcript.modelId);
    const modelMatches = transcript.modelId === modelId
      || transcriptModelNormalized === selectedModelNormalized
      || transcript.modelId.includes(modelId)
      || modelId.includes(transcript.modelId);

    if (!modelMatches) {
      return false;
    }
    if (!transcript.scenarioId) {
      return false;
    }

    const transcriptScenarioId = String(transcript.scenarioId);
    const transcriptScenarioNormalized = normalizeScenarioId(transcriptScenarioId);

    if (canonicalIds.has(transcriptScenarioId) || normalizedIds.has(transcriptScenarioNormalized)) {
      return true;
    }

    if (!scenarioDimensions || !rowDim || !colDim) {
      return false;
    }

    const dimensions = getScenarioDimensionsForId(transcript.scenarioId, scenarioDimensions);
    if (!dimensions) {
      return false;
    }

    const conditionId = `${String(dimensions[rowDim] ?? 'N/A')}||${String(dimensions[colDim] ?? 'N/A')}`;
    return canonicalIds.has(conditionId);
  });
}
