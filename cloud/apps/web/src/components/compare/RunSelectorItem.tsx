/**
 * RunSelectorItem Component
 *
 * A selectable run item for the comparison run selector.
 * Shows run name, definition, models, date, and analysis status.
 */

import { CheckCircle, Circle, AlertTriangle, BarChart2, Clock } from 'lucide-react';
import type { ComparisonRun } from '../../api/operations/comparison';
import { formatRunName } from '../../lib/format';

type RunSelectorItemProps = {
  run: ComparisonRun;
  isSelected: boolean;
  isDisabled?: boolean;
  onToggle: () => void;
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

function formatSampleCount(run: ComparisonRun): string {
  const progress = run.progress;
  if (progress) {
    return `${progress.completed} samples`;
  }
  return '-';
}

export function RunSelectorItem({
  run,
  isSelected,
  isDisabled = false,
  onToggle,
}: RunSelectorItemProps) {
  const hasCurrentAnalysis = run.analysisStatus === 'CURRENT';
  const hasSupersededAnalysis = run.analysisStatus === 'SUPERSEDED';
  const noAnalysis = !run.analysisStatus;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isDisabled}
      className={`
        w-full text-left p-3 rounded-lg border transition-all
        ${isSelected
          ? 'bg-teal-50 border-teal-300 ring-1 ring-teal-300'
          : 'bg-white border-gray-200 hover:border-gray-300'
        }
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="flex-shrink-0 mt-0.5">
          {isSelected ? (
            <CheckCircle className="w-5 h-5 text-teal-600" />
          ) : (
            <Circle className="w-5 h-5 text-gray-300" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Run name */}
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 truncate">
              {formatRunName(run)}
            </h3>
            {/* Analysis status indicator */}
            {hasCurrentAnalysis && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                <BarChart2 className="w-3 h-3" />
                Current
              </span>
            )}
            {hasSupersededAnalysis && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">
                <Clock className="w-3 h-3" />
                Superseded
              </span>
            )}
            {noAnalysis && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                <AlertTriangle className="w-3 h-3" />
                No Analysis
              </span>
            )}
          </div>

          {/* Row 2: Definition name and date */}
          <p className="text-sm text-gray-500 mt-0.5 truncate">
            {run.definition?.name || 'Unknown'} · {formatDate(run.createdAt)}
          </p>

          {/* Row 3: Stats */}
          <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
            {/* Models */}
            <span>
              {run.config.models.length} model{run.config.models.length !== 1 ? 's' : ''}
            </span>

            {/* Sample count */}
            <span>{formatSampleCount(run)}</span>

            {/* Tags */}
            {run.definition?.tags && run.definition.tags.length > 0 && (
              <div className="flex items-center gap-1">
                {run.definition.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.id}
                    className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600"
                  >
                    {tag.name}
                  </span>
                ))}
                {run.definition.tags.length > 2 && (
                  <span className="text-gray-400">+{run.definition.tags.length - 2}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
