/**
 * TranscriptList Component
 *
 * Displays a list of transcripts with filtering and selection.
 */

import { useState, useMemo } from 'react';
import { FileText, Clock, Hash, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import type { Transcript } from '../../api/operations/runs';

type TranscriptListProps = {
  transcripts: Transcript[];
  onSelect: (transcript: Transcript) => void;
  groupByModel?: boolean;
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
}: TranscriptListProps) {
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

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
          {filteredTranscripts.map((transcript) => (
            <TranscriptRow
              key={transcript.id}
              transcript={transcript}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  // Grouped by model view
  return (
    <div className="space-y-3">
      {modelIds.map((modelId) => {
        const modelTranscripts = groupedTranscripts[modelId] ?? [];
        const isExpanded = expandedModels.has(modelId);

        return (
          <div key={modelId} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Model header */}
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
                {modelTranscripts.map((transcript) => (
                  <TranscriptRow
                    key={transcript.id}
                    transcript={transcript}
                    onSelect={onSelect}
                    compact
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
};

function TranscriptRow({ transcript, onSelect, compact = false }: TranscriptRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(transcript)}
      className={`w-full text-left hover:bg-gray-50 transition-colors ${
        compact ? 'px-4 py-2' : 'p-3 border border-gray-200 rounded-lg'
      }`}
    >
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
    </button>
  );
}
