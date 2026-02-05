import { FileText, Clock, Hash, Zap } from 'lucide-react';
import type { Transcript } from '../../api/operations/runs';

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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds}s`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function TranscriptRow({
  transcript,
  onSelect,
  compact = false,
  dimensions,
  dimensionKeys = [],
  dimensionLabels,
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
          {dimensionKeys.map((key) => {
            const rawValue = dimensions?.[key];
            const displayValue = rawValue === undefined
              ? '-'
              : dimensionLabels?.[String(rawValue)] ?? String(rawValue);
            return (
              <div key={key} className="truncate">
                {displayValue}
              </div>
            );
          })}
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
