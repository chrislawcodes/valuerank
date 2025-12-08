/**
 * RerunDialog Component
 *
 * Dialog for re-running an evaluation with different model configuration.
 * Pre-populates with the original run's settings and allows modifications.
 */

import { useState, useCallback, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { RunForm } from './RunForm';
import { useRunMutations } from '../../hooks/useRunMutations';
import type { Run, StartRunInput } from '../../api/operations/runs';

export type RerunDialogProps = {
  run: Run;
  scenarioCount?: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newRunId: string) => void;
};

export function RerunDialog({
  run,
  scenarioCount,
  isOpen,
  onClose,
  onSuccess,
}: RerunDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const { startRun, loading } = useRunMutations();

  // Reset error when dialog opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(
    async (input: StartRunInput) => {
      setError(null);
      try {
        const result = await startRun(input);
        onSuccess(result.run.id);
        onClose();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start re-run';
        setError(message);
      }
    },
    [startRun, onSuccess, onClose]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-gray-900">Re-run Evaluation</h2>
              <p className="text-sm text-gray-500">
                Create a new run based on {run.definition?.name || 'this definition'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Original run info */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Original Run</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <span className="text-gray-500">Models:</span>{' '}
                {run.config?.models?.join(', ') || 'N/A'}
              </p>
              <p>
                <span className="text-gray-500">Sample:</span>{' '}
                {run.config?.samplePercentage ?? 100}%
              </p>
              <p>
                <span className="text-gray-500">Status:</span>{' '}
                {run.status}
              </p>
            </div>
          </div>

          {/* Error message */}
          {error !== null && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Re-run form */}
          <RunForm
            definitionId={run.definitionId}
            scenarioCount={scenarioCount}
            onSubmit={handleSubmit}
            onCancel={onClose}
            isSubmitting={loading}
          />
        </div>
      </div>
    </div>
  );
}
