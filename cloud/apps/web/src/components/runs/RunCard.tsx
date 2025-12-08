/**
 * RunCard Component
 *
 * Displays a run summary in a card format for the runs list.
 */

import { Play, Clock, CheckCircle, XCircle, Pause, AlertCircle, FileText } from 'lucide-react';
import type { Run, RunStatus } from '../../api/operations/runs';

type RunCardProps = {
  run: Run;
  onClick?: () => void;
};

const STATUS_CONFIG: Record<RunStatus, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  PENDING: { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100', label: 'Pending' },
  RUNNING: { icon: Play, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Running' },
  PAUSED: { icon: Pause, color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Paused' },
  SUMMARIZING: { icon: FileText, color: 'text-purple-600', bg: 'bg-purple-100', label: 'Summarizing' },
  COMPLETED: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', label: 'Completed' },
  FAILED: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', label: 'Failed' },
  CANCELLED: { icon: AlertCircle, color: 'text-gray-600', bg: 'bg-gray-100', label: 'Cancelled' },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const durationMs = end.getTime() - start.getTime();

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function RunCard({ run, onClick }: RunCardProps) {
  const statusConfig = STATUS_CONFIG[run.status];
  const StatusIcon = statusConfig.icon;
  const progress = run.runProgress;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-lg border border-gray-200 p-4 hover:border-teal-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Status and Info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-lg ${statusConfig.bg} flex items-center justify-center flex-shrink-0`}>
            <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-gray-900 truncate">
                {run.definition?.name || 'Unnamed Definition'}
              </h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              Run {run.id.slice(0, 8)}... · {formatDate(run.createdAt)}
            </p>
          </div>
        </div>

        {/* Right: Progress and Stats */}
        <div className="flex items-center gap-6 text-sm flex-shrink-0">
          {/* Models */}
          <div className="text-right">
            <div className="text-gray-500 text-xs">Models</div>
            <div className="font-medium text-gray-900">
              {run.config?.models?.length ?? 0}
            </div>
          </div>

          {/* Progress */}
          {progress && (
            <div className="text-right">
              <div className="text-gray-500 text-xs">Progress</div>
              <div className="font-medium text-gray-900">
                {progress.completed}/{progress.total}
              </div>
            </div>
          )}

          {/* Duration */}
          <div className="text-right">
            <div className="text-gray-500 text-xs">Duration</div>
            <div className="font-medium text-gray-900">
              {formatDuration(run.startedAt, run.completedAt)}
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {progress && progress.total > 0 && (
        <div className="mt-3">
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                run.status === 'FAILED' ? 'bg-red-500' :
                run.status === 'COMPLETED' ? 'bg-green-500' :
                'bg-teal-500'
              }`}
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
        </div>
      )}
    </button>
  );
}
