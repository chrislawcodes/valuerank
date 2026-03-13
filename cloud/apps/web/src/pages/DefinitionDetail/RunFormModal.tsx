/**
 * Run Form Modal
 *
 * Modal dialog for starting an evaluation run.
 */

import { RunForm } from '../../components/runs/RunForm';
import type { StartRunInput } from '../../api/operations/runs';

type RunFormModalProps = {
  isOpen: boolean;
  definitionId: string;
  definitionName: string;
  definitionContent?: unknown;
  methodologyLabel?: string | null;
  scenarioCount: number;
  error: string | null;
  isSubmitting: boolean;
  onSubmit: (input: StartRunInput) => Promise<void>;
  onClose: () => void;
};

export function RunFormModal({
  isOpen,
  definitionId,
  definitionName,
  definitionContent,
  methodologyLabel,
  scenarioCount,
  error,
  isSubmitting,
  onSubmit,
  onClose,
}: RunFormModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-medium text-gray-900">Start Evaluation</h2>
          {methodologyLabel && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              {methodologyLabel}
            </span>
          )}
        </div>
        <p className="text-gray-600 mb-6">
          Configure and start an evaluation trial for &quot;{definitionName}&quot;
        </p>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
        <RunForm
          definitionId={definitionId}
          definitionContent={definitionContent}
          scenarioCount={scenarioCount}
          onSubmit={onSubmit}
          onCancel={onClose}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}
