import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

type ReprobeConfirmModalProps = {
  isOpen: boolean;
  estimatedCost: number | null;
  onCancel: () => void;
  onConfirm: () => void;
};

function formatEstimatedCost(estimatedCost: number | null): string {
  if (estimatedCost == null) {
    return 'unknown';
  }
  return `$${estimatedCost.toFixed(4)}`;
}

export function ReprobeConfirmModal({
  isOpen,
  estimatedCost,
  onCancel,
  onConfirm,
}: ReprobeConfirmModalProps) {
  if (!isOpen) {
    return null;
  }

  const costLabel = formatEstimatedCost(estimatedCost);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Re-probe this slot?"
      size="md"
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm}>
            Re-probe
          </Button>
        </>
      )}
    >
      <div className="space-y-3 text-sm text-gray-700">
        <p>
          This will soft-delete the existing transcript (if any) and trigger a new LLM call.
        </p>
        <p>
          Estimated cost: <span className="font-medium text-gray-900">{costLabel}</span>.
        </p>
      </div>
    </Modal>
  );
}
