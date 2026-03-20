type AnalysisScopeBannerProps = {
  analysisMode?: 'single' | 'paired';
  orientationCorrectedCount?: number;
  compact?: boolean;
  className?: string;
};

export function getAnalysisModeLabel(analysisMode: 'single' | 'paired'): string {
  return analysisMode === 'paired' ? 'Paired vignettes' : 'Single vignette';
}

export function getAnalysisModeScopeLabel(analysisMode: 'single' | 'paired'): string {
  return analysisMode === 'paired' ? 'Paired vignette scope' : 'Single vignette scope';
}

export function getAnalysisModeScopeDescription(analysisMode: 'single' | 'paired'): string {
  return analysisMode === 'paired'
    ? 'Paired mode keeps the matched vignette context visible while the analysis surface is adapted.'
    : 'Single mode keeps the analysis surface focused on one vignette at a time.';
}

export function AnalysisScopeBanner({
  analysisMode,
  orientationCorrectedCount,
  compact = false,
  className = '',
}: AnalysisScopeBannerProps) {
  if (!analysisMode) {
    return null;
  }

  const containerClass = compact
    ? 'rounded-lg border border-teal-200 bg-teal-50 px-4 py-3'
    : 'rounded-lg border border-teal-200 bg-teal-50 p-4';

  const hasOrientationPairing =
    analysisMode === 'paired' &&
    orientationCorrectedCount != null &&
    orientationCorrectedCount > 0;

  return (
    <div className={`${containerClass} ${className}`.trim()}>
      <p className="text-sm font-medium text-teal-900">{getAnalysisModeScopeLabel(analysisMode)}</p>
      <p className="mt-1 text-xs text-teal-800">{getAnalysisModeScopeDescription(analysisMode)}</p>
      {hasOrientationPairing && (
        <p className="mt-1 text-xs text-teal-700">
          {orientationCorrectedCount} condition{orientationCorrectedCount === 1 ? '' : 's'} had
          their presentation order reversed and were normalized to a canonical orientation before
          analysis.
        </p>
      )}
    </div>
  );
}
