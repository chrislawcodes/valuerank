/**
 * SummarizationControls Component
 *
 * Provides cancel/restart controls for the summarization phase.
 * Shows appropriate buttons based on run status with loading states.
 */

import { useState } from 'react';
import { StopCircle, RefreshCw, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { type RunStatus, type RunProgress } from '../../api/operations/runs';

export type SummarizationControlsProps = {
  runId: string;
  status: RunStatus;
  summarizeProgress: RunProgress | null;
  transcriptCount: number;
  onCancelSummarization: (runId: string) => Promise<{ cancelledCount: number }>;
  onRestartSummarization: (runId: string, force?: boolean) => Promise<{ queuedCount: number }>;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
};

/**
 * Check if run can have summarization cancelled.
 */
function canCancelSummarization(status: RunStatus): boolean {
  return status === 'SUMMARIZING';
}

/**
 * Check if run can have summarization restarted.
 */
function canRestartSummarization(status: RunStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}

/**
 * Calculate how many transcripts need summarization.
 */
function getUnsummarizedCount(
  summarizeProgress: RunProgress | null,
  transcriptCount: number
): number {
  if (!summarizeProgress) {
    // No summarization started, all transcripts need it
    return transcriptCount;
  }
  // Total minus completed
  return transcriptCount - summarizeProgress.completed;
}

export function SummarizationControls({
  runId,
  status,
  summarizeProgress,
  transcriptCount,
  onCancelSummarization,
  onRestartSummarization,
  disabled = false,
  size = 'md',
  onSuccess,
  onError,
}: SummarizationControlsProps) {
  const [cancelLoading, setCancelLoading] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [forceRestartLoading, setForceRestartLoading] = useState(false);

  const isLoading = cancelLoading || restartLoading || forceRestartLoading;
  const showCancel = canCancelSummarization(status);
  const showRestart = canRestartSummarization(status);
  const unsummarizedCount = getUnsummarizedCount(summarizeProgress, transcriptCount);
  const hasUnsummarized = unsummarizedCount > 0;
  const allSummarized = summarizeProgress?.completed === transcriptCount && transcriptCount > 0;

  // Don't render if no controls would be shown
  if (!showCancel && !showRestart) {
    return null;
  }

  // Don't show restart buttons if there's nothing to restart
  if (showRestart && !hasUnsummarized && !allSummarized) {
    return null;
  }

  const handleCancel = async () => {
    const confirmed = window.confirm(
      'Cancel summarization? Completed summaries will be preserved.'
    );
    if (!confirmed) return;

    setCancelLoading(true);
    try {
      const result = await onCancelSummarization(runId);
      onSuccess?.(`Cancelled ${result.cancelledCount} pending summarization jobs`);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to cancel summarization');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleRestart = async () => {
    const confirmed = window.confirm(
      `Restart summarization for ${unsummarizedCount} unsummarized transcript(s)?`
    );
    if (!confirmed) return;

    setRestartLoading(true);
    try {
      const result = await onRestartSummarization(runId, false);
      onSuccess?.(`Queued ${result.queuedCount} transcripts for summarization`);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to restart summarization');
    } finally {
      setRestartLoading(false);
    }
  };

  const handleForceRestart = async () => {
    const confirmed = window.confirm(
      `Re-summarize ALL ${transcriptCount} transcripts? This will overwrite existing summaries.`
    );
    if (!confirmed) return;

    setForceRestartLoading(true);
    try {
      const result = await onRestartSummarization(runId, true);
      onSuccess?.(`Queued ${result.queuedCount} transcripts for re-summarization`);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to restart summarization');
    } finally {
      setForceRestartLoading(false);
    }
  };

  const buttonSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Cancel button - shown when summarizing */}
      {showCancel && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={() => void handleCancel()}
          disabled={disabled || isLoading}
          aria-label="Cancel summarization"
        >
          {cancelLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <StopCircle className="w-4 h-4 mr-2" />
          )}
          Cancel Summarization
        </Button>
      )}

      {/* Restart button - shown when terminal with unsummarized transcripts */}
      {showRestart && hasUnsummarized && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={() => void handleRestart()}
          disabled={disabled || isLoading}
          aria-label="Restart summarization"
        >
          {restartLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Summarize Remaining ({unsummarizedCount})
        </Button>
      )}

      {/* Force restart button - shown when terminal, allows re-summarizing all */}
      {showRestart && transcriptCount > 0 && (
        <Button
          variant="ghost"
          size={buttonSize}
          onClick={() => void handleForceRestart()}
          disabled={disabled || isLoading}
          className="text-gray-600 hover:bg-gray-100"
          aria-label="Re-summarize all transcripts"
        >
          {forceRestartLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RotateCcw className="w-4 h-4 mr-2" />
          )}
          Re-summarize All
        </Button>
      )}
    </div>
  );
}
