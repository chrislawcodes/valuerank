import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from 'urql';
import { CheckCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Loading } from '../ui/Loading';
import { Modal } from '../ui/Modal';
import { TranscriptViewer } from '../runs/TranscriptViewer';
import type { Transcript } from '../../api/operations/runs';
import { RUN_QUERY, type RunQueryResult, type RunQueryVariables } from '../../api/operations/runs';
import {
  OPEN_RUN_ANOMALIES_QUERY,
  type OpenRunAnomaliesQueryResult,
  type OpenRunAnomaliesQueryVariables,
  type OpenRunAnomaly,
  type RunAnomalyType,
} from '../../api/operations/run-anomaly';
import { AnomalyRow } from './AnomalyRow';

type OpenAnomaliesSectionProps = {
  domainId?: string | null;
  type?: string | null;
  pollIntervalMs?: number;
};

type SelectedTranscriptTarget = {
  runId: string;
  transcriptId: string;
};

const VALID_ANOMALY_TYPES: RunAnomalyType[] = [
  'INVALID_RESPONSE_FAILURE',
  'MODEL_TRANSCRIPT_SHORTFALL',
  'ORPHAN_TRANSCRIPT',
  'SCHEDULED_COUNT_MISMATCH',
  'STRANDED_TRANSCRIPT',
  'SUMMARIZING_STALL',
];

function isRunAnomalyType(value: string | null | undefined): value is RunAnomalyType {
  if (value == null) {
    return false;
  }
  return VALID_ANOMALY_TYPES.includes(value as RunAnomalyType);
}

function formatRunAnomalyCount(count: number): string {
  return count === 1 ? 'Open Anomalies (1)' : `Open Anomalies (${count})`;
}

function formatQueryError(message: string): string {
  return `Failed to load open anomalies: ${message}`;
}

