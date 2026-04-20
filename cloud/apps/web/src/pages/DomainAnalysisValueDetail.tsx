import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { TranscriptList } from '../components/runs/TranscriptList';
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
import { ConditionMatrix } from '../components/domains/ConditionMatrix';

const VALUE_DETAIL_COPY = {
  decisionColumnLabel: 'Decision summary',
} as const;

function toPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

export function DomainAnalysisValueDetail() {
  const [searchParams] = useSearchParams();
  const domainId = searchParams.get('domainId') ?? '';
  const modelId = searchParams.get('modelId') ?? '';
  const valueKey = searchParams.get('valueKey') ?? '';
  const signature = searchParams.get('signature');
  const scoreMethod: 'LOG_ODDS' | 'FULL_BT' = searchParams.get('scoreMethod') === 'FULL_BT' ? 'FULL_BT' : 'LOG_ODDS';
  const backParams = new URLSearchParams();
  if (domainId !== '') backParams.set('domainId', domainId);
  backParams.set('scoreMethod', scoreMethod);
  if (signature !== null && signature !== '') backParams.set('signature', signature);
  const backLink = `/domains/analysis?${backParams.toString()}`;

  const [{ data: scoredData, fetching: scoredFetching, error: scoredError }] = useQuery<
    DomainAnalysisValueDetailQueryResult,
    DomainAnalysisValueDetailQueryVariables
  >({
    query: DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY,
    variables: { domainId, modelId, valueKey, scoreMethod, signature: signature ?? undefined },
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
      signature: signature ?? undefined,
    },
    pause: selectedCondition === null || domainId === '' || modelId === '' || valueKey === '',
    requestPolicy: 'cache-and-network',
  });

  useEffect(() => {
    setSelectedTranscript(null);
  }, [selectedCondition?.definitionId, selectedCondition?.scenarioId]);

  const detail = scoredData?.domainAnalysisValueDetail ?? null;
  const selectedConditionDimensions = useMemo(() => {
    if (detail === null || selectedCondition === null || selectedCondition.scenarioId === null) {
      return undefined;
    }

    for (const vignette of detail.vignettes) {
      if (vignette.definitionId !== selectedCondition.definitionId) {
        continue;
      }

      const condition = vignette.conditions.find((entry) => entry.scenarioId === selectedCondition.scenarioId);
      if (!condition?.dimensions) {
        return undefined;
      }

      return {
        [selectedCondition.scenarioId]: condition.dimensions,
      };
    }

    return undefined;
  }, [detail, selectedCondition]);

  const selectedConditionTranscriptState = useMemo(() => {
    const transcripts: Transcript[] = (transcriptData?.domainAnalysisConditionTranscripts ?? []).map((transcript) => ({
      id: transcript.id,
      runId: transcript.runId,
      scenarioId: transcript.scenarioId,
      modelId: transcript.modelId,
      modelVersion: null,
      content: transcript.content,
      decisionModelV2: transcript.decisionModelV2 ?? null,
      turnCount: transcript.turnCount,
      tokenCount: transcript.tokenCount,
      durationMs: transcript.durationMs,
      estimatedCost: null,
      createdAt: transcript.createdAt,
      lastAccessedAt: null,
    }));

    return { transcripts };
  }, [transcriptData]);

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

  if (scoredFetching) return <Loading size="lg" text="Loading value detail..." />;
  if (scoredError || !detail) {
    return (
      <div className="space-y-4">
        <ErrorMessage message={`Failed to load value detail: ${scoredError?.message ?? 'Unknown error'}`} />
        <Link to={backLink} className="inline-flex text-sm text-sky-700 hover:text-sky-900 hover:underline">
          Back to Domain Analysis
        </Link>
      </div>
    );
  }

  const label = VALUE_LABELS[detail.valueKey as ValueKey] ?? detail.valueKey;
  const mathNumerator = detail.prioritized + 1;
  const mathDenominator = detail.deprioritized + 1;
  const ratio = mathNumerator / mathDenominator;
  const selectedConditionKey = selectedCondition === null ? '' : `${selectedCondition.definitionId}:${selectedCondition.scenarioId ?? '__unknown__'}`;
  const reportDecisionDisplayMode = 'audit' as const;
  const decisionColumnLabel = VALUE_DETAIL_COPY.decisionColumnLabel;

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
          <h2 className="text-base font-medium text-gray-900">
            {scoreMethod === 'FULL_BT' ? 'Score Method (Full Bradley-Terry)' : 'Score Method (Smoothed Log-Odds)'}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {scoreMethod === 'FULL_BT'
              ? 'We fit a full Bradley-Terry model over pairwise value matchups for this AI. The model estimates a latent strength for each value that best explains observed wins and losses.'
              : 'We compare how often this value wins vs. loses across relevant vignettes. Neutral outcomes are still shown, but the score itself uses wins and losses.'}
          </p>
          <div className="mt-3 grid gap-2 text-sm text-gray-700 md:grid-cols-2">
            <div className="rounded border border-gray-200 bg-gray-50 p-2">Wins (prioritized): {detail.prioritized}</div>
            <div className="rounded border border-gray-200 bg-gray-50 p-2">Losses (deprioritized): {detail.deprioritized}</div>
            <div className="rounded border border-gray-200 bg-gray-50 p-2">Neutral: {detail.neutral}</div>
            <div className="rounded border border-gray-200 bg-gray-50 p-2">Total trials: {detail.totalTrials}</div>
          </div>
          <div className="mt-3 rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            <p className="font-medium">Formula (high-school version)</p>
            {scoreMethod === 'FULL_BT' ? (
              <>
                <p className="mt-1">Score = logarithm(estimated BT strength for this value)</p>
                <p className="mt-1 text-xs text-sky-800">
                  The BT model uses all pairwise wins/losses together, then solves for a best-fit strength per value.
                </p>
                <p className="mt-1">
                  Final BT score shown here = {detail.score.toFixed(4)}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-sky-800">
                  <li>Name: Full Bradley-Terry score.</li>
                  <li>Used for pairwise ranking problems where many items compete head-to-head.</li>
                  <li>Better than simple ratios when comparisons form a connected network across values.</li>
                  <li>Strengths are estimated jointly, so each value is calibrated against all others.</li>
                  <li>Positive values indicate above-average latent strength; negative values indicate below-average.</li>
                </ul>
              </>
            ) : (
              <>
                <p className="mt-1">Score = logarithm((wins + 1) / (losses + 1))</p>
                <p className="mt-1 text-xs text-sky-800">
                  Here, “logarithm” means the natural logarithm (often written as <code>ln</code>).
                </p>
                <p className="mt-1">
                  Score = logarithm(({detail.prioritized} + 1) / ({detail.deprioritized} + 1)) = logarithm({ratio.toFixed(4)}) ={' '}
                  {detail.score.toFixed(4)}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-sky-800">
                  <li>Name: Bradley-Terry-style smoothed log-odds approximation.</li>
                  <li>Faster to compute and easy to trace directly from wins/losses.</li>
                  <li>The +1 smoothing avoids divide-by-zero and extreme jumps with sparse data.</li>
                  <li>Log scaling controls extreme ratios so one matchup does not dominate.</li>
                  <li>Positive values mean favored more often; negative values mean disfavored more often.</li>
                </ul>
              </>
            )}
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
                  Pair:{' '}
                  <strong className="font-semibold text-blue-700">{label}</strong> vs{' '}
                  <strong className="font-semibold text-orange-700">{VALUE_LABELS[vignette.otherValueKey as ValueKey] ?? vignette.otherValueKey}</strong>{' '}
                  · Trials: {vignette.totalTrials} · Win rate: {toPercent(vignette.selectedValueWinRate)}
                </p>
              </header>
              {vignette.conditions.length === 0 ? (
                <div className="px-3 py-3 text-center text-xs text-gray-500">No condition-level trials available.</div>
              ) : (
                <div className="space-y-3 px-3 py-3">
                  <ConditionMatrix
                    vignetteId={vignette.definitionId}
                    conditions={vignette.conditions}
                    selectedConditionKey={selectedConditionKey}
                    onSelect={handleConditionClick}
                  />
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
                  {!transcriptsFetching && !transcriptsError && selectedConditionTranscriptState.transcripts.length === 0 && (
                    <p className="text-xs text-gray-500">No transcripts found for this condition and model.</p>
                  )}
                  {!transcriptsFetching && !transcriptsError && selectedConditionTranscriptState.transcripts.length > 0 && (
                    <TranscriptList
                      transcripts={selectedConditionTranscriptState.transcripts}
                      onSelect={setSelectedTranscript}
                      groupByModel={false}
                      scenarioDimensions={selectedConditionDimensions}
                      decisionColumnLabel={decisionColumnLabel}
                      decisionDisplayMode={reportDecisionDisplayMode}
                    />
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      {selectedTranscript !== null && (
        <TranscriptViewer
          transcript={selectedTranscript}
          onClose={() => setSelectedTranscript(null)}
          decisionDisplayMode={reportDecisionDisplayMode}
        />
      )}
    </div>
  );
}
