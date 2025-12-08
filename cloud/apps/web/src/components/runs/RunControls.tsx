/**
 * RunControls Component
 *
 * Provides pause/resume/cancel controls for a run.
 * Shows appropriate buttons based on run status with loading states.
 */

import { useState } from 'react';
import { Play, Pause, Square, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { type RunStatus } from '../../api/operations/runs';

export type RunControlsProps = {
  runId: string;
  status: RunStatus;
  onPause: (runId: string) => Promise<void>;
  onResume: (runId: string) => Promise<void>;
  onCancel: (runId: string) => Promise<void>;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

/**
 * Check if run is in an active state (can be paused).
 */
function isActiveStatus(status: RunStatus): boolean {
  return status === 'PENDING' || status === 'RUNNING' || status === 'SUMMARIZING';
}

/**
 * Check if run is in a terminal state (no controls available).
 */
function isTerminalStatus(status: RunStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}

export function RunControls({
  runId,
  status,
  onPause,
  onResume,
  onCancel,
  disabled = false,
  size = 'md',
}: RunControlsProps) {
  const [pauseLoading, setPauseLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const isLoading = pauseLoading || resumeLoading || cancelLoading;
  const isActive = isActiveStatus(status);
  const isPaused = status === 'PAUSED';
  const isTerminal = isTerminalStatus(status);

  // Don't render anything for terminal states
  if (isTerminal) {
    return null;
  }

  const handlePause = async () => {
    setPauseLoading(true);
    try {
      await onPause(runId);
    } finally {
      setPauseLoading(false);
    }
  };

  const handleResume = async () => {
    setResumeLoading(true);
    try {
      await onResume(runId);
    } finally {
      setResumeLoading(false);
    }
  };

  const handleCancel = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to cancel this run? This cannot be undone.'
    );
    if (!confirmed) return;

    setCancelLoading(true);
    try {
      await onCancel(runId);
    } finally {
      setCancelLoading(false);
    }
  };

  const buttonSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md';

  return (
    <div className="flex items-center gap-2">
      {/* Pause button - shown when run is active */}
      {isActive && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={() => void handlePause()}
          disabled={disabled || isLoading}
          aria-label="Pause run"
        >
          {pauseLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Pause className="w-4 h-4 mr-2" />
          )}
          Pause
        </Button>
      )}

      {/* Resume button - shown when run is paused */}
      {isPaused && (
        <Button
          variant="secondary"
          size={buttonSize}
          onClick={() => void handleResume()}
          disabled={disabled || isLoading}
          aria-label="Resume run"
        >
          {resumeLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Resume
        </Button>
      )}

      {/* Cancel button - shown when run is active or paused */}
      {(isActive || isPaused) && (
        <Button
          variant="ghost"
          size={buttonSize}
          onClick={() => void handleCancel()}
          disabled={disabled || isLoading}
          className="text-red-600 hover:bg-red-50"
          aria-label="Cancel run"
        >
          {cancelLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Square className="w-4 h-4 mr-2" />
          )}
          Cancel
        </Button>
      )}
    </div>
  );
}
