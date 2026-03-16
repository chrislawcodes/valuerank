import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { formatCost, type DomainTrialLaunchSummary } from './helpers';

type LaunchStatusPanelProps = {
  evaluationId: string | null;
  scopeCategory: string | null;
  launchSummary: DomainTrialLaunchSummary | null;
  started: boolean;
  statusSummary: {
    total: number;
    known: number;
    completed: number;
    failed: number;
    active: number;
  };
  statusFetching: boolean;
  lastStatusUpdatedAt: number | null;
  completionClean: boolean;
  completionWithFailures: boolean;
};

export function LaunchStatusPanel({
  evaluationId,
  scopeCategory,
  launchSummary,
  started,
  statusSummary,
  statusFetching,
  lastStatusUpdatedAt,
  completionClean,
  completionWithFailures,
}: LaunchStatusPanelProps) {
  if (!launchSummary && !started) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {evaluationId && <Badge variant="neutral" size="count">Evaluation: {evaluationId.slice(-8)}</Badge>}
        {scopeCategory && <Badge variant="neutral" size="count">Evaluation scope: {scopeCategory.toLowerCase()}</Badge>}
        <Badge variant="success" size="count">Member runs started: {launchSummary?.startedRuns ?? statusSummary.total}</Badge>
        <Badge variant="warning" size="count">Member runs in progress: {statusSummary.active}</Badge>
        <Badge variant="info" size="count">Member runs completed: {statusSummary.completed}</Badge>
        <Badge variant={statusSummary.failed > 0 ? 'error' : 'neutral'} size="count">Member runs failed: {statusSummary.failed}</Badge>
        {statusFetching && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
            <Loader2 className="w-3 h-3 animate-spin" />
            Refreshing live status...
          </span>
        )}
      </div>

      <div className="text-xs text-gray-600">
        {launchSummary
          ? `Launch result: started ${launchSummary.startedRuns}/${launchSummary.targetedDefinitions} vignette runs (${launchSummary.failedDefinitions} failed starts, ${launchSummary.skippedForBudget} budget-skipped) at ${new Date(launchSummary.startedAt).toLocaleTimeString()} · projected spend ${formatCost(launchSummary.projectedCostUsd)}.`
          : 'Launch status is active.'}
      </div>
      <div className="text-xs text-gray-600">
        This panel tracks the current domain evaluation cohort. Open an individual run when you need run-scoped diagnostics.
      </div>
      <div className="text-xs text-gray-500">
        Live tracking: {statusSummary.known}/{statusSummary.total} runs resolved
        {lastStatusUpdatedAt ? ` · Last refresh ${new Date(lastStatusUpdatedAt).toLocaleTimeString()}` : ''}.
      </div>

      {completionClean && (
        <div className="inline-flex items-center gap-2 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
          <CheckCircle2 className="w-4 h-4" />
          All domain trials completed successfully.
        </div>
      )}
      {completionWithFailures && (
        <div className="inline-flex items-center gap-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <AlertTriangle className="w-4 h-4" />
          Domain trials completed with failures. Review red cells before retrying.
        </div>
      )}
    </div>
  );
}
