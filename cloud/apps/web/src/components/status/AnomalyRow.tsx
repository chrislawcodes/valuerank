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
  const reprobeTimerRef = useRef<number | null>(null);
  const resolveTimerRef = useRef<number | null>(null);
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
      if (reprobeTimerRef.current != null) {
        window.clearTimeout(reprobeTimerRef.current);
      }
      if (resolveTimerRef.current != null) {
        window.clearTimeout(resolveTimerRef.current);
      }
    };
  }, []);

  const handleOpenReprobeModal = () => {
    setErrorMessage(null);
    setIsReprobeModalOpen(true);
  };

  const handleConfirmReprobe = async () => {
    setIsReprobeModalOpen(false);
    setErrorMessage(null);
    setIsReprobing(true);

    try {
      const result = await reprobeAnomalySlot({ anomalyId: anomaly.id });
      if (!isMountedRef.current) {
        return;
      }
      if (result.error) {
        setIsReprobing(false);
        setErrorMessage(result.error.message);
        return;
      }

      if (reprobeTimerRef.current != null) {
        window.clearTimeout(reprobeTimerRef.current);
      }
      reprobeTimerRef.current = window.setTimeout(() => {
        setIsReprobing(false);
        reprobeTimerRef.current = null;
      }, 5000);
    } catch (error) {
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

      if (resolveTimerRef.current != null) {
        window.clearTimeout(resolveTimerRef.current);
      }
      resolveTimerRef.current = window.setTimeout(() => {
        setIsResolving(false);
        resolveTimerRef.current = null;
      }, 5000);
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

        return (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleOpenReprobeModal}
            disabled={disabled}
            title={title}
          >
            {isReprobing ? 'Re-probing…' : 'Re-probe'}
          </Button>
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
