/**
 * Sort utilities for TranscriptList.
 * Extracted from TranscriptList.tsx to keep file sizes under 400 lines.
 */

import type { Transcript } from '../../api/operations/runs';
import {
  hasRenderableTranscriptDecisionModelV2,
  getTranscriptDecisionSortValue,
  type TranscriptDecisionDisplayMode,
} from '../../utils/transcriptDecisionModel';

export type GroupedTranscripts = Record<string, Transcript[]>;
export type SortDirection = 'asc' | 'desc';
export type SortColumn =
  | { type: 'model' }
  | { type: 'dimension'; key: string }
  | { type: 'decision' }
  | { type: 'created' };
export type SortState = {
  column: SortColumn;
  direction: SortDirection;
};

const LEVEL_WORD_TO_NUMBER: Record<string, number> = {
  full: 5,
  substantial: 4,
  moderate: 3,
  minimal: 2,
  negligible: 1,
};

export function groupTranscriptsByModel(transcripts: Transcript[]): GroupedTranscripts {
  const groups: GroupedTranscripts = {};
  for (const transcript of transcripts) {
    const key = transcript.modelId;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(transcript);
  }
  return groups;
}

function normalizeDimensionName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function resolveSortDimensionKeys(
  dimensionKeys: string[],
  dimensionLabels?: Record<string, string>
): { primary: string | null; secondary: string | null } {
  if (dimensionKeys.length === 0) {
    return { primary: null, secondary: null };
  }

  const findByName = (target: 'attributea' | 'attributeb'): string | null => {
    for (const key of dimensionKeys) {
      const keyNormalized = normalizeDimensionName(key);
      const label = dimensionLabels?.[key];
      const labelNormalized = label ? normalizeDimensionName(label) : '';
      if (
        keyNormalized.includes(target)
        || labelNormalized.includes(target)
      ) {
        return key;
      }
    }
    return null;
  };

  const primary = findByName('attributea') ?? dimensionKeys[0] ?? null;
  const secondary = findByName('attributeb') ?? dimensionKeys.find((k) => k !== primary) ?? null;
  return { primary, secondary };
}

export function compareDimensionValues(a: string | number | undefined, b: string | number | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;

  const toComparableNumber = (value: string | number): number => {
    if (typeof value === 'number') {
      return value;
    }

    const trimmed = value.trim();
    const mappedLevel = LEVEL_WORD_TO_NUMBER[trimmed.toLowerCase()];
    if (mappedLevel !== undefined) {
      return mappedLevel;
    }

    return Number(trimmed);
  };

  const aNum = toComparableNumber(a);
  const bNum = toComparableNumber(b);
  const aNumValid = Number.isFinite(aNum);
  const bNumValid = Number.isFinite(bNum);

  if (aNumValid && bNumValid) {
    return aNum - bNum;
  }

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function getDefaultSortState(
  sortKeys: { primary: string | null; secondary: string | null },
  dimensionKeys: string[],
): SortState {
  const defaultDimension = sortKeys.primary ?? dimensionKeys[0] ?? null;

  if (defaultDimension) {
    return {
      column: { type: 'dimension', key: defaultDimension },
      direction: 'asc',
    };
  }

  return {
    column: { type: 'model' },
    direction: 'asc',
  };
}

export function isSameSortColumn(a: SortColumn, b: SortColumn): boolean {
  if (a.type !== b.type) {
    return false;
  }

  if (a.type === 'dimension' && b.type === 'dimension') {
    return a.key === b.key;
  }

  return true;
}

export function getTranscriptDecisionValue(
  transcript: Transcript,
  displayMode: TranscriptDecisionDisplayMode,
): string | number {
  if (displayMode === 'audit') {
    if (!hasRenderableTranscriptDecisionModelV2(transcript)) {
      return getTranscriptDecisionSortValue(transcript, 'legacy');
    }
    return getTranscriptDecisionSortValue(transcript, displayMode);
  }

  return getTranscriptDecisionSortValue(transcript, displayMode);
}

/**
 * Build a comparator for sorting transcripts by a given column.
 * Returns a function that compares two transcripts.
 */
export function buildColumnComparator(
  decisionDisplayMode: TranscriptDecisionDisplayMode,
  getScenarioDimensions: (scenarioId: string | null) => Record<string, string | number> | null,
): (a: Transcript, b: Transcript, column: SortColumn) => number {
  return (a: Transcript, b: Transcript, column: SortColumn): number => {
    switch (column.type) {
      case 'model':
        return compareDimensionValues(a.modelId, b.modelId);
      case 'dimension': {
        const aDimensions = getScenarioDimensions(a.scenarioId);
        const bDimensions = getScenarioDimensions(b.scenarioId);
        return compareDimensionValues(aDimensions?.[column.key], bDimensions?.[column.key]);
      }
      case 'decision':
        return compareDimensionValues(
          getTranscriptDecisionValue(a, decisionDisplayMode),
          getTranscriptDecisionValue(b, decisionDisplayMode),
        );
      case 'created':
        return a.createdAt.localeCompare(b.createdAt);
      default:
        return 0;
    }
  };
}

/**
 * Build a sort function that sorts transcripts with primary + fallback columns.
 */
export function buildTranscriptSorter(
  sortState: SortState,
  sortKeys: { primary: string | null; secondary: string | null },
  compareByColumn: (a: Transcript, b: Transcript, column: SortColumn) => number,
): (items: Transcript[]) => Transcript[] {
  return (items: Transcript[]): Transcript[] => {
    const fallbackColumns: SortColumn[] = [];

    if (sortKeys.primary) {
      fallbackColumns.push({ type: 'dimension', key: sortKeys.primary });
    }
    if (sortKeys.secondary && sortKeys.secondary !== sortKeys.primary) {
      fallbackColumns.push({ type: 'dimension', key: sortKeys.secondary });
    }

    fallbackColumns.push(
      { type: 'model' },
      { type: 'created' },
    );

    const applyDirection = (value: number): number => (sortState.direction === 'asc' ? value : -value);

    return [...items].sort((a, b) => {
      const primaryResult = compareByColumn(a, b, sortState.column);
      if (primaryResult !== 0) {
        return applyDirection(primaryResult);
      }

      for (const fallback of fallbackColumns) {
        if (isSameSortColumn(fallback, sortState.column)) {
          continue;
        }

        const fallbackResult = compareByColumn(a, b, fallback);
        if (fallbackResult !== 0) {
          return applyDirection(fallbackResult);
        }
      }

      if (a.createdAt !== b.createdAt) {
        const createdResult = a.createdAt.localeCompare(b.createdAt);
        return applyDirection(createdResult);
      }

      const idResult = a.id.localeCompare(b.id, undefined, { sensitivity: 'base' });
      return applyDirection(idResult);
    });
  };
}
