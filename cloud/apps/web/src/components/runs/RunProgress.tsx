/**
 * RunProgress Component
 *
 * Displays progress of a run with visual progress bar and status indicators.
 */

import { CheckCircle, XCircle, Clock, Loader2, Pause, AlertCircle, FileText } from 'lucide-react';
import type { Run, RunProgress as RunProgressType } from '../../api/operations/runs';

type RunProgressProps = {
  run: Run;
  showPerModel?: boolean;
};

/**
 * Get status color classes.
 */
function getStatusColor(status: string): { bg: string; text: string; border: string } {
  switch (status) {
    case 'COMPLETED':
      return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
    case 'FAILED':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
    case 'CANCELLED':
      return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' };
    case 'PAUSED':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
    case 'SUMMARIZING':
      return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    case 'RUNNING':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'PENDING':
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' };
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
function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

/**
 * Calculate progress percentage from run progress data.
 */
function calculateProgress(progress: RunProgressType | null): number {
  if (!progress) return 0;
  return progress.percentComplete;
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

  return (
    <div className="space-y-4">
      {/* Status badge and progress bar */}
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${colors.bg} ${colors.border}`}>
          <StatusIcon status={run.status} />
          <span className={`text-sm font-medium ${colors.text}`}>
            {formatStatus(run.status)}
          </span>
        </div>

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
      </div>

      {/* Stats row */}
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

      {/* Per-model breakdown */}
      {showPerModel && models.length > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Per-Model Progress</h4>
          <div className="space-y-2">
            {models.map((modelId) => {
              // Get transcripts for this model
              const modelTranscripts = run.transcripts?.filter(
                (t) => t.modelId === modelId
              ) ?? [];
              const modelCompleted = modelTranscripts.length;
              // Estimate total per model (total / models.length)
              const modelTotal = Math.ceil(total / models.length);
              const modelPercent = modelTotal > 0 ? (modelCompleted / modelTotal) * 100 : 0;

              return (
                <div key={modelId} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-40 truncate" title={modelId}>
                    {modelId}
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
