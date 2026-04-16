import { FileText } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { Transcript } from '../../api/operations/runs';
import { formatDisplayLabel } from '../../utils/displayLabels';
import { getDecisionMetadata } from '../../utils/methodology';
import {
  formatCanonicalDecisionHeadline,
  getTranscriptDecisionAuditBadge,
  hasRenderableTranscriptDecisionModelV2,
  type TranscriptDecisionDisplayMode,
} from '../../utils/transcriptDecisionModel';

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
  normalizeDecision?: boolean;
  decisionDisplayMode?: TranscriptDecisionDisplayMode;
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

const STRENGTH_PREFIXES = ['Strongly support', 'Somewhat support'];

/**
 * Extracts the short direction phrase from a full scale label.
 * "Strongly support choosing the approach relating to..." → "Strongly support"
 * "Neutral / Unsure" → "Neutral / Unsure"
 */
function extractShortDirection(fullLabel: string): string {
  for (const prefix of STRENGTH_PREFIXES) {
    if (fullLabel.startsWith(prefix)) return prefix;
  }
  return fullLabel;
}

/**
 * Extracts the value subject from a scale label by stripping the strength prefix
 * and any domain-specific label prefix.
 * E.g. "Strongly support taking the job with recognition of their expertise"
 *   → "recognition of their expertise"
 * Works for any domain by detecting the label prefix from the scale labels.
 */
