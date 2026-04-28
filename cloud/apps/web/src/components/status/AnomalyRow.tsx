import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from 'urql';
import { Button } from '../ui/Button';
import type {
  OpenRunAnomaly,
  ReprobeAnomalySlotMutationResult,
  ReprobeAnomalySlotMutationVariables,
  ResolveRunAnomalyMutationResult,
  ResolveRunAnomalyMutationVariables,
} from '../../api/operations/run-anomaly';
import {
  REPROBE_ANOMALY_SLOT_MUTATION,
  RESOLVE_RUN_ANOMALY_MUTATION,
} from '../../api/operations/run-anomaly';
import { ReprobeConfirmModal } from './ReprobeConfirmModal';

type AnomalyRowProps = {
  anomaly: OpenRunAnomaly;
  tone: 'amber' | 'neutral';
  onViewTranscript: (target: { runId: string; transcriptId: string }) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function extractTranscriptId(details: unknown): string | null {
  if (!isRecord(details)) {
    return null;
  }
  const transcriptId = details.transcriptId;
  return typeof transcriptId === 'string' && transcriptId.trim() !== '' ? transcriptId : null;
}

function formatAge(firstSeenAt: string): string {
  const ageMs = Date.now() - new Date(firstSeenAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs <= 0) {
    return '0s';
  }

  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo`;
  }

  const years = Math.floor(days / 365);
  return `${years}y`;
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function AnomalyRow({ anomaly, tone, onViewTranscript }: AnomalyRowProps) {
  const navigate = useNavigate();
  const [isReprobeModalOpen, setIsReprobeModalOpen] = useState(false);
  const [isReprobing, setIsReprobing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Captures anomaly.reprobeCount at the moment a re-probe mutation fires. The
  // "Re-probing…" UI clears when polling shows reprobeCount has incremented past
  // this baseline — i.e. the backend has actually persisted the new attempt — so
  // the row never re-enables prematurely on slow queues or throttled tabs.
  const reprobeBaselineRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const [, reprobeAnomalySlot] = useMutation<
    ReprobeAnomalySlotMutationResult,
    ReprobeAnomalySlotMutationVariables
  >(REPROBE_ANOMALY_SLOT_MUTATION);
  const [, resolveRunAnomaly] = useMutation<
    ResolveRunAnomalyMutationResult,
    ResolveRunAnomalyMutationVariables
  >(RESOLVE_RUN_ANOMALY_MUTATION);

  const rowHoverClass = tone === 'amber' ? 'hover:bg-amber-100/50' : 'hover:bg-gray-50';
  const transcriptId = useMemo(() => {
    if (anomaly.type === 'INVALID_RESPONSE_FAILURE') {
      return extractTranscriptId(anomaly.details);
    }
    if (anomaly.type === 'STRANDED_TRANSCRIPT' || anomaly.type === 'ORPHAN_TRANSCRIPT') {
      return anomaly.subject;
    }
    return null;
  }, [anomaly.details, anomaly.subject, anomaly.type]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // When the next poll lands and the backend's reprobeCount has incremented past
  // the baseline captured at mutation time, clear the "Re-probing…" state. This
  // keeps the row disabled until the server has actually persisted the new attempt
  // (whereas a fixed timeout would re-enable the button even on backed-up queues).
  useEffect(() => {
    if (
      isReprobing
      && reprobeBaselineRef.current != null
      && anomaly.reprobeCount > reprobeBaselineRef.current
    ) {
      setIsReprobing(false);
      reprobeBaselineRef.current = null;
    }
  }, [anomaly.reprobeCount, isReprobing]);

  const handleOpenReprobeModal = () => {
    setErrorMessage(null);
    setIsReprobeModalOpen(true);
  };

  const handleConfirmReprobe = async () => {
    setIsReprobeModalOpen(false);
    setErrorMessage(null);
    // Capture the current count BEFORE firing the mutation so the post-poll effect
    // can detect when the backend's count has incremented past this baseline.
    reprobeBaselineRef.current = anomaly.reprobeCount;
    setIsReprobing(true);

    try {
      const result = await reprobeAnomalySlot({ anomalyId: anomaly.id });
      if (!isMountedRef.current) {
        return;
      }
      if (result.error) {
        reprobeBaselineRef.current = null;
        setIsReprobing(false);
        setErrorMessage(result.error.message);
      }
      // On success, the row stays "Re-probing…" until the next poll updates
      // anomaly.reprobeCount past the baseline (handled by the watch effect above).
    } catch (error) {
      reprobeBaselineRef.current = null;
      setIsReprobing(false);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to re-probe anomaly slot');
    }
  };

  const handleResolve = async () => {
    setErrorMessage(null);
    setIsResolving(true);

    try {
      const result = await resolveRunAnomaly({ id: anomaly.id });
      if (!isMountedRef.current) {
        return;
      }
      if (result.error) {
        setIsResolving(false);
        setErrorMessage(result.error.message);
        return;
      }
      // Successfully resolved: the row will drop out of openRunAnomalies on the
      // next poll (filter is resolvedAt IS NULL), at which point this component
      // unmounts and clears its own state. No timer needed.
    } catch (error) {
      setIsResolving(false);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to resolve anomaly');
    }
  };

  const runLabel = anomaly.run.id.slice(0, 8);
  const ageLabel = formatAge(anomaly.firstSeenAt);
  const ageTitle = formatTimestamp(anomaly.firstSeenAt);

  const renderViewTranscriptButton = () => {
    if (anomaly.type === 'INVALID_RESPONSE_FAILURE') {
      if (transcriptId == null) {
        return (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled
            title="no transcript at this slot (probe failed without producing one)"
          >
            View transcript
          </Button>
        );
      }

      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onViewTranscript({ runId: anomaly.runId, transcriptId })}
        >
          View transcript
        </Button>
      );
    }

    if (anomaly.type === 'STRANDED_TRANSCRIPT' || anomaly.type === 'ORPHAN_TRANSCRIPT') {
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onViewTranscript({ runId: anomaly.runId, transcriptId: transcriptId ?? anomaly.subject })}
        >
          View transcript
        </Button>
      );
    }

    return null;
  };

  const renderPrimaryAction = () => {
    switch (anomaly.type) {
      case 'INVALID_RESPONSE_FAILURE': {
        const disabled = !anomaly.reprobeEligible || anomaly.reprobeLimitReached || isReprobing || isResolving;
        const title = anomaly.reprobeLimitReached
          ? 'This slot has been re-probed 3 times. Use [Resolve] to close manually; if the underlying issue persists, the next sweep will re-create the anomaly.'
          : (!anomaly.reprobeEligible ? 'This slot cannot be re-probed.' : undefined);
        const limitReachedDescriptionId = `reprobe-limit-${anomaly.id}`;

        return (
          <div className="flex items-center gap-2">
            {anomaly.reprobeLimitReached && (
              <span
                id={limitReachedDescriptionId}
                role="note"
                className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
              >
                Limit reached
              </span>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleOpenReprobeModal}
              disabled={disabled}
              title={title}
              aria-describedby={anomaly.reprobeLimitReached ? limitReachedDescriptionId : undefined}
            >
              {isReprobing ? 'Re-probing…' : 'Re-probe'}
            </Button>
          </div>
        );
      }
      case 'PAIR_ASYMMETRY':
        return (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/runs/${anomaly.runId}`)}
          >
            View pair
          </Button>
        );
      case 'SUMMARIZING_STALL':
      case 'MODEL_TRANSCRIPT_SHORTFALL':
      case 'SCHEDULED_COUNT_MISMATCH':
        return (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/runs/${anomaly.runId}`)}
          >
            View run
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <tr className={rowHoverClass}>
        <td className="px-4 py-3 align-top text-sm text-gray-700">
          {anomaly.domain?.name ?? '—'}
        </td>
        <td className="px-4 py-3 align-top text-sm text-gray-700">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/runs/${anomaly.run.id}`)}
            className="px-0 text-left font-mono text-sm text-teal-700 hover:bg-transparent hover:text-teal-800"
            title={anomaly.run.id}
          >
            {runLabel}
          </Button>
        </td>
        <td className="px-4 py-3 align-top text-sm text-gray-700">
          <span className="font-medium text-gray-900">{anomaly.displayLabel}</span>
        </td>
        <td className="px-4 py-3 align-top text-sm text-gray-700">
          <span className="block max-w-[20rem] truncate" title={anomaly.displaySubject}>
            {anomaly.displaySubject}
          </span>
        </td>
        <td className="px-4 py-3 align-top text-sm text-gray-700">
          <span title={ageTitle} className="whitespace-nowrap">
            {ageLabel}
          </span>
        </td>
        <td className="px-4 py-3 align-top text-sm text-gray-700">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {renderPrimaryAction()}
            {renderViewTranscriptButton()}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleResolve}
              disabled={isResolving || isReprobing}
            >
              {isResolving ? 'Resolving…' : 'Resolve'}
            </Button>
          </div>
          {errorMessage && (
            <p className="mt-2 max-w-xs text-right text-xs text-red-600">
              {errorMessage}
            </p>
          )}
        </td>
      </tr>

      <ReprobeConfirmModal
        isOpen={isReprobeModalOpen}
        estimatedCost={anomaly.estimatedCost}
        onCancel={() => setIsReprobeModalOpen(false)}
        onConfirm={() => {
          void handleConfirmReprobe();
        }}
      />
    </>
  );
}
