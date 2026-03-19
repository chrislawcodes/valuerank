import { FileText, Zap } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { Transcript } from '../../api/operations/runs';
import { getDecisionMetadata } from '../../utils/methodology';

export type TranscriptScenarioHighlight = {
  label: string;
  containerClassName: string;
  badgeClassName: string;
};

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
  scenarioHighlight?: TranscriptScenarioHighlight | null;
  normalizeDecision?: boolean;
  normalizationBadgeTitle?: string;
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

/**
 * Maps standard job-choice level words to their numeric tier (1-5).
 * Used to display attribute levels as e.g. "5 - Full" in the transcript table.
 */
const LEVEL_WORD_TO_NUMBER: Record<string, number> = {
  full: 5,
  substantial: 4,
  moderate: 3,
  minimal: 2,
  negligible: 1,
};

/**
 * Extracts the short direction phrase from a full scale label.
 * "Strongly support taking the job with..." → "Strongly support"
 * "Neutral / Unsure" → "Neutral / Unsure" (no truncation)
 */
function extractShortDirection(fullLabel: string): string {
  const idx = fullLabel.toLowerCase().indexOf(' taking ');
  return idx !== -1 ? fullLabel.slice(0, idx) : fullLabel;
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

function normalizeDecisionCode(decision: string, normalizeDecision: boolean): string {
  if (!normalizeDecision) {
    return decision;
  }

  if (!['1', '2', '3', '4', '5'].includes(decision)) {
    return decision;
  }

  return String(6 - Number(decision));
}

export function TranscriptRow({
  transcript,
  onSelect,
  compact = false,
  dimensions,
  dimensionKeys = [],
  dimensionLabels: _dimensionLabels,
  gridTemplateColumns,
  showModelColumn = true,
  onDecisionChange,
  decisionUpdating = false,
  scenarioHighlight = null,
  normalizeDecision = false,
  normalizationBadgeTitle,
}: TranscriptRowProps) {
  const decisionMetadata = getDecisionMetadata(transcript.decisionMetadata);
  const showGrid = !compact && Boolean(gridTemplateColumns);
  const rawDecision = transcript.decisionCode ?? extractDecision(transcript.content);
  const decision = normalizeDecisionCode(rawDecision, normalizeDecision);
  const decisionScaleLabels = decisionMetadata?.scaleLabels ?? [];

  // Build enriched decision label: "{code} - {Short direction} ({job subject})"
  // e.g. "2 - Somewhat support (trust from other people)"
  // For non-job-choice labels, falls back to "{code} - {Short direction} {primary_dim_key}"
  const decisionScaleEntry = decisionScaleLabels.find((e) => e.code === String(decision));
  const rawMatchedLabel = (decisionMetadata as Record<string, unknown> | null)?.['matchedLabel'] as string | null;
  const labelText = normalizeDecision
    ? (decisionScaleEntry?.label ?? null)
    : (rawMatchedLabel ?? decisionScaleEntry?.label ?? null);
  const shortDirection = labelText != null ? extractShortDirection(labelText) : null;
  const primaryDimKey = dimensions != null ? (Object.keys(dimensions)[0] ?? null) : null;
  // For job-choice scale labels ("... taking the job with X"), extract the subject X.
  // This correctly reflects orientation (A-first vs B-first) unlike primaryDimKey which is
  // always the alphabetically-first dimension key due to PostgreSQL JSONB key ordering.
  const jobWithMarker = ' taking the job with ';
  const jobWithIdx = labelText?.toLowerCase().indexOf(jobWithMarker) ?? -1;
  const jobSubject = jobWithIdx >= 0 && labelText != null
    ? labelText.slice(jobWithIdx + jobWithMarker.length)
    : null;
  const decisionCore = shortDirection != null
    ? (jobSubject != null
        ? `${decision} - ${shortDirection} (${jobSubject})`
        : (primaryDimKey != null ? `${decision} - ${shortDirection} ${primaryDimKey}` : `${decision} - ${shortDirection}`))
    : String(decision);
  const decisionDisplay = transcript.decisionCodeSource === 'llm' ? `${decisionCore}*` : decisionCore;
  const isAnalyzableDecision = ['1', '2', '3', '4', '5'].includes(String(decision));
  const isDecisionOverrideAllowed = Boolean(onDecisionChange) && (
    decisionMetadata?.parseClass === 'ambiguous'
    || !isAnalyzableDecision
  );
  const containerClassName = scenarioHighlight?.containerClassName
    ?? 'border-gray-200 hover:bg-gray-50';

  const handleDecisionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    event.stopPropagation();
    const selected = event.target.value;
    if (!selected || !onDecisionChange) return;
    void onDecisionChange(transcript, selected);
  };

  const handleOpen = () => {
    onSelect(transcript);
  };

  const decisionOptions = decisionScaleLabels.length > 0
    ? decisionScaleLabels
        .slice()
        .sort((left, right) => Number(right.code) - Number(left.code))
        .map((entry) => ({ value: entry.code, label: `${entry.code} - ${entry.label}` }))
    : [
        { value: '5', label: '5' },
        { value: '4', label: '4' },
        { value: '3', label: '3' },
        { value: '2', label: '2' },
        { value: '1', label: '1' },
      ];

  return (
    <div
      role="button"
      tabIndex={0}
      data-transcript-id={transcript.id}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleOpen();
        }
      }}
      className={`w-full text-left transition-colors ${
        compact ? 'px-4 py-2' : 'rounded-lg border p-3'
      } ${containerClassName}`}
      data-condition-group={scenarioHighlight?.label}
    >
      {showGrid ? (
        <div className="grid items-center gap-3 text-sm text-gray-600" style={{ gridTemplateColumns }}>
          <div className="flex items-center gap-2 min-w-0">
            {scenarioHighlight && (
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${scenarioHighlight.badgeClassName}`}
                title={`Condition group ${scenarioHighlight.label}`}
                aria-label={`Condition group ${scenarioHighlight.label}. Rows with this badge come from the same repeated condition.`}
              >
                {scenarioHighlight.label}
              </span>
            )}
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="truncate">
              {transcript.scenarioId ? transcript.scenarioId.slice(0, 8) : 'No scenario'}
            </span>
          </div>
          {showModelColumn && <div className="truncate text-gray-900">{transcript.modelId}</div>}
          {dimensionKeys.map((key) => {
            const rawValue = dimensions?.[key];
            let displayValue: string;
            if (rawValue === undefined) {
              displayValue = '-';
            } else {
              const wordStr = typeof rawValue === 'string' ? rawValue : null;
              const wordLower = wordStr?.toLowerCase() ?? null;
              const numericLevel = typeof rawValue === 'number'
                ? rawValue
                : wordLower != null ? (LEVEL_WORD_TO_NUMBER[wordLower] ?? null) : null;
              const wordDisplay = wordStr != null
                ? wordStr.charAt(0).toUpperCase() + wordStr.slice(1)
                : null;
              displayValue = numericLevel != null && wordDisplay != null
                ? `${numericLevel} - ${wordDisplay}`
                : numericLevel != null
                  ? String(numericLevel)
                  : String(rawValue);
            }
            return (
              <div key={key} className="truncate">
                {displayValue}
              </div>
            );
          })}
          <div className="truncate">
            {isDecisionOverrideAllowed ? (
              <div className="flex items-center gap-2">
                <span className="text-gray-700">{decisionDisplay}</span>
                {normalizeDecision && (
                  <span
                    className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800"
                    title={normalizationBadgeTitle}
                  >
                    Norm
                  </span>
                )}
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
                  {decisionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span>{decisionDisplay}</span>
                {normalizeDecision && (
                  <span
                    className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800"
                    title={normalizationBadgeTitle}
                  >
                    Norm
                  </span>
                )}
                {decisionMetadata?.parseClass === 'ambiguous' && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    Ambiguous
                  </span>
                )}
                {decisionMetadata?.parseClass === 'fallback_resolved' && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                    Fallback
                  </span>
                )}
                {transcript.decisionCodeSource === 'manual' && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                    Manual
                  </span>
                )}
              </div>
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
              <div className="flex items-center gap-2 text-sm text-gray-500 truncate">
                {scenarioHighlight && (
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${scenarioHighlight.badgeClassName}`}
                    title={`Condition group ${scenarioHighlight.label}`}
                    aria-label={`Condition group ${scenarioHighlight.label}. Rows with this badge come from the same repeated condition.`}
                  >
                    {scenarioHighlight.label}
                  </span>
                )}
                {transcript.scenarioId
                  ? `Scenario: ${transcript.scenarioId.slice(0, 8)}...`
                  : 'No scenario'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-500 flex-shrink-0">
            <span
              className="flex items-center gap-2"
              title={transcript.decisionCodeSource === 'llm' ? 'Decision (LLM-classified)' : 'Decision'}
            >
              <span>{decisionDisplay}</span>
              {normalizeDecision && (
                <span
                  className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800"
                  title={normalizationBadgeTitle}
                >
                  Norm
                </span>
              )}
              {decisionMetadata?.parseClass === 'ambiguous' && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  Ambiguous
                </span>
              )}
              {decisionMetadata?.parseClass === 'fallback_resolved' && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                  Fallback
                </span>
              )}
              {transcript.decisionCodeSource === 'manual' && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                  Manual
                </span>
              )}
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
