/**
 * TranscriptList Component
 *
 * Displays a list of transcripts with filtering and selection.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Transcript } from '../../api/operations/runs';
import type { VisualizationData } from '../../api/operations/analysis';
import {
  buildNormalizedScenarioDimensionsMap,
  getScenarioDimensionsForId,
  normalizeScenarioId,
} from '../../utils/scenarioUtils';
import { TranscriptRow, type TranscriptScenarioHighlight } from './TranscriptRow';

type TranscriptListProps = {
  transcripts: Transcript[];
  onSelect: (transcript: Transcript) => void;
  groupByModel?: boolean;
  scenarioDimensions?: VisualizationData['scenarioDimensions'];
  dimensionLabels?: Record<string, string>;
  onDecisionChange?: (transcript: Transcript, decisionCode: string) => Promise<void> | void;
  updatingTranscriptIds?: Set<string>;
};

type GroupedTranscripts = Record<string, Transcript[]>;
type SortDirection = 'asc' | 'desc';
type SortColumn =
  | { type: 'scenario' }
  | { type: 'model' }
  | { type: 'dimension'; key: string }
  | { type: 'decision' }
  | { type: 'tokens' }
  | { type: 'created' };
type SortState = {
  column: SortColumn;
  direction: SortDirection;
};

const SCENARIO_HIGHLIGHT_VARIANTS: Array<Pick<TranscriptScenarioHighlight, 'containerClassName' | 'badgeClassName'>> = [
  {
    containerClassName: 'border-teal-200 bg-teal-50/60 hover:bg-teal-100/70',
    badgeClassName: 'bg-teal-100 text-teal-700 ring-1 ring-inset ring-teal-200',
  },
  {
    containerClassName: 'border-amber-200 bg-amber-50/60 hover:bg-amber-100/70',
    badgeClassName: 'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-200',
  },
  {
    containerClassName: 'border-sky-200 bg-sky-50/60 hover:bg-sky-100/70',
    badgeClassName: 'bg-sky-100 text-sky-700 ring-1 ring-inset ring-sky-200',
  },
  {
    containerClassName: 'border-rose-200 bg-rose-50/60 hover:bg-rose-100/70',
    badgeClassName: 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200',
  },
  {
    containerClassName: 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/70',
    badgeClassName: 'bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  },
  {
    containerClassName: 'border-violet-200 bg-violet-50/60 hover:bg-violet-100/70',
    badgeClassName: 'bg-violet-100 text-violet-700 ring-1 ring-inset ring-violet-200',
  },
];

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

  const aNum = typeof a === 'number' ? a : Number(a);
  const bNum = typeof b === 'number' ? b : Number(b);
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
    column: { type: 'scenario' },
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

function getTranscriptDecisionValue(transcript: Transcript): string | number {
  const fallbackCandidates = [
    transcript.decisionCode,
    (transcript.content as { decisionCode?: unknown } | null)?.decisionCode,
    (transcript.content as { decision?: unknown } | null)?.decision,
    (transcript.content as { score?: unknown } | null)?.score,
    (transcript.content as { summary?: { decisionCode?: unknown; decision?: unknown; score?: unknown } } | null)?.summary?.decisionCode,
    (transcript.content as { summary?: { decisionCode?: unknown; decision?: unknown; score?: unknown } } | null)?.summary?.decision,
    (transcript.content as { summary?: { decisionCode?: unknown; decision?: unknown; score?: unknown } } | null)?.summary?.score,
  ];

  for (const candidate of fallbackCandidates) {
    if (typeof candidate === 'number' || typeof candidate === 'string') {
      return candidate;
    }
  }

  return '';
}

function SortHeaderButton({
  label,
  onClick,
  active,
  direction,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  direction: SortDirection;
}) {
  return (
    /* eslint-disable-next-line react/forbid-elements -- Sortable table headers need a semantic inline button control */
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-left transition-colors ${
        active ? 'text-gray-700' : 'text-gray-400 hover:text-gray-600'
      }`}
      aria-label={`Sort by ${label}${active ? ` (${direction === 'asc' ? 'ascending' : 'descending'})` : ''}`}
    >
      <span>{label}</span>
      <span aria-hidden="true" className={`text-[11px] leading-none ${active ? 'text-gray-700' : 'text-gray-300'}`}>
        {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
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
      case 'scenario':
        return compareDimensionValues(a.scenarioId ?? undefined, b.scenarioId ?? undefined);
      case 'model':
        return compareDimensionValues(a.modelId, b.modelId);
      case 'dimension': {
        const aDimensions = getScenarioDimensions(a.scenarioId);
        const bDimensions = getScenarioDimensions(b.scenarioId);
        return compareDimensionValues(aDimensions?.[column.key], bDimensions?.[column.key]);
      }
      case 'decision':
        return compareDimensionValues(getTranscriptDecisionValue(a), getTranscriptDecisionValue(b));
      case 'tokens':
        return a.tokenCount - b.tokenCount;
      case 'created':
        return a.createdAt.localeCompare(b.createdAt);
      default:
        return 0;
    }
  }, [getScenarioDimensions]);

  const sortTranscripts = useCallback((items: Transcript[]): Transcript[] => {
    const fallbackColumns: SortColumn[] = [];

    if (sortKeys.primary) {
      fallbackColumns.push({ type: 'dimension', key: sortKeys.primary });
    }
    if (sortKeys.secondary && sortKeys.secondary !== sortKeys.primary) {
      fallbackColumns.push({ type: 'dimension', key: sortKeys.secondary });
    }

    fallbackColumns.push(
      { type: 'scenario' },
      { type: 'model' },
      { type: 'created' },
    );

    return [...items].sort((a, b) => {
      const primaryResult = compareByColumn(a, b, sortState.column);
      if (primaryResult !== 0) {
        return sortState.direction === 'asc' ? primaryResult : -primaryResult;
      }

      for (const fallback of fallbackColumns) {
        if (isSameSortColumn(fallback, sortState.column)) {
          continue;
        }

        const fallbackResult = compareByColumn(a, b, fallback);
        if (fallbackResult !== 0) {
          return fallbackResult;
        }
      }

      return 0;
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

  const scenarioHighlights = useMemo(() => {
    const orderedScenarioIds: string[] = [];
    const seenScenarioIds = new Set<string>();

    sortTranscripts(transcripts).forEach((transcript) => {
      if (!transcript.scenarioId) {
        return;
      }

      const normalizedScenario = normalizeScenarioId(transcript.scenarioId);
      if (seenScenarioIds.has(normalizedScenario)) {
        return;
      }

      seenScenarioIds.add(normalizedScenario);
      orderedScenarioIds.push(normalizedScenario);
    });

    if (orderedScenarioIds.length <= 1) {
      return new Map<string, TranscriptScenarioHighlight>();
    }

    const defaultVariant = SCENARIO_HIGHLIGHT_VARIANTS[0]!;

    return new Map<string, TranscriptScenarioHighlight>(
      orderedScenarioIds.map((scenarioId, index) => {
        const variant = SCENARIO_HIGHLIGHT_VARIANTS[index % SCENARIO_HIGHLIGHT_VARIANTS.length] ?? defaultVariant;

        return [
          scenarioId,
          {
            label: `C${index + 1}`,
            containerClassName: variant.containerClassName,
            badgeClassName: variant.badgeClassName,
          },
        ];
      }),
    );
  }, [sortTranscripts, transcripts]);

  const getScenarioHighlight = useCallback((scenarioId: string | null): TranscriptScenarioHighlight | null => {
    if (!scenarioId) {
      return null;
    }

    return scenarioHighlights.get(normalizeScenarioId(scenarioId)) ?? null;
  }, [scenarioHighlights]);
  const showScenarioLegend = scenarioHighlights.size > 1;

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

  // Filter transcripts by scenario ID or model ID
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
      'minmax(140px, 1.2fr)',
      'minmax(160px, 1.4fr)',
      ...dimensionKeys.map(() => 'minmax(120px, 1fr)'),
      'minmax(220px, 1.4fr)',
      'minmax(90px, 0.7fr)',
      'minmax(90px, 0.7fr)',
    ].join(' ');

    return (
      <div className="space-y-2">
        {/* Filter input */}
        {transcripts.length > 5 && (
          <input
            type="text"
            placeholder="Filter by model or scenario..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        )}

        {showScenarioLegend && (
          <p className="text-xs text-gray-500">
            Rows with the same <span className="font-medium text-gray-700">C#</span> badge come from the same repeated condition.
          </p>
        )}

        {/* Transcript list */}
        <div className="space-y-1">
          <div
            className="grid gap-3 px-3 py-2 text-xs uppercase tracking-wide text-gray-400"
            style={{ gridTemplateColumns }}
          >
            <SortHeaderButton
              label="Scenario"
              onClick={() => handleSortChange({ type: 'scenario' })}
              active={isActiveSort({ type: 'scenario' })}
              direction={sortState.direction}
            />
            <SortHeaderButton
              label="Model"
              onClick={() => handleSortChange({ type: 'model' })}
              active={isActiveSort({ type: 'model' })}
              direction={sortState.direction}
            />
            {dimensionKeys.map((key) => (
              <SortHeaderButton
                key={key}
                label={dimensionLabels?.[key] ?? key}
                onClick={() => handleSortChange({ type: 'dimension', key })}
                active={isActiveSort({ type: 'dimension', key })}
                direction={sortState.direction}
              />
            ))}
            <SortHeaderButton
              label="Decision"
              onClick={() => handleSortChange({ type: 'decision' })}
              active={isActiveSort({ type: 'decision' })}
              direction={sortState.direction}
            />
            <SortHeaderButton
              label="Tokens"
              onClick={() => handleSortChange({ type: 'tokens' })}
              active={isActiveSort({ type: 'tokens' })}
              direction={sortState.direction}
            />
            <SortHeaderButton
              label="Created"
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
              scenarioHighlight={getScenarioHighlight(transcript.scenarioId)}
            />
          ))}
        </div>
      </div>
    );
  }

  // Grouped by model view
  const groupedGridTemplateColumns = [
    'minmax(140px, 1.2fr)',
    ...dimensionKeys.map(() => 'minmax(120px, 1fr)'),
    'minmax(220px, 1.4fr)',
    'minmax(90px, 0.7fr)',
    'minmax(90px, 0.7fr)',
  ].join(' ');

  return (
    <div className="space-y-3">
      {showScenarioLegend && (
        <p className="text-xs text-gray-500">
          Rows with the same <span className="font-medium text-gray-700">C#</span> badge come from the same repeated condition.
        </p>
      )}
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
                  <SortHeaderButton
                    label="Scenario"
                    onClick={() => handleSortChange({ type: 'scenario' })}
                    active={isActiveSort({ type: 'scenario' })}
                    direction={sortState.direction}
                  />
                  {dimensionKeys.map((key) => (
                    <SortHeaderButton
                      key={key}
                      label={dimensionLabels?.[key] ?? key}
                      onClick={() => handleSortChange({ type: 'dimension', key })}
                      active={isActiveSort({ type: 'dimension', key })}
                      direction={sortState.direction}
                    />
                  ))}
                  <SortHeaderButton
                    label="Decision"
                    onClick={() => handleSortChange({ type: 'decision' })}
                    active={isActiveSort({ type: 'decision' })}
                    direction={sortState.direction}
                  />
                  <SortHeaderButton
                    label="Tokens"
                    onClick={() => handleSortChange({ type: 'tokens' })}
                    active={isActiveSort({ type: 'tokens' })}
                    direction={sortState.direction}
                  />
                  <SortHeaderButton
                    label="Created"
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
                    scenarioHighlight={getScenarioHighlight(transcript.scenarioId)}
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
