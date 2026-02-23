import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { TranscriptViewer } from '../components/runs/TranscriptViewer';
import type { Transcript } from '../api/operations/runs';
import {
  DOMAIN_ANALYSIS_CONDITION_TRANSCRIPTS_QUERY,
  DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY,
  type DomainAnalysisConditionTranscriptsQueryResult,
  type DomainAnalysisConditionTranscriptsQueryVariables,
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
  const [selectedCondition, setSelectedCondition] = useState<{
    definitionId: string;
    conditionName: string;
    scenarioId: string | null;
  } | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);

  const [{ data: transcriptData, fetching: transcriptsFetching, error: transcriptsError }] = useQuery<
    DomainAnalysisConditionTranscriptsQueryResult,
    DomainAnalysisConditionTranscriptsQueryVariables
  >({
    query: DOMAIN_ANALYSIS_CONDITION_TRANSCRIPTS_QUERY,
    variables: {
      domainId,
      modelId,
      valueKey,
      definitionId: selectedCondition?.definitionId ?? '',
      scenarioId: selectedCondition?.scenarioId ?? null,
      limit: 100,
    },
    pause: selectedCondition === null || domainId === '' || modelId === '' || valueKey === '',
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
  const ratio = mathNumerator / mathDenominator;
  const selectedConditionKey = selectedCondition === null ? '' : `${selectedCondition.definitionId}:${selectedCondition.scenarioId ?? '__unknown__'}`;
  const normalizedTranscripts: Transcript[] = (transcriptData?.domainAnalysisConditionTranscripts ?? []).map((transcript) => ({
    id: transcript.id,
    runId: transcript.runId,
    scenarioId: transcript.scenarioId,
    modelId: transcript.modelId,
    modelVersion: null,
    content: transcript.content,
    decisionCode: transcript.decisionCode,
    decisionCodeSource: transcript.decisionCodeSource,
    turnCount: transcript.turnCount,
    tokenCount: transcript.tokenCount,
    durationMs: transcript.durationMs,
    estimatedCost: null,
    createdAt: transcript.createdAt,
    lastAccessedAt: null,
  }));

  const handleConditionClick = (definitionId: string, conditionName: string, scenarioId: string | null) => {
    const clickedKey = `${definitionId}:${scenarioId ?? '__unknown__'}`;
    if (selectedConditionKey === clickedKey) {
      setSelectedCondition(null);
      return;
    }
    setSelectedCondition({ definitionId, conditionName, scenarioId });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link to={backLink} className="inline-flex text-sm text-sky-700 hover:text-sky-900 hover:underline">
          ← Back to Domain Analysis
        </Link>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Value Score Detail</h1>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-gray-600">
            {detail.modelLabel} · {label} · {detail.domainName} · Score:{' '}
            <span className="font-semibold text-gray-900">{detail.score > 0 ? '+' : ''}{detail.score.toFixed(2)}</span>
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowMethodology((current) => !current)}
          >
            {showMethodology ? 'Hide score method' : 'How this score is calculated'}
          </Button>
        </div>
      </div>

      {showMethodology && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-base font-medium text-gray-900">1. Score Method (Smoothed Log-Odds)</h2>
          <p className="mt-1 text-sm text-gray-600">
            We compare how often this value wins vs. loses across relevant vignettes. Neutral outcomes are still shown, but the score
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
            <p className="mt-1">Score = logarithm((wins + 1) / (losses + 1))</p>
            <p className="mt-1 text-xs text-sky-800">
              Here, “logarithm” means the natural logarithm (often written as <code>ln</code>).
            </p>
            <p className="mt-1">
              Score = logarithm(({detail.prioritized} + 1) / ({detail.deprioritized} + 1)) = logarithm({ratio.toFixed(4)}) ={' '}
              {detail.score.toFixed(4)}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-sky-800">
              <li>Name: Smoothed Log-Odds Score.</li>
              <li>It centers “even” results at 0, making interpretation easy.</li>
              <li>It handles very different win/loss counts without the scale exploding.</li>
              <li>The +1 smoothing prevents divide-by-zero when wins or losses are zero.</li>
              <li>Positive values mean favored more often; negative values mean disfavored more often.</li>
            </ul>
          </div>
        </section>
      )}

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
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-gray-900">
                    {vignette.definitionName} (v{vignette.definitionVersion})
                  </p>
                  {vignette.aggregateRunId !== null && (
                    <Link
                      to={`/analysis/${vignette.aggregateRunId}?tab=scenarios`}
                      className="text-xs font-medium text-sky-700 hover:text-sky-900 hover:underline"
                    >
                      Open in Vignette Analysis (Conditions)
                    </Link>
                  )}
                </div>
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
                    {vignette.conditions.map((condition) => {
                      const conditionKey = `${vignette.definitionId}:${condition.scenarioId ?? '__unknown__'}`;
                      const isSelected = selectedConditionKey === conditionKey;
                      return (
                        <tr
                          key={condition.scenarioId ?? condition.conditionName}
                          className={`border-b border-gray-100 ${isSelected ? 'bg-sky-50' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-2 py-2 text-gray-900">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-auto min-h-0 !p-0 text-xs font-medium text-sky-700 hover:text-sky-900 hover:underline"
                              onClick={() => handleConditionClick(vignette.definitionId, condition.conditionName, condition.scenarioId)}
                            >
                              {condition.conditionName}
                            </Button>
                          </td>
                          <td className="px-2 py-2 text-right text-gray-800">{condition.totalTrials}</td>
                          <td className="px-2 py-2 text-right text-emerald-700">{condition.prioritized}</td>
                          <td className="px-2 py-2 text-right text-rose-700">{condition.deprioritized}</td>
                          <td className="px-2 py-2 text-right text-gray-700">{condition.neutral}</td>
                          <td className="px-2 py-2 text-right text-gray-800">{toPercent(condition.selectedValueWinRate)}</td>
                          <td className="px-2 py-2 text-right text-gray-800">
                            {condition.meanDecisionScore === null ? '-' : condition.meanDecisionScore.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {selectedCondition !== null && selectedCondition.definitionId === vignette.definitionId && (
                <div className="border-t border-gray-200 bg-gray-50 px-3 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-gray-800">
                      Transcripts for condition: {selectedCondition.conditionName}
                    </p>
                    <p className="text-[11px] text-gray-500">Click transcript to view full conversation</p>
                  </div>
                  {transcriptsFetching && <Loading size="sm" text="Loading transcripts..." />}
                  {transcriptsError && (
                    <ErrorMessage message={`Failed to load transcripts: ${transcriptsError.message}`} />
                  )}
                  {!transcriptsFetching && !transcriptsError && normalizedTranscripts.length === 0 && (
                    <p className="text-xs text-gray-500">No transcripts found for this condition and model.</p>
                  )}
                  {!transcriptsFetching && !transcriptsError && normalizedTranscripts.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 text-gray-600">
                            <th className="px-2 py-2 text-left font-medium">Transcript</th>
                            <th className="px-2 py-2 text-right font-medium">Decision</th>
                            <th className="px-2 py-2 text-right font-medium">Turns</th>
                            <th className="px-2 py-2 text-right font-medium">Tokens</th>
                            <th className="px-2 py-2 text-right font-medium">Duration</th>
                            <th className="px-2 py-2 text-right font-medium">Created</th>
                            <th className="px-2 py-2 text-right font-medium">Run</th>
                          </tr>
                        </thead>
                        <tbody>
                          {normalizedTranscripts.map((transcript) => (
                            <tr key={transcript.id} className="border-b border-gray-100 hover:bg-white">
                              <td className="px-2 py-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto min-h-0 !p-0 text-xs font-medium text-sky-700 hover:text-sky-900 hover:underline"
                                  onClick={() => setSelectedTranscript(transcript)}
                                >
                                  {transcript.id.slice(0, 10)}...
                                </Button>
                              </td>
                              <td className="px-2 py-2 text-right text-gray-800">{transcript.decisionCode ?? '-'}</td>
                              <td className="px-2 py-2 text-right text-gray-800">{transcript.turnCount}</td>
                              <td className="px-2 py-2 text-right text-gray-800">{transcript.tokenCount.toLocaleString()}</td>
                              <td className="px-2 py-2 text-right text-gray-800">{Math.round(transcript.durationMs / 100) / 10}s</td>
                              <td className="px-2 py-2 text-right text-gray-800">
                                {new Date(transcript.createdAt).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="px-2 py-2 text-right">
                                <Link className="text-sky-700 hover:text-sky-900 hover:underline" to={`/runs/${transcript.runId}`}>
                                  Open
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      {selectedTranscript !== null && (
        <TranscriptViewer transcript={selectedTranscript} onClose={() => setSelectedTranscript(null)} />
      )}
    </div>
  );
}
