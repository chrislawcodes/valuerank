import type { DomainAnalysisQueryResult } from '../../api/operations/domainAnalysis';

type DomainAnalysisScopeSummaryProps = {
  contributionSummary: DomainAnalysisQueryResult['domainAnalysis']['contributionSummary'];
  excludedDataSummary: DomainAnalysisQueryResult['domainAnalysis']['excludedDataSummary'];
};

function formatReasonLabel(reasonCode: string): string {
  return reasonCode.replace(/_/g, ' ').toLowerCase();
}

export function DomainAnalysisScopeSummary({
  contributionSummary,
  excludedDataSummary,
}: DomainAnalysisScopeSummaryProps) {
  const hasContributions = contributionSummary.length > 0;
  const hasExcludedData = excludedDataSummary.length > 0;

  return (
    <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50 p-3 text-xs text-sky-900">
      <p className="font-semibold">Cross-domain summary</p>
      <p className="mt-1 text-sky-800">
        Each domain counts equally in the all-domains aggregate.
      </p>
      {hasContributions ? (
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">Included domains</p>
            <ul className="mt-2 space-y-1.5">
              {contributionSummary.map((entry) => (
                <li key={`${entry.domainId}-${entry.domainName}`} className="flex items-center justify-between gap-3 rounded border border-sky-100 bg-white px-2 py-1.5">
                  <span className="font-medium text-sky-950">{entry.domainName}</span>
                  <span className="text-sky-800">{Math.round(entry.share * 1000) / 10}%</span>
                </li>
              ))}
            </ul>
          </div>
          {hasExcludedData && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">Excluded data</p>
              <ul className="mt-2 space-y-1.5">
                {excludedDataSummary.map((entry) => (
                  <li key={`${entry.domainId}-${entry.reasonCode}`} className="rounded border border-sky-100 bg-white px-2 py-1.5">
                    <span className="font-medium text-sky-950">{entry.domainName}</span>{' '}
                    <span className="text-sky-800">
                      {formatReasonLabel(entry.reasonCode)} · {entry.count.toFixed(0)} runs
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sky-800">
          No included data remained after filtering for this signature.
          {hasExcludedData ? ' The excluded-data summary below explains what was skipped.' : ''}
        </p>
      )}
      {!hasContributions && hasExcludedData && (
        <ul className="mt-3 space-y-1.5">
          {excludedDataSummary.map((entry) => (
            <li key={`${entry.domainId}-${entry.reasonCode}`} className="rounded border border-sky-100 bg-white px-2 py-1.5 text-sky-800">
              {entry.domainName}: {formatReasonLabel(entry.reasonCode)} ({entry.count.toFixed(0)} runs)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