export function OpenAnomaliesSection({
  domainId,
  type,
  pollIntervalMs = 5000,
}: OpenAnomaliesSectionProps) {
  const [selectedTranscriptTarget, setSelectedTranscriptTarget] = useState<SelectedTranscriptTarget | null>(null);

  const anomalyType = isRunAnomalyType(type) ? type : null;
  const normalizedDomainId = domainId != null && domainId.trim() !== '' ? domainId : null;

  const [result, reexecuteQuery] = useQuery<OpenRunAnomaliesQueryResult, OpenRunAnomaliesQueryVariables>({
    query: OPEN_RUN_ANOMALIES_QUERY,
    variables: {
      domainId: normalizedDomainId,
      type: anomalyType,
    },
    requestPolicy: 'network-only',
  });

  const [runResult, reexecuteRunQuery] = useQuery<RunQueryResult, RunQueryVariables>({
    query: RUN_QUERY,
    variables: { id: selectedTranscriptTarget?.runId ?? '' },
    pause: selectedTranscriptTarget == null,
    requestPolicy: 'cache-and-network',
  });

  // The backend returns openRunAnomalies ordered by firstSeenAt DESC. Preserve that
  // order — re-sorting client-side (e.g. by lastSeenAt) makes rows jump around as
  // the detector refreshes lastSeenAt on every reconciliation tick.
  const openAnomalies: OpenRunAnomaly[] = useMemo(
    () => result.data?.openRunAnomalies ?? [],
    [result.data?.openRunAnomalies]
  );

  const selectedRun = runResult.data?.run ?? null;
  const selectedTranscript: Transcript | null = useMemo(() => {
    if (selectedTranscriptTarget == null || selectedRun == null) {
      return null;
    }
    return selectedRun.transcripts.find((transcript) => transcript.id === selectedTranscriptTarget.transcriptId) ?? null;
  }, [selectedRun, selectedTranscriptTarget]);

  const hasAnomalies = openAnomalies.length > 0;
  const isInitialLoading = result.fetching && result.data == null;
  const isRefreshing = result.fetching && result.data != null;

  // Collapse when we know there are no anomalies and no error to display.
  if (!isInitialLoading && result.error == null && !hasAnomalies) {
    return null;
  }

  // Track in-flight state via a ref so the interval callback always sees the latest
  // value without restarting on every render. This prevents overlapping fetches if
  // the network is slow enough that one request hasn't returned by the next tick.
  const isFetchingRef = useRef(result.fetching);
  useEffect(() => {
    isFetchingRef.current = result.fetching;
  }, [result.fetching]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (isFetchingRef.current) {
        // Skip this tick — a previous request is still in flight. The next interval
        // will retry once it returns. Keeps requests from piling up under load.
        return;
      }
      reexecuteQuery({ requestPolicy: 'network-only' });
    }, pollIntervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [pollIntervalMs, reexecuteQuery]);

  useEffect(() => {
    if (selectedTranscriptTarget == null) {
      return;
    }
    reexecuteRunQuery({ requestPolicy: 'cache-and-network' });
  }, [reexecuteRunQuery, selectedTranscriptTarget]);

  const sectionToneClasses = hasAnomalies
    ? 'rounded-lg border border-amber-300 bg-amber-50'
    : 'rounded-lg border border-gray-200 bg-white';

  return (
    <>
      <section className={sectionToneClasses}>
        <div className="px-6 py-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className={`text-lg font-medium ${hasAnomalies ? 'text-amber-900' : 'text-gray-900'}`}>
                {formatRunAnomalyCount(openAnomalies.length)}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {isRefreshing && (
                <span className="text-xs font-medium text-gray-500">Refreshing…</span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => reexecuteQuery({ requestPolicy: 'network-only' })}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          {result.error && (
            <ErrorMessage
              message={formatQueryError(result.error.message)}
              onRetry={() => reexecuteQuery({ requestPolicy: 'network-only' })}
            />
          )}

          {isInitialLoading ? (
            <div className="space-y-3">
              <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4">
                <div className="space-y-3">
                  <div className="h-4 w-40 rounded bg-gray-200" />
                  <div className="grid grid-cols-7 gap-3">
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                  </div>
                  <div className="grid grid-cols-7 gap-3">
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                  </div>
                  <div className="grid grid-cols-7 gap-3">
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                    <div className="h-4 rounded bg-gray-100" />
                  </div>
                </div>
              </div>
            </div>
          ) : hasAnomalies ? (
            <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
              <table className="min-w-full divide-y divide-amber-200">
                <thead className="bg-amber-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-amber-900">
                      Domain
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-amber-900">
                      Vignette
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-amber-900">
                      Type
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-amber-900">
                      Model
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-amber-900">
                      Strength of First Value
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-amber-900">
                      Strength of Second Value
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-amber-900">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {openAnomalies.map((anomaly) => (
                    <AnomalyRow
                      key={anomaly.id}
                      anomaly={anomaly}
                      tone="amber"
                      onViewTranscript={({ runId, transcriptId }) => {
                        setSelectedTranscriptTarget({ runId, transcriptId });
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
              <CheckCircle className="mx-auto h-10 w-10 text-green-500" />
              <p className="mt-3 text-sm font-medium text-gray-900">No open anomalies.</p>
              <p className="mt-1 text-sm text-gray-500">
                The latest reconciliation sweep did not find any open issues.
              </p>
            </div>
          )}
        </div>
      </section>

      {selectedTranscriptTarget != null && selectedTranscript == null && runResult.fetching && (
        <Modal
          isOpen
          onClose={() => setSelectedTranscriptTarget(null)}
          title="Transcript"
          size="md"
          footer={(
            <Button type="button" variant="ghost" onClick={() => setSelectedTranscriptTarget(null)}>
              Close
            </Button>
          )}
        >
          <Loading text="Loading transcript..." />
        </Modal>
      )}

      {selectedTranscriptTarget != null && selectedTranscript == null && runResult.error != null && (
        <Modal
          isOpen
          onClose={() => setSelectedTranscriptTarget(null)}
          title="Transcript"
          size="md"
          footer={(
            <Button type="button" variant="ghost" onClick={() => setSelectedTranscriptTarget(null)}>
              Close
            </Button>
          )}
        >
          <ErrorMessage message={`Failed to load transcript: ${runResult.error.message}`} />
        </Modal>
      )}

      {selectedTranscriptTarget != null && selectedTranscript != null && (
        <TranscriptViewer
          transcript={selectedTranscript}
          onClose={() => setSelectedTranscriptTarget(null)}
        />
      )}

      {selectedTranscriptTarget != null && selectedTranscript == null && !runResult.fetching && runResult.error == null && selectedRun != null && (
        <Modal
          isOpen
          onClose={() => setSelectedTranscriptTarget(null)}
          title="Transcript"
          size="md"
          footer={(
            <Button type="button" variant="ghost" onClick={() => setSelectedTranscriptTarget(null)}>
              Close
            </Button>
          )}
        >
          <ErrorMessage message="Transcript not found for this anomaly." />
        </Modal>
      )}

      {selectedTranscriptTarget != null && selectedTranscript == null && !runResult.fetching && runResult.error == null && selectedRun == null && (
        <Modal
          isOpen
          onClose={() => setSelectedTranscriptTarget(null)}
          title="Transcript"
          size="md"
          footer={(
            <Button type="button" variant="ghost" onClick={() => setSelectedTranscriptTarget(null)}>
              Close
            </Button>
          )}
        >
          <ErrorMessage message="Run not found for this anomaly." />
        </Modal>
      )}
    </>
  );
}
