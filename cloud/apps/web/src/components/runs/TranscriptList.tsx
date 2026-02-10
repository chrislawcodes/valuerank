/**
 * TranscriptList Component
 *
 * Displays a list of transcripts with filtering and selection.
 */

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { Transcript } from '../../api/operations/runs';
import type { VisualizationData } from '../../api/operations/analysis';
import {
  buildNormalizedScenarioDimensionsMap,
  getScenarioDimensionsForId,
} from '../../utils/scenarioUtils';
import { TranscriptRow } from './TranscriptRow';
import { useCallback } from 'react';

type TranscriptListProps = {
  transcripts: Transcript[];
  onSelect: (transcript: Transcript) => void;
  groupByModel?: boolean;
  scenarioDimensions?: VisualizationData['scenarioDimensions'];
  dimensionLabels?: Record<string, string>;
};

type GroupedTranscripts = Record<string, Transcript[]>;

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

export function TranscriptList({
  transcripts,
  onSelect,
  groupByModel = true,
  scenarioDimensions,
  dimensionLabels,
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

  const sortTranscriptsByAttributes = useCallback((items: Transcript[]): Transcript[] => {
    const { primary, secondary } = sortKeys;
    if (!primary && !secondary) return items;

    return [...items].sort((a, b) => {
      const aDimensions = getScenarioDimensions(a.scenarioId);
      const bDimensions = getScenarioDimensions(b.scenarioId);

      if (primary) {
        const primaryCmp = compareDimensionValues(aDimensions?.[primary], bDimensions?.[primary]);
        if (primaryCmp !== 0) return primaryCmp;
      }

      if (secondary) {
        const secondaryCmp = compareDimensionValues(aDimensions?.[secondary], bDimensions?.[secondary]);
        if (secondaryCmp !== 0) return secondaryCmp;
      }

      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [sortKeys, getScenarioDimensions]);

  const groupedTranscripts = useMemo(() => {
    const grouped = groupTranscriptsByModel(transcripts);
    const sortedGroups: GroupedTranscripts = {};
    for (const [modelId, modelTranscripts] of Object.entries(grouped)) {
      sortedGroups[modelId] = sortTranscriptsByAttributes(modelTranscripts);
    }
    return sortedGroups;
  }, [transcripts, sortTranscriptsByAttributes]);

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
    if (!filter) return transcripts;
    const lowerFilter = filter.toLowerCase();
    const filtered = transcripts.filter(
      (t) =>
        t.modelId.toLowerCase().includes(lowerFilter) ||
        (t.scenarioId?.toLowerCase().includes(lowerFilter) ?? false)
    );
    return sortTranscriptsByAttributes(filtered);
  }, [transcripts, filter, sortTranscriptsByAttributes]);

  if (transcripts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No transcripts yet
      </div>
    );
  }

  if (!groupByModel) {
    // Flat list view
    const gridTemplateColumns = `minmax(140px, 1.2fr) minmax(160px, 1.4fr) ${dimensionKeys.length > 0
        ? dimensionKeys.map(() => 'minmax(120px, 1fr)').join(' ')
        : ''
      } minmax(90px, 0.7fr) minmax(90px, 0.7fr) minmax(90px, 0.7fr)`.trim();

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

        {/* Transcript list */}
        <div className="space-y-1">
          {dimensionKeys.length > 0 && (
            <div
              className="grid gap-3 px-3 py-2 text-xs uppercase tracking-wide text-gray-400"
              style={{ gridTemplateColumns }}
            >
              <span>Scenario</span>
              <span>Model</span>
              {dimensionKeys.map((key) => (
                <span key={key}>{dimensionLabels?.[key] ?? key}</span>
              ))}
              <span>Decision</span>
              <span>Tokens</span>
              <span>Created</span>
            </div>
          )}
          {filteredTranscripts.map((transcript) => (
            <TranscriptRow
              key={transcript.id}
              transcript={transcript}
              onSelect={onSelect}
              dimensions={getScenarioDimensions(transcript.scenarioId)}
              dimensionKeys={dimensionKeys}
              dimensionLabels={dimensionLabels}
              gridTemplateColumns={dimensionKeys.length > 0 ? gridTemplateColumns : undefined}
              showModelColumn
            />
          ))}
        </div>
      </div>
    );
  }

  // Grouped by model view
  const groupedGridTemplateColumns = `minmax(140px, 1.2fr) ${dimensionKeys.length > 0
      ? dimensionKeys.map(() => 'minmax(120px, 1fr)').join(' ')
      : ''
    } minmax(90px, 0.7fr) minmax(90px, 0.7fr) minmax(90px, 0.7fr)`.trim();

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
                {dimensionKeys.length > 0 && (
                  <div
                    className="grid gap-3 px-4 py-2 text-xs uppercase tracking-wide text-gray-400"
                    style={{ gridTemplateColumns: groupedGridTemplateColumns }}
                  >
                    <span>Scenario</span>
                    {dimensionKeys.map((key) => (
                      <span key={key}>{dimensionLabels?.[key] ?? key}</span>
                    ))}
                    <span>Decision</span>
                    <span>Tokens</span>
                    <span>Created</span>
                  </div>
                )}
                {modelTranscripts.map((transcript) => (
                  <TranscriptRow
                    key={transcript.id}
                    transcript={transcript}
                    onSelect={onSelect}
                    compact={false}
                    dimensions={getScenarioDimensions(transcript.scenarioId)}
                    dimensionKeys={dimensionKeys}
                    dimensionLabels={dimensionLabels}
                    gridTemplateColumns={dimensionKeys.length > 0 ? groupedGridTemplateColumns : undefined}
                    showModelColumn={false}
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
