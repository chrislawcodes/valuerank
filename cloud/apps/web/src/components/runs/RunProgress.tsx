/**
 * RunProgress Component
 *
 * Displays progress of a run with visual progress bar and status indicators.
 * Shows detailed execution metrics during RUNNING state, collapses when complete.
 */

import { useState } from 'react';
import { CheckCircle, XCircle, Clock, Loader2, Pause, AlertCircle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge, type BadgeProps } from '../ui/Badge';
import type { Run, RunProgress as RunProgressType } from '../../api/operations/runs';
import { ExecutionProgress } from './ExecutionProgress';

type RunProgressProps = {
  run: Run;
  showPerModel?: boolean;
};

/**
 * Get status color classes and badge variant.
 */
function getStatusColor(status: string): {
  bg: string;
  text: string;
  border: string;
  badgeVariant: NonNullable<BadgeProps['variant']>;
} {
  switch (status) {
    case 'COMPLETED':
      return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', badgeVariant: 'success' };
    case 'FAILED':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', badgeVariant: 'error' };
    case 'CANCELLED':
      return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', badgeVariant: 'neutral' };
    case 'PAUSED':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', badgeVariant: 'warning' };
    case 'SUMMARIZING':
      return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', badgeVariant: 'warning' };
    case 'RUNNING':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', badgeVariant: 'warning' };
    case 'PENDING':
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', badgeVariant: 'info' };
  }
}

/**
 * Get status icon component.
 */
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'FAILED':
      return <XCircle className="w-5 h-5 text-red-500" />;
    case 'CANCELLED':
      return <XCircle className="w-5 h-5 text-gray-400" />;
    case 'PAUSED':
      return <Pause className="w-5 h-5 text-amber-500" />;
    case 'SUMMARIZING':
      return <FileText className="w-5 h-5 text-purple-500" />;
    case 'RUNNING':
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    case 'PENDING':
    default:
      return <Clock className="w-5 h-5 text-gray-400" />;
  }
}

/**
 * Format status for display.
 */
function formatStatus(run: Run): string {
  if (run.status === 'SUMMARIZING' && run.summarizeProgress) {
    const { completed, total } = run.summarizeProgress;
    return `Summarizing (${completed}/${total})`;
  }
  return run.status.charAt(0).toUpperCase() + run.status.slice(1).toLowerCase();
}

/**
 * Calculate progress percentage from run progress data.
 */
function calculateProgress(progress: RunProgressType | null): number {
  if (!progress) return 0;
  return progress.percentComplete;
}

/**
 * Format duration in milliseconds for compact per-model estimate display.
 */
function formatEstimatedTranscriptTime(durationMs: number | null): string {
  if (durationMs === null || durationMs <= 0) {
    return '-';
  }

  const seconds = durationMs / 1000;
  if (seconds < 10) {
    return `~${seconds.toFixed(1)}s`;
  }
  if (seconds < 60) {
    return `~${Math.round(seconds)}s`;
  }

  const minutes = seconds / 60;
  return `~${minutes.toFixed(1)}m`;
}

/**
 * Estimate per-transcript time for a model using run-local transcript durations.
 */
function estimateModelTranscriptTimeMs(
  modelId: string,
  modelDurations: number[],
  run: Run
): number | null {
  if (modelDurations.length > 0) {
    return Math.round(modelDurations.reduce((sum, ms) => sum + ms, 0) / modelDurations.length);
  }

  // Fallback for early RUNNING state: use in-memory recent completions if available.
  const recentDurations = (run.executionMetrics?.providers ?? [])
    .flatMap((provider) => provider.recentCompletions)
    .filter(
      (completion) =>
        completion.success &&
        completion.modelId === modelId &&
        completion.durationMs > 0
    )
    .map((completion) => completion.durationMs);

  if (recentDurations.length === 0) {
    return null;
  }

  return Math.round(recentDurations.reduce((sum, ms) => sum + ms, 0) / recentDurations.length);
}

/**
 * Check if run is in an active state that should show expanded metrics.
 */
function isActiveRun(status: string): boolean {
  return ['PENDING', 'RUNNING'].includes(status);
}

