import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { TranscriptList } from '../components/runs/TranscriptList';
import { TranscriptViewer } from '../components/runs/TranscriptViewer';
import { ConditionMatrix, type MatrixCondition } from '../components/domains/ConditionMatrix';
import type { Transcript } from '../api/operations/runs';
import {
  CONFIDENCE_VALUE_DETAIL_QUERY,
  type ConfidenceValueDetailQueryResult,
  type ConfidenceValueDetailQueryVariables,
  type ConfidenceValueDetailCondition,
} from '../api/operations/confidenceValueDetail';
import {
  CONFIDENCE_TRANSCRIPTS_QUERY,
  type ConfidenceTranscript,
  type ConfidenceTranscriptsQueryResult,
  type ConfidenceTranscriptsQueryVariables,
} from '../api/operations/confidenceTranscripts';
import { VALUE_LABELS, type ValueKey } from '../data/domainAnalysisData';

function mapToTranscript(t: ConfidenceTranscript): Transcript {
  return {
    id: t.id,
    runId: t.runId,
    scenarioId: t.scenarioId ?? null,
    modelId: t.modelId,
    modelVersion: null,
    content: t.content,
    decisionModelV2: t.decisionModelV2,
    turnCount: t.turnCount,
    tokenCount: t.tokenCount,
    durationMs: t.durationMs,
    estimatedCost: null,
    createdAt: t.createdAt,
    lastAccessedAt: null,
  };
}

function toMatrixCondition(c: ConfidenceValueDetailCondition): MatrixCondition {
  return {
    scenarioId: c.scenarioId ?? null,
    conditionName: c.conditionName,
    dimensions: (c.dimensions as Record<string, string | number> | null) ?? null,
    prioritized: c.prioritized,
    deprioritized: c.deprioritized,
    neutral: c.neutral,
    totalTrials: c.totalTrials,
    unknownCount: c.unknownCount,
    strongly: c.strongly,
    somewhat: c.somewhat,
    opponentSomewhat: c.opponentSomewhat,
    opponentStrongly: c.opponentStrongly,
  };
}

