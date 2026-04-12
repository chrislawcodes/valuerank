/**
 * PairedStabilityView
 *
 * Renders the paired stability drilldown view showing transcripts split by
 * primary and companion vignette order.
 */

import { TranscriptList } from '../components/runs/TranscriptList';
import { formatRepeatPatternLabel } from '../utils/analysisTranscriptParams';
import type { Transcript } from '../api/operations/runs';

interface PairedStabilityViewProps {
  repeatPattern: string;
  primaryRunName: string | null | undefined;
  companionRunName: string | null | undefined;
  primaryTranscripts: Transcript[];
  companionTranscripts: Transcript[];
  primaryScenarioDimensions: Record<string, Record<string, string | number>> | null | undefined;
  companionScenarioDimensions: Record<string, Record<string, string | number>> | null | undefined;
  onSelectTranscript: (transcript: Transcript) => void;
  onDecisionChange: (transcript: Transcript, nextDecisionCode: string) => Promise<void>;
  updatingTranscriptIds: Set<string>;
  decisionColumnLabel: string;
  decisionColumnTooltip: string;
  decisionDisplayMode: 'audit';
}

export function PairedStabilityView({
  repeatPattern,
  primaryRunName,
  companionRunName,
  primaryTranscripts,
  companionTranscripts,
  primaryScenarioDimensions,
  companionScenarioDimensions,
  onSelectTranscript,
  onDecisionChange,
  updatingTranscriptIds,
  decisionColumnLabel,
  decisionColumnTooltip,
  decisionDisplayMode,
}: PairedStabilityViewProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
        Stability drilldown is active for <span className="font-medium">{formatRepeatPatternLabel(repeatPattern)}</span>. Transcripts are shown separately for each vignette order.
      </div>
      {primaryTranscripts.length === 0 && companionTranscripts.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          No transcripts match the selected stability pattern.
        </div>
      )}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">{primaryRunName ?? 'Primary vignette order'}</h3>
        {primaryTranscripts.length > 0 ? (
          <TranscriptList
            transcripts={primaryTranscripts}
            onSelect={onSelectTranscript}
            groupByModel={false}
            scenarioDimensions={primaryScenarioDimensions ?? undefined}
            onDecisionChange={onDecisionChange}
            updatingTranscriptIds={updatingTranscriptIds}
            decisionColumnLabel={decisionColumnLabel}
            decisionColumnTooltip={decisionColumnTooltip}
            decisionDisplayMode={decisionDisplayMode}
          />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
            No transcripts matched this pattern for this vignette order.
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">{companionRunName ?? 'Companion vignette order'}</h3>
        {companionTranscripts.length > 0 ? (
          <TranscriptList
            transcripts={companionTranscripts}
            onSelect={onSelectTranscript}
            groupByModel={false}
            scenarioDimensions={companionScenarioDimensions ?? undefined}
            onDecisionChange={onDecisionChange}
            updatingTranscriptIds={updatingTranscriptIds}
            decisionColumnLabel={decisionColumnLabel}
            decisionColumnTooltip={decisionColumnTooltip}
            decisionDisplayMode={decisionDisplayMode}
          />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
            No transcripts matched this pattern for this vignette order.
          </div>
        )}
      </section>
    </div>
  );
}