export function RunProgress({ run, showPerModel = false }: RunProgressProps) {
  const progress = run.runProgress;
  const percentComplete = calculateProgress(progress);
  const colors = getStatusColor(run.status);

  const total = progress?.total ?? 0;
  const completed = progress?.completed ?? 0;
  const failed = progress?.failed ?? 0;
  const pending = total - completed - failed;

  // Calculate per-model breakdown from config
  const models = run.config?.models ?? [];

  // Show expanded execution metrics for active runs
  const isActive = isActiveRun(run.status);
  const hasExecutionMetrics = run.executionMetrics !== null && run.executionMetrics !== undefined;

  // Allow expanding completed runs to see details
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="space-y-4">
      {/* Status badge and progress bar */}
      <div className="flex items-center gap-4">
        <Badge
          variant={colors.badgeVariant}
          size="md"
          className="flex items-center gap-2 rounded-full"
        >
          <StatusIcon status={run.status} />
          {formatStatus(run)}
        </Badge>

        <div className="flex-1">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>{completed} of {total} completed</span>
            <span>{percentComplete.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300 ease-out bg-teal-500"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>

        {/* Expand/collapse button for completed runs */}
        {!isActive && (
          <Button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            variant="ghost"
            size="icon"
            className="p-1 text-gray-400 hover:text-gray-600"
            title={isExpanded ? 'Collapse details' : 'Expand details'}
            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </Button>
        )}
      </div>

      {/* Execution metrics for active runs */}
      {isActive && hasExecutionMetrics && run.executionMetrics && (
        <ExecutionProgress metrics={run.executionMetrics} />
      )}

      {/* Stats row - always show for active runs, only when expanded for completed */}
      {(isActive || isExpanded) && (
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-600">Completed: {completed}</span>
          </div>
          {failed > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-gray-600">Failed: {failed}</span>
            </div>
          )}
          {pending > 0 && run.status !== 'COMPLETED' && run.status !== 'CANCELLED' && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-300" />
              <span className="text-gray-600">Pending: {pending}</span>
            </div>
          )}
        </div>
      )}

      {/* Per-model breakdown - only when expanded or showPerModel is true */}
      {(showPerModel || isExpanded) && models.length > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Per-Model Progress</h4>
          <div className="mb-2 px-1 flex items-center gap-3 text-xs text-gray-500 font-medium">
            <span className="w-40">Model</span>
            <span className="w-24 text-right">Est. Transcript Time</span>
            <span className="flex-1">Per-Model Progress</span>
            <span className="w-16 text-right">Done</span>
          </div>
          <div className="space-y-2">
            {models.map((modelId) => {
              // Get transcripts for this model
              const modelTranscripts = run.transcripts?.filter(
                (t) => t.modelId === modelId
              ) ?? [];
              const modelDurations = modelTranscripts
                .map((t) => t.durationMs)
                .filter((durationMs) => durationMs > 0);
              const estimatedTranscriptTimeMs = estimateModelTranscriptTimeMs(modelId, modelDurations, run);
              const modelCompleted = modelTranscripts.length;
              // Estimate total per model (total / models.length)
              const modelTotal = Math.ceil(total / models.length);
              const modelPercent = modelTotal > 0 ? (modelCompleted / modelTotal) * 100 : 0;

              return (
                <div key={modelId} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-40 truncate" title={modelId}>
                    {modelId}
                  </span>
                  <span
                    className="text-xs text-gray-500 w-24 text-right tabular-nums"
                    title="Estimated per-transcript response time"
                  >
                    {formatEstimatedTranscriptTime(estimatedTranscriptTimeMs)}
                  </span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-400 transition-all duration-300"
                      style={{ width: `${Math.min(100, modelPercent)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-16 text-right">
                    {modelCompleted}/{modelTotal}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Warning for failed jobs */}
      {failed > 0 && run.status === 'COMPLETED' && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <span className="text-sm text-amber-700">
            {failed} probe{failed !== 1 ? 's' : ''} failed during this run.
          </span>
        </div>
      )}
    </div>
  );
}
