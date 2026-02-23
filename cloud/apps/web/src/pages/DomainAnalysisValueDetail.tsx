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

function getHeatmapColor(value: number): string {
  if (value < 1 || value > 5) return 'rgba(243, 244, 246, 0.8)';
  if (value <= 2.5) {
    const intensity = Math.max(0.1, (3 - value) / 2);
    return `rgba(59, 130, 246, ${intensity * 0.3})`;
  }
  if (value >= 3.5) {
    const intensity = Math.max(0.1, (value - 3) / 2);
    return `rgba(249, 115, 22, ${intensity * 0.3})`;
  }
  return 'rgba(156, 163, 175, 0.15)';
}

function getScoreTextColor(value: number): string {
  if (value <= 2.5) return 'text-blue-700';
  if (value >= 3.5) return 'text-orange-700';
  return 'text-gray-600';
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
          <h2 className="text-base font-medium text-gray-900">Score Method (Smoothed Log-Odds)</h2>
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
        <h2 className="text-base font-medium text-gray-900">Vignette Condition Tables ({label})</h2>
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
            <article key={vignette.definitionId} className="rounded border border-gray-200 bg-white">
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
              {vignette.conditions.length === 0 ? (
                <div className="px-3 py-3 text-center text-xs text-gray-500">No condition-level trials available.</div>
              ) : (
                <div className="space-y-3 px-3 py-3">
                  {(() => {
                    const dimensions = Array.from(
                      new Set(
                        vignette.conditions.flatMap((condition) =>
                          Object.keys(condition.dimensions ?? {}),
                        ),
                      ),
                    ).sort();

                    if (dimensions.length < 2) {
                      return (
                        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Scenario dimensions are missing for this vignette, so pivot matrix rendering is unavailable.
                        </div>
                      );
                    }

                    const rowDim = dimensions[0]!;
                    const colDim = dimensions[1]!;
                    const rows = Array.from(
                      new Set(vignette.conditions.map((condition) => String(condition.dimensions?.[rowDim] ?? 'N/A'))),
                    ).sort();
                    const cols = Array.from(
                      new Set(vignette.conditions.map((condition) => String(condition.dimensions?.[colDim] ?? 'N/A'))),
                    ).sort();

                    const cellByKey = new Map<string, (typeof vignette.conditions)[number]>();
                    for (const condition of vignette.conditions) {
                      const rowValue = String(condition.dimensions?.[rowDim] ?? 'N/A');
                      const colValue = String(condition.dimensions?.[colDim] ?? 'N/A');
                      cellByKey.set(`${rowValue}::${colValue}`, condition);
                    }

                    return (
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-xs">
                          <thead>
                            <tr>
                              <th className="border border-gray-200 border-b-0 bg-gray-50 p-2" />
                              <th
                                colSpan={cols.length}
                                className="border border-gray-200 bg-gray-100 p-2 text-center text-xs font-bold uppercase text-gray-700"
                              >
                                {colDim}
                              </th>
                            </tr>
                            <tr>
                              <th className="w-32 border border-gray-200 bg-gray-100 p-2 text-left text-xs font-bold uppercase text-gray-700">
                                {rowDim}
                              </th>
                              {cols.map((col) => (
                                <th
                                  key={col}
                                  className="border border-gray-200 bg-gray-50 p-2 text-center font-mono text-xs font-medium text-gray-500"
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr key={row}>
                                <td className="whitespace-nowrap border border-gray-200 bg-gray-50 p-2 font-mono text-sm font-bold text-gray-900">
                                  {row}
                                </td>
                                {cols.map((col) => {
                                  const condition = cellByKey.get(`${row}::${col}`);
                                  const mean = condition?.meanDecisionScore ?? null;
                                  const conditionKey = condition
                                    ? `${vignette.definitionId}:${condition.scenarioId ?? '__unknown__'}`
                                    : '';
                                  const isSelected = condition != null && selectedConditionKey === conditionKey;

                                  return (
                                    <td
                                      key={`${row}-${col}`}
                                      className={`border border-gray-100 p-3 text-center text-sm transition-colors ${
                                        condition ? 'cursor-pointer hover:ring-1 hover:ring-sky-300' : ''
                                      } ${isSelected ? 'ring-1 ring-sky-400' : ''}`}
                                      style={{ backgroundColor: mean == null ? undefined : getHeatmapColor(mean) }}
                                      onClick={() => {
                                        if (!condition) return;
                                        handleConditionClick(vignette.definitionId, condition.conditionName, condition.scenarioId);
                                      }}
                                      title={condition?.conditionName ?? 'No condition'}
                                    >
                                      {mean == null ? (
                                        <span className="text-gray-400">-</span>
                                      ) : (
                                        <span className={`font-semibold ${getScoreTextColor(mean)}`}>{mean.toFixed(2)}</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="mt-2 text-xs text-gray-500">
                          Click a colored cell to load condition transcripts below.
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
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
