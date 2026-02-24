import { Button } from '../../ui/Button';
import { formatCost } from './helpers';

type LaunchConfirmModalProps = {
  open: boolean;
  domainName: string;
  vignetteCount: number;
  modelCount: number;
  estimatedTotalCost: number;
  temperatureLabel: string;
  budgetCap: number | null;
  isStarting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LaunchConfirmModal({
  open,
  domainName,
  vignetteCount,
  modelCount,
  estimatedTotalCost,
  temperatureLabel,
  budgetCap,
  isStarting,
  onCancel,
  onConfirm,
}: LaunchConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-lg border border-gray-200 bg-white p-5 shadow-xl space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Confirm Domain Trial Launch</h2>
        <div className="space-y-1 text-sm text-gray-700">
          <div>Domain: <span className="font-medium">{domainName}</span></div>
          <div>Latest vignettes: <span className="font-medium">{vignetteCount}</span></div>
          <div>Models: <span className="font-medium">{modelCount}</span></div>
          <div>Estimated total cost: <span className="font-medium">{formatCost(estimatedTotalCost)}</span></div>
          <div>Temperature: <span className="font-medium">{temperatureLabel}</span></div>
          <div>Budget cap: <span className="font-medium">{budgetCap === null ? 'None' : formatCost(budgetCap)}</span></div>
        </div>
        <p className="text-xs text-gray-500">
          This starts domain runs and incurs model costs. A duplicate active launch is blocked server-side.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isStarting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isStarting}>
            {isStarting ? 'Starting...' : 'Run All Domain Trials'}
          </Button>
        </div>
      </div>
    </div>
  );
}

