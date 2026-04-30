import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useQuery } from 'urql';
import { Button } from '../ui/Button';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Loading } from '../ui/Loading';
import { TranscriptList } from '../runs/TranscriptList';
import { TranscriptViewer } from '../runs/TranscriptViewer';
import type { Transcript } from '../../api/operations/runs';
import {
  CONFIDENCE_TRANSCRIPTS_QUERY,
  type ConfidenceTranscript,
  type ConfidenceTranscriptsQueryResult,
  type ConfidenceTranscriptsQueryVariables,
} from '../../api/operations/confidenceTranscripts';
import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';

type ConfidenceTranscriptsDrawerProps = {
  open: boolean;
  modelId: string;
  modelLabel: string;
  valueKey: string | null;
  signature: string;
  onClose: () => void;
};

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

export function ConfidenceTranscriptsDrawer({
  open,
  modelId,
  modelLabel,
  valueKey,
  signature,
  onClose,
}: ConfidenceTranscriptsDrawerProps) {
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);

  const valueLabel = valueKey != null ? (VALUE_LABELS[valueKey as ValueKey] ?? valueKey) : '';

  const [{ data, fetching, error }] = useQuery<ConfidenceTranscriptsQueryResult, ConfidenceTranscriptsQueryVariables>({
    query: CONFIDENCE_TRANSCRIPTS_QUERY,
    variables: { modelId, valueKey: valueKey ?? '', signature, limit: 200 },
    pause: !open || valueKey == null,
    requestPolicy: 'cache-and-network',
  });

  useEffect(() => {
    if (!open) {
      setSelectedTranscript(null);
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    setSelectedTranscript(null);
  }, [modelId, valueKey, signature]);

  const transcripts = useMemo(
    () => ((data?.confidenceTranscripts ?? []) as ConfidenceTranscript[]).map(mapToTranscript),
    [data],
  );

  if (!open || valueKey == null) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-900">
              {modelLabel} — {valueLabel}
            </h2>
            <p className="text-sm text-gray-600">
              {fetching && data == null ? 'Loading…' : `${transcripts.length} transcript${transcripts.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close transcripts drawer">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {fetching && data == null ? (
            <Loading />
          ) : error != null ? (
            <ErrorMessage message={error.message} />
          ) : transcripts.length === 0 ? (
            <p className="text-sm text-gray-500">No transcripts found.</p>
          ) : (
            <TranscriptList
              transcripts={transcripts}
              onSelect={setSelectedTranscript}
              groupByModel={false}
              decisionDisplayMode="audit"
            />
          )}
        </div>

        {selectedTranscript != null && (
          <TranscriptViewer
            transcript={selectedTranscript}
            onClose={() => setSelectedTranscript(null)}
            decisionDisplayMode="audit"
          />
        )}
      </aside>
    </div>,
    document.body,
  );
}
