import { FileText, Zap } from 'lucide-react';
import type { ChangeEvent } from 'react';
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
  onDecisionChange?: (transcript: Transcript, decisionCode: string) => Promise<void> | void;
  decisionUpdating?: boolean;
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractDecision(content: unknown): string {
  if (!isRecord(content)) return '-';

  const directCandidates = [content.decisionCode, content.decision, content.score];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'number' || typeof candidate === 'string') {
      return String(candidate);
    }
  }

  const summary = content.summary;
  if (isRecord(summary)) {
    const summaryCandidates = [summary.decisionCode, summary.decision, summary.score];
    for (const candidate of summaryCandidates) {
      if (typeof candidate === 'number' || typeof candidate === 'string') {
        return String(candidate);
      }
    }
  }

  return '-';
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
  onDecisionChange,
  decisionUpdating = false,
}: TranscriptRowProps) {
  const showGrid = !compact && Boolean(gridTemplateColumns);
  const decision = transcript.decisionCode ?? extractDecision(transcript.content);
  const decisionDisplay = transcript.decisionCodeSource === 'llm' ? `${decision}*` : decision;
  const isDecisionOverrideAllowed = transcript.decisionCode === 'other' && Boolean(onDecisionChange);

  const handleDecisionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    event.stopPropagation();
    const selected = event.target.value;
    if (!selected || !onDecisionChange) return;
    void onDecisionChange(transcript, selected);
  };

  const handleOpen = () => {
    onSelect(transcript);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleOpen();
        }
      }}
      className={`w-full text-left hover:bg-gray-50 transition-colors ${
        compact ? 'px-4 py-2' : 'p-3 border border-gray-200 rounded-lg'
      }`}
    >
      {showGrid ? (
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
          <div className="truncate">
            {isDecisionOverrideAllowed ? (
              <div className="flex items-center gap-2">
                <span className="text-gray-700">other</span>
                <select
                  aria-label={`Set decision for transcript ${transcript.id}`}
                  className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                  defaultValue=""
                  disabled={decisionUpdating}
                  onClick={(event) => event.stopPropagation()}
                  onChange={handleDecisionChange}
                >
                  <option value="">
                    {decisionUpdating ? 'Saving...' : 'Change'}
                  </option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
            ) : (
              decisionDisplay
            )}
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            <Zap className="w-3 h-3" />
            {transcript.tokenCount.toLocaleString()}
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
            <span title={transcript.decisionCodeSource === 'llm' ? 'Decision (LLM-classified)' : 'Decision'}>
              {decisionDisplay}
            </span>
            <span className="flex items-center gap-1" title="Tokens">
              <Zap className="w-3 h-3" />
              {transcript.tokenCount.toLocaleString()}
            </span>
            <span className="text-xs" title="Created at">
              {formatDate(transcript.createdAt)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