export function ModelsConfidenceValueDetail() {
  const [searchParams] = useSearchParams();
  const modelId = searchParams.get('modelId') ?? '';
  const valueKey = searchParams.get('valueKey') ?? '';
  const signature = searchParams.get('signature') ?? '';
  const modelLabelParam = searchParams.get('modelLabel');

  const backParams = new URLSearchParams();
  if (signature !== '') backParams.set('signature', signature);
  const backLink = `/models/confidence${backParams.size > 0 ? `?${backParams.toString()}` : ''}`;

  const [selectedCondition, setSelectedCondition] = useState<{
    definitionId: string;
    conditionName: string;
    scenarioId: string | null;
  } | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);

  const [{ data, fetching, error }] = useQuery<
    ConfidenceValueDetailQueryResult,
    ConfidenceValueDetailQueryVariables
  >({
    query: CONFIDENCE_VALUE_DETAIL_QUERY,
    variables: {
      modelId,
      valueKey,
      signature: signature !== '' ? signature : undefined,
    },
    pause: modelId === '' || valueKey === '',
    requestPolicy: 'cache-and-network',
  });

  const [{ data: transcriptData, fetching: transcriptsFetching, error: transcriptsError }] =
    useQuery<ConfidenceTranscriptsQueryResult, ConfidenceTranscriptsQueryVariables>({
      query: CONFIDENCE_TRANSCRIPTS_QUERY,
      variables: {
        modelId,
        valueKey,
        signature: signature !== '' ? signature : undefined,
        limit: 100,
        definitionId: selectedCondition?.definitionId ?? undefined,
        scenarioId: selectedCondition?.scenarioId ?? undefined,
      },
      pause: selectedCondition === null || modelId === '' || valueKey === '',
      requestPolicy: 'cache-and-network',
    });

  useEffect(() => {
    setSelectedTranscript(null);
  }, [selectedCondition?.definitionId, selectedCondition?.scenarioId]);

  const detail = data?.confidenceValueDetail ?? null;

  const transcripts = useMemo(
    () =>
      ((transcriptData?.confidenceTranscripts ?? []) as ConfidenceTranscript[]).map(mapToTranscript),
    [transcriptData],
  );

  const valueLabel = VALUE_LABELS[valueKey as ValueKey] ?? valueKey;
  const modelLabel = detail?.modelLabel ?? modelLabelParam ?? modelId;

  const selectedConditionKey =
    selectedCondition === null
      ? ''
      : `${selectedCondition.definitionId}:${selectedCondition.scenarioId ?? '__unknown__'}`;

  const handleConditionClick = (
    definitionId: string,
    conditionName: string,
    scenarioId: string | null,
  ) => {
    const clickedKey = `${definitionId}:${scenarioId ?? '__unknown__'}`;
    if (selectedConditionKey === clickedKey) {
      setSelectedCondition(null);
      return;
    }
    setSelectedCondition({ definitionId, conditionName, scenarioId });
  };

  if (modelId === '' || valueKey === '') {
    return (
      <div className="space-y-4">
        <ErrorMessage message="Missing parameters. Open this page from a confidence heatmap cell." />
        <Link
          to="/models/confidence"
          className="inline-flex text-sm text-sky-700 hover:text-sky-900 hover:underline"
        >
          Back to Confidence Heatmap
        </Link>
      </div>
    );
  }

  if (fetching && data == null) return <Loading size="lg" text="Loading detail…" />;

  if (error != null || detail == null) {
    return (
      <div className="space-y-4">
        <ErrorMessage
          message={`Failed to load confidence detail: ${error?.message ?? 'Unknown error'}`}
        />
        <Link
          to={backLink}
          className="inline-flex text-sm text-sky-700 hover:text-sky-900 hover:underline"
        >
          ← Back to Confidence Heatmap
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          to={backLink}
          className="inline-flex text-sm text-sky-700 hover:text-sky-900 hover:underline"
        >
          ← Back to Confidence Heatmap
        </Link>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Confidence Detail</h1>
        <p className="text-sm text-gray-600">
          {modelLabel} · {valueLabel}
        </p>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-base font-medium text-gray-900">
          Vignette Condition Tables ({valueLabel})
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Each table is one vignette containing this value, filtered to {modelLabel}.
        </p>
        <div className="mt-4 space-y-4">
          {detail.vignettes.length === 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              No transcript data found for this model and value.
            </div>
          )}
          {detail.vignettes.map((vignette) => {
            const otherLabel = VALUE_LABELS[vignette.otherValueKey as ValueKey] ?? vignette.otherValueKey;
            const matrixConditions = vignette.conditions.map(toMatrixCondition);
            return (
              <article
                key={vignette.definitionId}
                className="rounded border border-gray-200 bg-white"
              >
                <header className="border-b border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">
                    {vignette.definitionName} (v{vignette.definitionVersion})
                  </p>
                  <p className="text-xs text-gray-600">
                    Pair:{' '}
                    <strong className="font-semibold text-blue-700">{valueLabel}</strong> vs{' '}
                    <strong className="font-semibold text-orange-700">{otherLabel}</strong>
                    {' '}· Trials: {vignette.totalTrials}
                  </p>
                </header>
                {matrixConditions.length === 0 ? (
                  <div className="px-3 py-3 text-center text-xs text-gray-500">
                    No condition-level trials available.
                  </div>
                ) : (
                  <div className="space-y-3 px-3 py-3">
                    <ConditionMatrix
                      vignetteId={vignette.definitionId}
                      conditions={matrixConditions}
                      selectedConditionKey={selectedConditionKey}
                      onSelect={handleConditionClick}
                    />
                  </div>
                )}
                {selectedCondition !== null &&
                  selectedCondition.definitionId === vignette.definitionId && (
                    <div className="border-t border-gray-200 bg-gray-50 px-3 py-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-medium text-gray-800">
                          Transcripts for condition: {selectedCondition.conditionName}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          Click transcript to view full conversation
                        </p>
                      </div>
                      {transcriptsFetching && (
                        <Loading size="sm" text="Loading transcripts…" />
                      )}
                      {transcriptsError != null && (
                        <ErrorMessage
                          message={`Failed to load transcripts: ${transcriptsError.message}`}
                        />
                      )}
                      {!transcriptsFetching &&
                        transcriptsError == null &&
                        transcripts.length === 0 && (
                          <p className="text-xs text-gray-500">
                            No transcripts found for this condition and model.
                          </p>
                        )}
                      {!transcriptsFetching &&
                        transcriptsError == null &&
                        transcripts.length > 0 && (
                          <TranscriptList
                            transcripts={transcripts}
                            onSelect={setSelectedTranscript}
                            groupByModel={false}
                            decisionDisplayMode="audit"
                          />
                        )}
                    </div>
                  )}
              </article>
            );
          })}
        </div>
      </section>

      {selectedTranscript !== null && (
        <TranscriptViewer
          transcript={selectedTranscript}
          onClose={() => setSelectedTranscript(null)}
          decisionDisplayMode="audit"
        />
      )}
    </div>
  );
}
