import { Button } from '../../ui/Button';
import { formatCost } from './helpers';

type BackfillConfirmModalProps = {
  open: boolean;
  evaluationId: string;
  domainName: string;
  modelLabel: string;
  targetBatchCount: number;
  newBatchGroups: number;
  newRuns: number;
  estimatedTotalCost: number | null;
  isStarting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function BackfillConfirmModal({
  open,
  evaluationId,
  domainName,
  modelLabel,
  targetBatchCount,
  newBatchGroups,
  newRuns,
  estimatedTotalCost,
  isStarting,
  onCancel,
  onConfirm,
}: BackfillConfirmModalProps) {
  if (!open) return null;

  const headingId = 'backfill-confirm-modal-heading';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-full max-w-xl rounded-lg border border-gray-200 bg-white p-5 shadow-xl space-y-4"
      >
        <h2 id={headingId} className="text-lg font-semibold text-gray-900">Confirm Missing Model Backfill</h2>
        <div className="space-y-1 text-sm text-gray-700">
          <div>Domain: <span className="font-medium">{domainName}</span></div>
          <div>Existing batch: <span className="font-medium">{evaluationId}</span></div>
          <div>Model: <span className="font-medium">{modelLabel}</span></div>
          <div>Target paired batches per vignette: <span className="font-medium">{targetBatchCount}</span></div>
          <div>New paired batch groups: <span className="font-medium">{newBatchGroups}</span></div>
          <div>New individual trial runs: <span className="font-medium">{newRuns}</span></div>
          <div>
            Estimated additional cost:{' '}
            <span className="font-medium">{estimatedTotalCost == null ? 'Unavailable' : formatCost(estimatedTotalCost)}</span>
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-2">
          <p className="font-medium text-gray-900">What this does</p>
          <p>
            This fills the missing model coverage inside the existing batch instead of making a separate batch.
          </p>
          <p>
            The server rechecks the batch right before launch, so if the missing work was already filled or is still in flight, it will not start duplicates.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isStarting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isStarting}>
            {isStarting ? 'Starting...' : 'Start Backfill'}
          </Button>
        </div>
      </div>
    </div>
  );
}
