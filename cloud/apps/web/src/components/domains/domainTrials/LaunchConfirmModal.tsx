import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { formatCost } from './helpers';

type LaunchConfirmModalProps = {
  open: boolean;
  domainName: string;
  scopeCategory: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION';
  vignetteCount: number;
  modelCount: number;
  estimatedTotalCost: number;
  estimateConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  fallbackReason?: string | null;
  knownExclusions?: string[];
  temperatureLabel: string;
  budgetCap: number | null;
  reviewSetupHref: string;
  reviewVignettesHref: string;
  isStarting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LaunchConfirmModal({
  open,
  domainName,
  scopeCategory,
  vignetteCount,
  modelCount,
  estimatedTotalCost,
  estimateConfidence,
  fallbackReason,
  knownExclusions = [],
  temperatureLabel,
  budgetCap,
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
        <h2 id={headingId} className="text-lg font-semibold text-gray-900">Confirm Domain Evaluation</h2>
        <div className="space-y-1 text-sm text-gray-700">
          <div>Domain: <span className="font-medium">{domainName}</span></div>
          <div>Domain evaluation scope: <span className="font-medium">{scopeCategory.toLowerCase()}</span></div>
          <div>Selected latest vignettes: <span className="font-medium">{vignetteCount}</span></div>
          <div>Models: <span className="font-medium">{modelCount}</span></div>
          <div>Estimated total cost: <span className="font-medium">{formatCost(estimatedTotalCost)}</span></div>
          {estimateConfidence && <div>Estimate confidence: <span className="font-medium">{estimateConfidence.toLowerCase()}</span></div>}
          <div>Temperature: <span className="font-medium">{temperatureLabel}</span></div>
          <div>Budget cap: <span className="font-medium">{budgetCap === null ? 'None' : formatCost(budgetCap)}</span></div>
        </div>
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
            This starts one domain evaluation cohort. Use these links if you need to double-check defaults or per-vignette overrides before member runs begin.
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
          This creates a domain evaluation cohort and incurs model costs. Duplicate active launches with the same scope and sampling are blocked server-side.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isStarting}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isStarting}>
            {isStarting ? 'Starting...' : 'Start Domain Evaluation'}
          </Button>
        </div>
      </div>
    </div>
  );
}
