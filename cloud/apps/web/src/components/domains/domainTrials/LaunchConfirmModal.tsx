import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { formatCost } from './helpers';

type LaunchConfirmModalProps = {
  open: boolean;
  domainName: string;
  vignetteCount: number;
  modelCount: number;
  totalPairedBatches: number | null;
  totalTrialRuns: number | null;
  estimatedTotalCost: number;
  estimateConfidence?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  fallbackReason?: string | null;
  knownExclusions?: string[];
  temperatureLabel: string;
  budgetCap: number | null;
  targetBatchCount?: number;
  reviewSetupHref: string;
  reviewVignettesHref: string;
  isStarting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LaunchConfirmModal({
  open,
  domainName,
  vignetteCount,
  modelCount,
  totalPairedBatches,
  totalTrialRuns,
  estimatedTotalCost,
  estimateConfidence,
  fallbackReason,
  knownExclusions = [],
  temperatureLabel,
  budgetCap,
  targetBatchCount,
  reviewSetupHref,
  reviewVignettesHref,
  isStarting,
  onCancel,
  onConfirm,
}: LaunchConfirmModalProps) {
  if (!open) return null;

  const headingId = 'launch-confirm-modal-heading';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-full max-w-xl rounded-lg border border-gray-200 bg-white p-5 shadow-xl space-y-4"
      >
        <h2 id={headingId} className="text-lg font-semibold text-gray-900">Confirm Domain Level Batches</h2>
        <div className="space-y-1 text-sm text-gray-700">
          <div>Domain: <span className="font-medium">{domainName}</span></div>
          <div>Selected latest vignettes: <span className="font-medium">{vignetteCount}</span></div>
          <div>Target paired batches per vignette: <span className="font-medium">{targetBatchCount}</span></div>
          <div>Total paired batches: <span className="font-medium">{totalPairedBatches ?? 'Not set'}</span></div>
          <div>Total individual trial runs: <span className="font-medium">{totalTrialRuns ?? 'Not set'}</span></div>
          <div>Models: <span className="font-medium">{modelCount}</span></div>
          <div>Estimated remaining cost: <span className="font-medium">{formatCost(estimatedTotalCost)}</span></div>
          {estimateConfidence != null && (
            <div>Estimate confidence: <span className="font-medium">{estimateConfidence.toLowerCase()}</span></div>
          )}
          <div>Temperature: <span className="font-medium">{temperatureLabel}</span></div>
          <div>Budget cap: <span className="font-medium">{budgetCap === null ? 'None' : formatCost(budgetCap)}</span></div>
        </div>
        {targetBatchCount != null && targetBatchCount > 20 && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Large launches need an extra check. This run will launch {targetBatchCount} paired batches per vignette across {vignetteCount} vignettes, for {totalTrialRuns ?? 'an unknown number of'} total individual trial runs.
          </div>
        )}
        {(fallbackReason || knownExclusions.length > 0) && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
            <p className="font-medium">Setup summary and estimate notes</p>
            {fallbackReason && <p>Fallback reason: {fallbackReason}</p>}
            {knownExclusions.length > 0 && <p>{knownExclusions.join(' ')}</p>}
          </div>
        )}
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-2">
          <p className="font-medium text-gray-900">Review before confirming</p>
          <p>
            This starts one launch for the selected domain. Use these links if you want to inspect setup coverage or vignette configuration before member runs begin.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to={reviewSetupHref}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Review setup coverage
            </Link>
            <Link
              to={reviewVignettesHref}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Review vignette overrides
            </Link>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          This creates a launch and incurs model costs. Duplicate active launches with the same launch signature and sampling are blocked server-side.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isStarting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isStarting}>
            {isStarting ? 'Starting...' : 'Start Paired Batches'}
          </Button>
        </div>
      </div>
    </div>
  );
}
