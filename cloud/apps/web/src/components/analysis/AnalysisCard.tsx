/**
 * AnalysisCard Component
 *
 * Displays a run's analysis summary in a card format for the analysis list.
 * Similar to RunCard but focused on analysis-specific information.
 */

import { BarChart2, CheckCircle, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import type { Run } from '../../api/operations/runs';

type AnalysisCardProps = {
  run: Run;
  onClick?: () => void;
};

type AnalysisStatusConfig = {
  icon: React.ElementType;
  color: string;
  bg: string;
  label: string;
};

const DEFAULT_STATUS_CONFIG: AnalysisStatusConfig = {
  icon: Clock,
  color: 'text-gray-600',
  bg: 'bg-gray-100',
  label: 'Unknown',
};

const ANALYSIS_STATUS_CONFIG: Record<string, AnalysisStatusConfig> = {
  completed: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', label: 'Current' },
  pending: { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100', label: 'Pending' },
  computing: { icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Computing' },
  failed: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100', label: 'Failed' },
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

export function AnalysisCard({ run, onClick }: AnalysisCardProps) {
  const analysisStatus = run.analysisStatus || 'pending';
  const statusConfig = ANALYSIS_STATUS_CONFIG[analysisStatus] ?? DEFAULT_STATUS_CONFIG;
  const StatusIcon = statusConfig.icon;

  // Use completed date if available, otherwise created date
  const displayDate = run.completedAt || run.createdAt;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={analysisStatus === 'computing' || analysisStatus === 'pending'}
      className={`w-full text-left bg-white rounded-lg border border-gray-200 p-4 transition-all ${
        analysisStatus === 'computing' || analysisStatus === 'pending'
          ? 'opacity-75 cursor-not-allowed'
          : 'hover:border-teal-300 hover:shadow-sm cursor-pointer'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Status and Info */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-lg ${statusConfig.bg} flex items-center justify-center flex-shrink-0`}>
            <BarChart2 className={`w-5 h-5 ${statusConfig.color}`} />
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
              Run {run.id.slice(0, 8)}... · {formatDate(displayDate)}
            </p>
            {/* Tags */}
            {run.definition?.tags && run.definition.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {run.definition.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag.id}
                    className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                  >
                    {tag.name}
                  </span>
                ))}
                {run.definition.tags.length > 3 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    +{run.definition.tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Stats */}
        <div className="flex items-center gap-6 text-sm flex-shrink-0">
          {/* Models */}
          <div className="text-right">
            <div className="text-gray-500 text-xs">Models</div>
            <div className="font-medium text-gray-900">
              {run.config?.models?.length ?? 0}
            </div>
          </div>

          {/* Transcripts */}
          <div className="text-right">
            <div className="text-gray-500 text-xs">Transcripts</div>
            <div className="font-medium text-gray-900">
              {run.transcriptCount}
            </div>
          </div>

          {/* Analysis Status Icon */}
          <div className={`w-8 h-8 rounded-full ${statusConfig.bg} flex items-center justify-center`}>
            <StatusIcon className={`w-4 h-4 ${statusConfig.color} ${analysisStatus === 'computing' ? 'animate-spin' : ''}`} />
          </div>
        </div>
      </div>
    </button>
  );
}
