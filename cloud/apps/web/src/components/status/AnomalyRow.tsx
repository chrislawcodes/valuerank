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

const LEVEL_WORD_TO_NUMBER: Record<string, number> = {
  full: 5,
  substantial: 4,
  moderate: 3,
  minimal: 2,
  negligible: 1,
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

function extractFirstTranscriptId(details: unknown): string | null {
  if (!isRecord(details)) return null;
  const ids = details.transcriptIds;
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const first = ids[0];
  return typeof first === 'string' && first.trim() !== '' ? first : null;
}

function formatStrengthLevel(value: string): string {
  const lower = value.toLowerCase();
  const num = LEVEL_WORD_TO_NUMBER[lower];
  const display = value.charAt(0).toUpperCase() + value.slice(1);
  return num != null ? `${num} - ${display}` : display;
}

function extractStrengthPair(dimensionValues: unknown): [string, string] {
  if (!isRecord(dimensionValues)) return ['—', '—'];
  const entries = Object.entries(dimensionValues);
  const first = entries[0] != null ? formatStrengthLevel(String(entries[0][1])) : '—';
  const second = entries[1] != null ? formatStrengthLevel(String(entries[1][1])) : '—';
  return [first, second];
}

function formatDimensionKey(key: string): string {
  return key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatValuePair(dimensionValues: unknown): string | null {
  if (!isRecord(dimensionValues)) return null;
  const keys = Object.keys(dimensionValues);
  if (keys.length === 0) return null;
  return keys.map(formatDimensionKey).join(' / ');
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
      // Prefer activeTranscriptId (latest for the slot) — handles reprobe-fixed rows
      // where details.transcriptId still points to the original transcript.
      return anomaly.activeTranscriptId ?? extractTranscriptId(anomaly.details);
    }
    if (anomaly.type === 'STRANDED_TRANSCRIPT') {
      return extractFirstTranscriptId(anomaly.details) ?? anomaly.subject;
    }
    if (anomaly.type === 'ORPHAN_TRANSCRIPT') {
      return anomaly.subject;
    }
    return null;
  }, [anomaly.activeTranscriptId, anomaly.details, anomaly.subject, anomaly.type]);

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

  const modelId = isRecord(anomaly.details) && typeof anomaly.details.modelId === 'string'
    ? anomaly.details.modelId
    : null;
  const vignetteLabel = formatValuePair(anomaly.dimensionValues) ?? '—';
  const [firstStrength, secondStrength] = extractStrengthPair(anomaly.dimensionValues);

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
        const { reprobeStage } = anomaly;

        // Active pipeline stage: show spinner + label, disable Re-probe.
        if (reprobeStage != null && reprobeStage !== 'fixed') {
          const stageLabel: Record<string, string> = {
            probing: 'Probing…',
            summarizing: 'Summarizing…',
            analyzing: 'Analyzing…',
            aggregating: 'Aggregating…',
          };
          const label = stageLabel[reprobeStage] ?? `${reprobeStage}…`;
          return (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
              <span
                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500"
                aria-hidden="true"
              />
              {label}
            </span>
          );
        }

        // Fixed: pipeline complete, waiting for user to resolve.
        if (reprobeStage === 'fixed') {
          return (
            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
              Fixed ✓
            </span>
          );
        }

        const isActivePipeline = isReprobing;
        const disabled = !anomaly.reprobeEligible || anomaly.reprobeLimitReached || isActivePipeline || isResolving;
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
              {isActivePipeline ? 'Re-probing…' : 'Re-probe'}
            </Button>
          </div>
        );
      }
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
        <td className="px-3 py-2 align-middle text-sm text-gray-700">
          <span className="block max-w-[8rem] truncate" title={anomaly.domain?.name ?? undefined}>
            {anomaly.domain?.name ?? '—'}
          </span>
        </td>
        <td className="px-3 py-2 align-middle text-sm text-gray-700">
          <span className="block max-w-[12rem] truncate" title={vignetteLabel !== '—' ? vignetteLabel : undefined}>
            {vignetteLabel}
          </span>
        </td>
        <td className="px-3 py-2 align-middle text-sm text-gray-700">
          <span className="font-medium text-gray-900">{anomaly.displayLabel}</span>
        </td>
        <td className="px-3 py-2 align-middle text-sm text-gray-700">
          <span className="block max-w-[10rem] truncate font-mono text-xs" title={modelId ?? undefined}>
            {modelId ?? '—'}
          </span>
        </td>
        <td className="px-3 py-2 align-middle text-sm text-gray-700 whitespace-nowrap">
          {firstStrength}
        </td>
        <td className="px-3 py-2 align-middle text-sm text-gray-700 whitespace-nowrap">
          {secondStrength}
        </td>
        <td className="px-3 py-2 align-middle text-sm text-gray-700">
          <div className="flex items-center justify-end gap-1.5 flex-nowrap">
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
            <p className="mt-1 text-right text-xs text-red-600">
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
