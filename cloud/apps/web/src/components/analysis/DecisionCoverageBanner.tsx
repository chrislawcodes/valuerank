import { AlertCircle } from 'lucide-react';
import type { DecisionCoverageSummary } from '../../utils/analysisCoverage';

type DecisionCoverageBannerProps = {
  coverage: DecisionCoverageSummary;
  contextLabel: string;
  compact?: boolean;
};

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function DecisionCoverageBanner({
  coverage,
  contextLabel,
  compact = false,
}: DecisionCoverageBannerProps) {
  const {
    totalTranscripts,
    scoredTranscripts,
    unresolvedTranscripts,
    parserScoredTranscripts,
    manuallyAdjudicatedTranscripts,
    exactMatchTranscripts,
    fallbackResolvedTranscripts,
    legacyNumericTranscripts,
  } = coverage;

  const hasUnresolved = unresolvedTranscripts > 0;
  const containerClass = compact
    ? 'flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3'
    : 'flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4';

  return (
    <div className={containerClass}>
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-amber-800">Decision coverage</p>
        <p className="text-sm text-amber-800">
          {contextLabel.charAt(0).toUpperCase() + contextLabel.slice(1)} include{' '}
          <span className="font-semibold">{scoredTranscripts}</span> of{' '}
          <span className="font-semibold">{totalTranscripts}</span> transcripts.
          {hasUnresolved ? (
            <>
              {' '}
              <span className="font-semibold">{pluralize(unresolvedTranscripts, 'unresolved transcript')}</span>{' '}
              {unresolvedTranscripts === 1 ? 'is' : 'are'} currently excluded until manually adjudicated.
            </>
          ) : (
            <> All transcripts are represented in the current numeric summary.</>
          )}
        </p>
        <p className="text-xs text-amber-700">
          Parser-scored: {parserScoredTranscripts} ({exactMatchTranscripts} exact, {fallbackResolvedTranscripts} fallback)
          {' • '}
          Manually adjudicated: {manuallyAdjudicatedTranscripts}
          {' • '}
          Legacy numeric: {legacyNumericTranscripts}
        </p>
      </div>
    </div>
  );
}
