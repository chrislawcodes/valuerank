/**
 * TranscriptList Component
 *
 * Displays a list of transcripts with filtering and selection.
 */

import { useState, useMemo } from 'react';
import { FileText, Clock, Hash, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import type { Transcript } from '../../api/operations/runs';
import type { VisualizationData } from '../../api/operations/analysis';
import { normalizeScenarioId } from '../../utils/scenarioUtils';

type TranscriptListProps = {
  transcripts: Transcript[];
  onSelect: (transcript: Transcript) => void;
  groupByModel?: boolean;
  scenarioDimensions?: VisualizationData['scenarioDimensions'];
  dimensionLabels?: Record<string, string>;
};

/**
 * Format duration in ms to human readable.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds}s`;
}

/**
 * Format date for display.
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

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
    const firstScenario = Object.values(scenarioDimensions)[0];
    if (!firstScenario) return [];
    return Object.keys(firstScenario);
  }, [scenarioDimensions]);

  const normalizedScenarioDimensions = useMemo(() => {
    if (!scenarioDimensions) return new Map<string, Record<string, string | number>>();
    const map = new Map<string, Record<string, string | number>>();
    for (const [scenarioId, dims] of Object.entries(scenarioDimensions)) {
      map.set(normalizeScenarioId(scenarioId), dims);
    }
    return map;
  }, [scenarioDimensions]);

  const getScenarioDimensions = (scenarioId: string | null) => {
    if (!scenarioId) return null;
    if (!scenarioDimensions) return null;
    return scenarioDimensions[scenarioId] ?? normalizedScenarioDimensions.get(normalizeScenarioId(scenarioId)) ?? null;
  };

  const groupedTranscripts = useMemo(
    () => groupTranscriptsByModel(transcripts),
    [transcripts]
  );

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
    return transcripts.filter(
      (t) =>
        t.modelId.toLowerCase().includes(lowerFilter) ||
        (t.scenarioId?.toLowerCase().includes(lowerFilter) ?? false)
    );
  }, [transcripts, filter]);

  if (transcripts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No transcripts yet
      </div>
    );
  }

  if (!groupByModel) {
    // Flat list view
    const gridTemplateColumns = `minmax(140px, 1.2fr) minmax(160px, 1.4fr) ${
      dimensionKeys.length > 0
        ? dimensionKeys.map(() => 'minmax(120px, 1fr)').join(' ')
        : ''
    } minmax(70px, 0.5fr) minmax(90px, 0.7fr) minmax(90px, 0.7fr) minmax(90px, 0.7fr)`.trim();

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
              <span>Turns</span>
              <span>Tokens</span>
              <span>Duration</span>
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
  const groupedGridTemplateColumns = `minmax(140px, 1.2fr) ${
    dimensionKeys.length > 0
      ? dimensionKeys.map(() => 'minmax(120px, 1fr)').join(' ')
      : ''
  } minmax(70px, 0.5fr) minmax(90px, 0.7fr) minmax(90px, 0.7fr) minmax(90px, 0.7fr)`.trim();

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
                    <span>Turns</span>
                    <span>Tokens</span>
                    <span>Duration</span>
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

type TranscriptRowProps = {
  transcript: Transcript;
  onSelect: (transcript: Transcript) => void;
  compact?: boolean;
  dimensions?: Record<string, string | number> | null;
  dimensionKeys?: string[];
  dimensionLabels?: Record<string, string>;
  gridTemplateColumns?: string;
  showModelColumn?: boolean;
};

function TranscriptRow({
  transcript,
  onSelect,
  compact = false,
  dimensions,
  dimensionKeys = [],
  gridTemplateColumns,
  showModelColumn = true,
}: TranscriptRowProps) {
  const showDimensions = !compact && dimensionKeys.length > 0 && gridTemplateColumns;

  return (
    // eslint-disable-next-line react/forbid-elements -- Row button requires custom full-width layout styling
    <button
      type="button"
      onClick={() => onSelect(transcript)}
      className={`w-full text-left hover:bg-gray-50 transition-colors ${
        compact ? 'px-4 py-2' : 'p-3 border border-gray-200 rounded-lg'
      }`}
    >
      {showDimensions ? (
        <div className="grid items-center gap-3 text-sm text-gray-600" style={{ gridTemplateColumns }}>
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="truncate">
              {transcript.scenarioId ? transcript.scenarioId.slice(0, 8) : 'No scenario'}
            </span>
          </div>
          {showModelColumn && <div className="truncate text-gray-900">{transcript.modelId}</div>}
          {dimensionKeys.map((key) => (
            <div key={key} className="truncate">
              {dimensions && dimensions[key] !== undefined ? String(dimensions[key]) : '-'}
            </div>
          ))}
          <div className="flex items-center gap-1 text-gray-500">
            <Hash className="w-3 h-3" />
            {transcript.turnCount}
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            <Zap className="w-3 h-3" />
            {transcript.tokenCount.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="w-3 h-3" />
            {formatDuration(transcript.durationMs)}
          </div>
          <div className="text-xs text-gray-500">{formatDate(transcript.createdAt)}</div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className={`text-gray-400 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
            <div className="min-w-0">
              {!compact && (
                <div className="font-medium text-gray-900 truncate">
                  {transcript.modelId}
                </div>
              )}
              <div className="text-sm text-gray-500 truncate">
                {transcript.scenarioId
                  ? `Scenario: ${transcript.scenarioId.slice(0, 8)}...`
                  : 'No scenario'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-500 flex-shrink-0">
            <span className="flex items-center gap-1" title="Turns">
              <Hash className="w-3 h-3" />
              {transcript.turnCount}
            </span>
            <span className="flex items-center gap-1" title="Tokens">
              <Zap className="w-3 h-3" />
              {transcript.tokenCount.toLocaleString()}
            </span>
            <span className="flex items-center gap-1" title="Duration">
              <Clock className="w-3 h-3" />
              {formatDuration(transcript.durationMs)}
            </span>
            <span className="text-xs" title="Created at">
              {formatDate(transcript.createdAt)}
            </span>
          </div>
        </div>
      )}
    </button>
  );
}