function extractSubjectFromLabel(
  labelText: string,
  scaleLabels: Array<{ code: string; label: string }>,
): string | null {
  // Find a non-neutral scale label to detect the label prefix pattern
  const sampleLabel = scaleLabels.find((entry) =>
    entry.label.startsWith('Strongly support') || entry.label.startsWith('Somewhat support'),
  )?.label;
  if (sampleLabel == null) return null;

  // Find which strength prefix this label uses
  let strengthPrefix: string | null = null;
  for (const prefix of STRENGTH_PREFIXES) {
    if (labelText.startsWith(prefix)) {
      strengthPrefix = prefix;
      break;
    }
  }
  if (strengthPrefix == null) return null;

  // The text after "Strongly support " or "Somewhat support " includes the
  // label prefix + the value body. We need to find where the body starts.
  // Strategy: find the label prefix by comparing two different scale labels.
  const afterStrength = labelText.slice(strengthPrefix.length).trimStart();

  // Find two non-neutral labels to detect the common prefix
  const nonNeutralLabels = scaleLabels
    .filter((entry) => entry.label.startsWith('Strongly support') || entry.label.startsWith('Somewhat support'))
    .map((entry) => {
      for (const prefix of STRENGTH_PREFIXES) {
        if (entry.label.startsWith(prefix)) {
          return entry.label.slice(prefix.length).trimStart();
        }
      }
      return entry.label;
    });

  if (nonNeutralLabels.length < 2) return afterStrength.length > 0 ? afterStrength : null;

  // Find the common prefix among all non-neutral labels — that's the label prefix
  let commonPrefix = '';
  const first = nonNeutralLabels[0] ?? '';
  for (let i = 0; i < first.length; i++) {
    const char = first[i];
    if (nonNeutralLabels.every((label) => label[i] === char)) {
      commonPrefix += char;
    } else {
      break;
    }
  }

  // The subject is what comes after the common prefix (the label prefix)
  const subject = afterStrength.slice(commonPrefix.length).trim();
  return subject.length > 0 ? subject : null;
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

function getLegacyDecisionDisplay(
  transcript: Transcript,
  decision: string,
  dimensions?: Record<string, string | number> | null,
): string {
  const decisionMetadata = getDecisionMetadata(transcript.decisionMetadata);
  const decisionScaleLabels = decisionMetadata?.scaleLabels ?? [];
  const decisionScaleEntry = decisionScaleLabels.find((entry) => entry.code === String(decision));
  const rawMatchedLabel = (decisionMetadata as Record<string, unknown> | null)?.['matchedLabel'] as string | null;
  const labelText = rawMatchedLabel ?? decisionScaleEntry?.label ?? null;
  const shortDirection = labelText != null ? extractShortDirection(labelText) : null;
  const primaryDimKey = dimensions != null ? (Object.keys(dimensions)[0] ?? null) : null;
  const subject = labelText != null
    ? extractSubjectFromLabel(labelText, decisionScaleLabels)
    : null;
  const formattedSubject = subject != null ? formatDisplayLabel(subject) : null;

  return shortDirection != null
    ? (formattedSubject != null
        ? `${decision} - ${shortDirection} (${formattedSubject})`
        : (primaryDimKey != null ? `${decision} - ${shortDirection} ${formatDisplayLabel(primaryDimKey)}` : `${decision} - ${shortDirection}`))
    : String(decision);
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
  normalizeDecision: _normalizeDecision = false,
  decisionDisplayMode,
}: TranscriptRowProps) {
  const decisionMetadata = getDecisionMetadata(transcript.decisionMetadata);
  const showGrid = !compact && Boolean(gridTemplateColumns);
  const rawDecision = transcript.decisionCode ?? extractDecision(transcript.content);
  const decisionScaleLabels = decisionMetadata?.scaleLabels ?? [];
  const rowDecisionDisplayMode = decisionDisplayMode ?? (
    hasRenderableTranscriptDecisionModelV2(transcript) ? 'audit' : 'legacy'
  );
  const legacyDecisionDisplay = getLegacyDecisionDisplay(transcript, String(rawDecision), dimensions);
  const canonicalDecision = transcript.decisionModelV2?.canonical ?? null;
  const canonicalDecisionDisplay = formatCanonicalDecisionHeadline(transcript);
  const auditDecisionBadge = rowDecisionDisplayMode === 'audit'
    && hasRenderableTranscriptDecisionModelV2(transcript)
    ? getTranscriptDecisionAuditBadge(transcript)
    : null;
  const decisionDisplay = rowDecisionDisplayMode === 'audit'
    ? canonicalDecisionDisplay
    : legacyDecisionDisplay;
  const isAnalyzableDecision = Boolean(rawDecision);
  const isDecisionOverrideAllowed = rowDecisionDisplayMode === 'legacy' && Boolean(onDecisionChange) && (
    decisionMetadata?.parseClass === 'ambiguous'
    || !isAnalyzableDecision
  );
  const containerClassName = 'border-gray-200 hover:bg-gray-50';

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
    >
      {showGrid ? (
        <div className="grid items-center gap-3 text-sm text-gray-600" style={{ gridTemplateColumns }}>
          {showModelColumn ? (
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="truncate text-gray-900">{transcript.modelId}</span>
            </div>
          ) : null}
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
                ? formatDisplayLabel(wordStr.charAt(0).toUpperCase() + wordStr.slice(1))
                : null;
              displayValue = numericLevel != null && wordDisplay != null
                ? `${numericLevel} - ${wordDisplay}`
                : numericLevel != null
                  ? String(numericLevel)
                  : formatDisplayLabel(String(rawValue));
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
                {auditDecisionBadge && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    {auditDecisionBadge}
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
                {auditDecisionBadge && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    {auditDecisionBadge}
                  </span>
                )}
                <span>{decisionDisplay}</span>
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
                {canonicalDecision?.source === 'manual' && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                    Manual
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="text-xs text-gray-500">{formatDate(transcript.createdAt)}</div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className={`text-gray-400 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
            <div className="min-w-0">
              <div className={`truncate ${compact ? 'text-sm text-gray-500' : 'font-medium text-gray-900'}`}>
                {transcript.modelId}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-500 flex-shrink-0">
            <span
              className="flex items-center gap-2"
              title={rowDecisionDisplayMode === 'audit' ? 'Decision summary' : 'Decision'}
            >
              {auditDecisionBadge && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  {auditDecisionBadge}
                </span>
              )}
              <span>{decisionDisplay}</span>
              {rowDecisionDisplayMode === 'legacy' && decisionMetadata?.parseClass === 'ambiguous' && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  Ambiguous
                </span>
              )}
              {rowDecisionDisplayMode === 'legacy' && decisionMetadata?.parseClass === 'fallback_resolved' && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                  Fallback
                </span>
              )}
              {rowDecisionDisplayMode === 'legacy' && canonicalDecision?.source === 'manual' && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                  Manual
                </span>
              )}
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
