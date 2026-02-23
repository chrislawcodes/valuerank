import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import {
  DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY,
  type DomainAnalysisValueDetailQueryResult,
  type DomainAnalysisValueDetailQueryVariables,
} from '../api/operations/domainAnalysis';
import { VALUE_LABELS, type ValueKey } from '../data/domainAnalysisData';

function toPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

export function DomainAnalysisValueDetail() {
  const [searchParams] = useSearchParams();
  const domainId = searchParams.get('domainId') ?? '';
  const modelId = searchParams.get('modelId') ?? '';
  const valueKey = searchParams.get('valueKey') ?? '';
  const backLink = domainId ? `/domains/analysis?domainId=${encodeURIComponent(domainId)}` : '/domains/analysis';

  const [{ data, fetching, error }] = useQuery<
    DomainAnalysisValueDetailQueryResult,
    DomainAnalysisValueDetailQueryVariables
  >({
    query: DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY,
    variables: { domainId, modelId, valueKey },
    pause: domainId === '' || modelId === '' || valueKey === '',
    requestPolicy: 'cache-and-network',
  });

  if (domainId === '' || modelId === '' || valueKey === '') {
    return (
      <div className="space-y-4">
        <ErrorMessage message="Missing parameters. Open this page from a value cell in Domain Analysis." />
        <Link to="/domains/analysis" className="inline-flex text-sm text-sky-700 hover:text-sky-900 hover:underline">
          Back to Domain Analysis
        </Link>
      </div>
    );
  }

  if (fetching) return <Loading size="lg" text="Loading value detail..." />;
  if (error || !data?.domainAnalysisValueDetail) {
    return (
      <div className="space-y-4">
        <ErrorMessage message={`Failed to load value detail: ${error?.message ?? 'Unknown error'}`} />
        <Link to={backLink} className="inline-flex text-sm text-sky-700 hover:text-sky-900 hover:underline">
          Back to Domain Analysis
        </Link>
      </div>
    );
  }

  const detail = data.domainAnalysisValueDetail;
  const label = VALUE_LABELS[detail.valueKey as ValueKey] ?? detail.valueKey;
  const mathNumerator = detail.prioritized + 1;
  const mathDenominator = detail.deprioritized + 1;
  const ratio = mathDenominator === 0 ? 0 : mathNumerator / mathDenominator;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link to={backLink} className="inline-flex text-sm text-sky-700 hover:text-sky-900 hover:underline">
          ← Back to Domain Analysis
        </Link>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Value Score Detail</h1>
        <p className="text-sm text-gray-600">
          {detail.modelLabel} · {label} · {detail.domainName}
        </p>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-base font-medium text-gray-900">1. How This Score Is Calculated</h2>
        <p className="mt-1 text-sm text-gray-600">
          We compare how often this value wins vs. loses across all relevant vignettes. Neutral outcomes are tracked, but the score
          itself uses wins and losses.
        </p>
        <div className="mt-3 grid gap-2 text-sm text-gray-700 md:grid-cols-2">
          <div className="rounded border border-gray-200 bg-gray-50 p-2">Wins (prioritized): {detail.prioritized}</div>
          <div className="rounded border border-gray-200 bg-gray-50 p-2">Losses (deprioritized): {detail.deprioritized}</div>
          <div className="rounded border border-gray-200 bg-gray-50 p-2">Neutral: {detail.neutral}</div>
          <div className="rounded border border-gray-200 bg-gray-50 p-2">Total trials: {detail.totalTrials}</div>
        </div>
        <div className="mt-3 rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <p className="font-medium">Formula (high-school version)</p>
          <p className="mt-1">Score = ln((wins + 1) / (losses + 1))</p>
          <p className="mt-1">
            Score = ln(({detail.prioritized} + 1) / ({detail.deprioritized} + 1)) = ln({ratio.toFixed(4)}) ={' '}
            {detail.score.toFixed(4)}
          </p>
          <p className="mt-1 text-xs text-sky-800">
            Positive score means this value is favored more often. Negative means it loses more often. Around 0 means close to even.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-base font-medium text-gray-900">2. Vignette Condition Tables ({label})</h2>
        <p className="mt-1 text-sm text-gray-600">
          Each table is one vignette containing this value, filtered to {detail.modelLabel}.
        </p>
        <div className="mt-4 space-y-4">
          {detail.vignettes.length === 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              No transcript data found for this model/value in the selected domain.
            </div>
          )}
          {detail.vignettes.map((vignette) => (
            <article key={vignette.definitionId} className="rounded border border-gray-200">
              <header className="border-b border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-sm font-medium text-gray-900">
                  {vignette.definitionName} (v{vignette.definitionVersion})
                </p>
                <p className="text-xs text-gray-600">
                  Pair: {label} vs {VALUE_LABELS[vignette.otherValueKey as ValueKey] ?? vignette.otherValueKey} · Trials:{' '}
                  {vignette.totalTrials} · Win rate: {toPercent(vignette.selectedValueWinRate)}
                </p>
              </header>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600">
                      <th className="px-2 py-2 text-left font-medium">Condition</th>
                      <th className="px-2 py-2 text-right font-medium">Trials</th>
                      <th className="px-2 py-2 text-right font-medium">{label} Wins</th>
                      <th className="px-2 py-2 text-right font-medium">Other Wins</th>
                      <th className="px-2 py-2 text-right font-medium">Neutral</th>
                      <th className="px-2 py-2 text-right font-medium">Win Rate</th>
                      <th className="px-2 py-2 text-right font-medium">Avg Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vignette.conditions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-2 py-3 text-center text-gray-500">
                          No condition-level trials available.
                        </td>
                      </tr>
                    )}
                    {vignette.conditions.map((condition) => (
                      <tr key={condition.scenarioId ?? condition.conditionName} className="border-b border-gray-100">
                        <td className="px-2 py-2 text-gray-900">{condition.conditionName}</td>
                        <td className="px-2 py-2 text-right text-gray-800">{condition.totalTrials}</td>
                        <td className="px-2 py-2 text-right text-emerald-700">{condition.prioritized}</td>
                        <td className="px-2 py-2 text-right text-rose-700">{condition.deprioritized}</td>
                        <td className="px-2 py-2 text-right text-gray-700">{condition.neutral}</td>
                        <td className="px-2 py-2 text-right text-gray-800">{toPercent(condition.selectedValueWinRate)}</td>
                        <td className="px-2 py-2 text-right text-gray-800">
                          {condition.meanDecisionScore === null ? '-' : condition.meanDecisionScore.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
