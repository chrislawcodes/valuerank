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
} from '../../utils/scenarioUtils';
import { formatDisplayLabel } from '../../utils/displayLabels';
import type { TranscriptDecisionDisplayMode } from '../../utils/transcriptDecisionModel';
import { SortHeaderButton } from './SortHeaderButton';
import { TranscriptRow } from './TranscriptRow';
import {
  groupTranscriptsByModel,
  resolveSortDimensionKeys,
  getDefaultSortState,
  isSameSortColumn,
  buildColumnComparator,
  buildTranscriptSorter,
  type GroupedTranscripts,
  type SortColumn,
  type SortState,
} from './transcriptListSort';

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

  const compareByColumn = useCallback(
    buildColumnComparator(decisionDisplayMode, getScenarioDimensions),
    [decisionDisplayMode, getScenarioDimensions, normalizedDecisionTranscriptIds],
  );

  const sortTranscripts = useCallback(
    buildTranscriptSorter(sortState, sortKeys, compareByColumn),
    [compareByColumn, sortKeys.primary, sortKeys.secondary, sortState.column, sortState.direction],
  );

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
