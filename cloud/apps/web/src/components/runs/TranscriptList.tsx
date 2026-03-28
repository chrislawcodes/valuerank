/**
 * TranscriptList Component
 *
 * Displays a list of transcripts with filtering and selection.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import type { Transcript } from '../../api/operations/runs';
import type { VisualizationData } from '../../api/operations/analysis';
import {
  buildNormalizedScenarioDimensionsMap,
  getScenarioDimensionsForId,
} from '../../utils/scenarioUtils';
import { formatDisplayLabel } from '../../utils/displayLabels';
import {
  hasRenderableTranscriptDecisionModelV2,
  getTranscriptDecisionSortValue,
  normalizeLegacyDecisionCode,
  type TranscriptDecisionDisplayMode,
} from '../../utils/transcriptDecisionModel';
import { Tooltip } from '../ui/Tooltip';
import { TranscriptRow } from './TranscriptRow';

type TranscriptListProps = {
  transcripts: Transcript[];
  onSelect: (transcript: Transcript) => void;
  groupByModel?: boolean;
  scenarioDimensions?: VisualizationData['scenarioDimensions'];
  dimensionLabels?: Record<string, string>;
  onDecisionChange?: (transcript: Transcript, decisionCode: string) => Promise<void> | void;
  updatingTranscriptIds?: Set<string>;
  decisionColumnLabel?: string;
  decisionColumnTooltip?: string;
  normalizedDecisionTranscriptIds?: Set<string>;
  decisionDisplayMode?: TranscriptDecisionDisplayMode;
};

type GroupedTranscripts = Record<string, Transcript[]>;
type SortDirection = 'asc' | 'desc';
type SortColumn =
  | { type: 'model' }
  | { type: 'dimension'; key: string }
  | { type: 'decision' }
  | { type: 'created' };
type SortState = {
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

function groupTranscriptsByModel(transcripts: Transcript[]): GroupedTranscripts {
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

function resolveSortDimensionKeys(
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

function compareDimensionValues(a: string | number | undefined, b: string | number | undefined): number {
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

function getDefaultSortState(
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

function isSameSortColumn(a: SortColumn, b: SortColumn): boolean {
  if (a.type !== b.type) {
    return false;
  }

  if (a.type === 'dimension' && b.type === 'dimension') {
    return a.key === b.key;
  }

  return true;
}

function getTranscriptDecisionValue(
  transcript: Transcript,
  displayMode: TranscriptDecisionDisplayMode,
  normalizedDecisionTranscriptIds?: Set<string>,
): string | number {
  if (displayMode === 'audit') {
    if (!hasRenderableTranscriptDecisionModelV2(transcript)) {
      return getTranscriptDecisionSortValue(transcript, 'legacy');
    }
    return getTranscriptDecisionSortValue(transcript, displayMode);
  }

  const sortValue = getTranscriptDecisionSortValue(transcript, displayMode);
  if (
    normalizedDecisionTranscriptIds?.has(transcript.id)
    && ['1', '2', '3', '4', '5'].includes(String(sortValue))
  ) {
    return normalizeLegacyDecisionCode(String(sortValue), true);
  }
  return sortValue;
}

function SortHeaderButton({
  label,
  ariaLabel,
  tooltip,
  onClick,
  active,
  direction,
}: {
  label: string;
  ariaLabel: string;
  tooltip?: string;
  onClick: () => void;
  active: boolean;
  direction: SortDirection;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      {/* eslint-disable-next-line react/forbid-elements -- Sortable table headers need a semantic inline button control */}
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 text-left transition-colors ${
          active ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'
        }`}
        aria-label={`Sort by ${ariaLabel}${active ? ` (${direction === 'asc' ? 'ascending' : 'descending'})` : ''}`}
      >
        <span>{label}</span>
        <span aria-hidden="true" className={`text-[11px] leading-none ${active ? 'text-gray-700' : 'text-gray-300'}`}>
          {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
      {tooltip ? <HeaderTooltipTrigger label={label} tooltip={tooltip} /> : null}
    </div>
  );
}

function HeaderTooltipTrigger({
  label,
  tooltip,
}: {
  label: string;
  tooltip?: string;
}) {
  if (!tooltip) {
    return null;
  }

  return (
    <Tooltip
      content={<div className="max-w-xs whitespace-normal text-xs leading-5">{tooltip}</div>}
      position="top"
      variant="light"
      className="max-w-xs whitespace-normal"
    >
      {/* eslint-disable-next-line react/forbid-elements -- Lightweight tooltip trigger requires a custom inline button */}
      <button
        type="button"
        className="inline-flex cursor-help text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-sm"
        aria-label={`${label}: ${tooltip}`}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

export function TranscriptList({
  transcripts,
  onSelect,
  groupByModel = true,
  scenarioDimensions,
  dimensionLabels,
  onDecisionChange,
  updatingTranscriptIds,
  decisionColumnLabel = 'Decision',
  decisionColumnTooltip,
  normalizedDecisionTranscriptIds,
  decisionDisplayMode = 'legacy',
}: TranscriptListProps) {
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  const dimensionKeys = useMemo(() => {
    if (!scenarioDimensions) return [];

    // Use the union of keys across all scenarios so sparse/empty first
    // entries do not drop valid columns from the table.
    const keys = new Set<string>();
    for (const dimensions of Object.values(scenarioDimensions)) {
      if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) {
        continue;
      }
      for (const key of Object.keys(dimensions)) {
        keys.add(key);
      }
    }
    return Array.from(keys);
  }, [scenarioDimensions]);

  const normalizedScenarioDimensions = useMemo(() => {
    return buildNormalizedScenarioDimensionsMap(scenarioDimensions);
  }, [scenarioDimensions]);

  const getScenarioDimensions = useCallback((scenarioId: string | null) => {
    return getScenarioDimensionsForId(
      scenarioId,
      scenarioDimensions,
      normalizedScenarioDimensions
    );
  }, [scenarioDimensions, normalizedScenarioDimensions]);

  const sortKeys = useMemo(
    () => resolveSortDimensionKeys(dimensionKeys, dimensionLabels),
    [dimensionKeys, dimensionLabels]
  );

  const [sortState, setSortState] = useState<SortState>(() => getDefaultSortState(sortKeys, dimensionKeys));
  const [hasUserChosenSort, setHasUserChosenSort] = useState(false);

  useEffect(() => {
    if (!hasUserChosenSort) {
      setSortState(getDefaultSortState(sortKeys, dimensionKeys));
      return;
    }

    setSortState((current) => {
      const currentDimensionExists = current.column.type !== 'dimension'
        || dimensionKeys.includes(current.column.key);

      if (currentDimensionExists) {
        return current;
      }

      return getDefaultSortState(sortKeys, dimensionKeys);
    });
  }, [dimensionKeys, hasUserChosenSort, sortKeys]);

  const hasDimensionKeys = dimensionKeys.length > 0;

  const compareByColumn = useCallback((a: Transcript, b: Transcript, column: SortColumn): number => {
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
          getTranscriptDecisionValue(a, decisionDisplayMode, normalizedDecisionTranscriptIds),
          getTranscriptDecisionValue(b, decisionDisplayMode, normalizedDecisionTranscriptIds),
        );
      case 'created':
        return a.createdAt.localeCompare(b.createdAt);
      default:
        return 0;
    }
  }, [decisionDisplayMode, getScenarioDimensions, normalizedDecisionTranscriptIds]);

  const sortTranscripts = useCallback((items: Transcript[]): Transcript[] => {
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
  }, [compareByColumn, sortKeys.primary, sortKeys.secondary, sortState.column, sortState.direction]);

  const handleSortChange = useCallback((column: SortColumn) => {
    setHasUserChosenSort(true);
    setSortState((current) => {
      if (isSameSortColumn(current.column, column)) {
        return {
          column,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        };
      }

      return {
        column,
        direction: 'asc',
      };
    });
  }, []);

  const groupedTranscripts = useMemo(() => {
    const grouped = groupTranscriptsByModel(transcripts);
    const sortedGroups: GroupedTranscripts = {};
    for (const [modelId, modelTranscripts] of Object.entries(grouped)) {
      sortedGroups[modelId] = sortTranscripts(modelTranscripts);
    }
    return sortedGroups;
  }, [transcripts, sortTranscripts]);

  // Auto-expand all model groups when dimension columns are present so users see level data.
  useEffect(() => {
    if (!hasDimensionKeys) return;
    setExpandedModels((prev) => {
      const next = new Set(Object.keys(groupedTranscripts).sort());
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [hasDimensionKeys, groupedTranscripts]);

  const modelIds = Object.keys(groupedTranscripts).sort();

  const toggleModel = (modelId: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  // Filter transcripts by model ID or scenario ID for underlying lookups.
  const filteredTranscripts = useMemo(() => {
    if (!filter) return sortTranscripts(transcripts);
    const lowerFilter = filter.toLowerCase();
    const filtered = transcripts.filter(
      (t) =>
        t.modelId.toLowerCase().includes(lowerFilter) ||
        (t.scenarioId?.toLowerCase().includes(lowerFilter) ?? false)
    );
    return sortTranscripts(filtered);
  }, [transcripts, filter, sortTranscripts]);

  const isActiveSort = useCallback((column: SortColumn) => {
    return isSameSortColumn(sortState.column, column);
  }, [sortState.column]);

  if (transcripts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No transcripts yet
      </div>
    );
  }

  if (!groupByModel) {
    // Flat list view
  const gridTemplateColumns = [
      'minmax(160px, 1.4fr)',
      ...dimensionKeys.map(() => 'minmax(120px, 1fr)'),
      'minmax(220px, 1.4fr)',
      'minmax(90px, 0.7fr)',
    ].join(' ');

    return (
      <div className="space-y-2">
        {/* Filter input */}
        {transcripts.length > 5 && (
          <input
            type="text"
            placeholder="Filter by model or transcript..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        )}

        {/* Transcript list */}
        <div className="space-y-1">
          <div
            className="grid gap-3 px-3 py-2 text-xs uppercase tracking-wide text-gray-400"
            style={{ gridTemplateColumns }}
          >
            <SortHeaderButton
              label="Model"
              ariaLabel="Model"
              onClick={() => handleSortChange({ type: 'model' })}
              active={isActiveSort({ type: 'model' })}
              direction={sortState.direction}
            />
            {dimensionKeys.map((key) => (
              <SortHeaderButton
                key={key}
                label={formatDisplayLabel(dimensionLabels?.[key] ?? key)}
                ariaLabel={formatDisplayLabel(dimensionLabels?.[key] ?? key)}
                onClick={() => handleSortChange({ type: 'dimension', key })}
                active={isActiveSort({ type: 'dimension', key })}
                direction={sortState.direction}
              />
            ))}
            <SortHeaderButton
              label={decisionColumnLabel}
              ariaLabel={decisionColumnLabel}
              tooltip={decisionColumnTooltip}
              onClick={() => handleSortChange({ type: 'decision' })}
              active={isActiveSort({ type: 'decision' })}
              direction={sortState.direction}
            />
            <SortHeaderButton
              label="Created"
              ariaLabel="Created"
              onClick={() => handleSortChange({ type: 'created' })}
              active={isActiveSort({ type: 'created' })}
              direction={sortState.direction}
            />
          </div>
          {filteredTranscripts.map((transcript) => (
            <TranscriptRow
              key={transcript.id}
              transcript={transcript}
              onSelect={onSelect}
              dimensions={getScenarioDimensions(transcript.scenarioId)}
              dimensionKeys={dimensionKeys}
              dimensionLabels={dimensionLabels}
              gridTemplateColumns={gridTemplateColumns}
              showModelColumn
              onDecisionChange={onDecisionChange}
              decisionUpdating={updatingTranscriptIds?.has(transcript.id) ?? false}
              normalizeDecision={normalizedDecisionTranscriptIds?.has(transcript.id) ?? false}
              decisionDisplayMode={decisionDisplayMode}
            />
          ))}
        </div>
      </div>
    );
  }

  // Grouped by model view
  const groupedGridTemplateColumns = [
    ...dimensionKeys.map(() => 'minmax(120px, 1fr)'),
    'minmax(220px, 1.4fr)',
    'minmax(90px, 0.7fr)',
  ].join(' ');

  return (
    <div className="space-y-3">
      {modelIds.map((modelId) => {
        const modelTranscripts = groupedTranscripts[modelId] ?? [];
        const isExpanded = expandedModels.has(modelId);

        return (
          <div key={modelId} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Model header */}
            {/* eslint-disable-next-line react/forbid-elements -- Accordion button requires custom full-width layout */}
            <button
              type="button"
              onClick={() => toggleModel(modelId)}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{modelId}</span>
                <span className="text-sm text-gray-500">
                  ({modelTranscripts.length} transcript{modelTranscripts.length !== 1 ? 's' : ''})
                </span>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {/* Transcripts */}
            {isExpanded && (
              <div className="divide-y divide-gray-100">
                <div
                  className="grid gap-3 px-4 py-2 text-xs uppercase tracking-wide text-gray-400"
                  style={{ gridTemplateColumns: groupedGridTemplateColumns }}
                >
                  {dimensionKeys.map((key) => (
                    <SortHeaderButton
                      key={key}
                      label={formatDisplayLabel(dimensionLabels?.[key] ?? key)}
                      ariaLabel={formatDisplayLabel(dimensionLabels?.[key] ?? key)}
                      onClick={() => handleSortChange({ type: 'dimension', key })}
                      active={isActiveSort({ type: 'dimension', key })}
                      direction={sortState.direction}
                    />
                  ))}
                  <SortHeaderButton
                    label={decisionColumnLabel}
                    ariaLabel={decisionColumnLabel}
                    tooltip={decisionColumnTooltip}
                    onClick={() => handleSortChange({ type: 'decision' })}
                    active={isActiveSort({ type: 'decision' })}
                    direction={sortState.direction}
                  />
                  <SortHeaderButton
                    label="Created"
                    ariaLabel="Created"
                    onClick={() => handleSortChange({ type: 'created' })}
                    active={isActiveSort({ type: 'created' })}
                    direction={sortState.direction}
                  />
                </div>
                {modelTranscripts.map((transcript) => (
                  <TranscriptRow
                    key={transcript.id}
                    transcript={transcript}
                    onSelect={onSelect}
                    compact={false}
                    dimensions={getScenarioDimensions(transcript.scenarioId)}
                    dimensionKeys={dimensionKeys}
                    dimensionLabels={dimensionLabels}
                    gridTemplateColumns={groupedGridTemplateColumns}
                    showModelColumn={false}
                    onDecisionChange={onDecisionChange}
                    decisionUpdating={updatingTranscriptIds?.has(transcript.id) ?? false}
                    normalizeDecision={normalizedDecisionTranscriptIds?.has(transcript.id) ?? false}
                    decisionDisplayMode={decisionDisplayMode}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
