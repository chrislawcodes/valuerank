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
        <h2 className="text-lg font-medium text-gray-900 mb-4">Start Evaluation Trial</h2>
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
          scenarioCount={scenarioCount}
          onSubmit={onSubmit}
          onCancel={onClose}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}
