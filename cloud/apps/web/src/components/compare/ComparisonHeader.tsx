/**
 * ComparisonHeader Component
 *
 * Displays selected runs summary with quick deselect chips
 * and warnings for runs missing analysis.
 */

import { X, AlertTriangle, BarChart2 } from 'lucide-react';
import type { RunWithAnalysis } from './types';
import { formatRunNameShort } from '../../lib/format';

type ComparisonHeaderProps = {
  /** Selected runs */
  runs: RunWithAnalysis[];
  /** IDs of runs missing analysis */
  missingAnalysisIds: string[];
  /** Callback to deselect a run */
  onDeselect: (id: string) => void;
  /** Callback to clear all selections */
  onClearAll: () => void;
};

export function ComparisonHeader({
  runs,
  missingAnalysisIds,
  onDeselect,
  onClearAll,
}: ComparisonHeaderProps) {
  const hasSelection = runs.length > 0;
  const hasMissingAnalysis = missingAnalysisIds.length > 0;

  if (!hasSelection) {
    return (
      <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-center gap-3">
          <BarChart2 className="w-5 h-5 text-gray-400" />
          <div>
            <p className="text-sm font-medium text-gray-700">
              Select runs to compare
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Choose 2 or more runs from the list to start comparing
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-2">
      {/* Selected runs chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-700">
          Comparing {runs.length} run{runs.length !== 1 ? 's' : ''}:
        </span>
        {runs.map((run) => (
          <RunChip
            key={run.id}
            run={run}
            hasMissingAnalysis={missingAnalysisIds.includes(run.id)}
            onDeselect={() => onDeselect(run.id)}
          />
        ))}
        {runs.length > 1 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-gray-500 hover:text-gray-700 ml-1"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Warning for missing analysis */}
      {hasMissingAnalysis && (
        <div className="flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
          <p className="text-xs text-yellow-700">
            {missingAnalysisIds.length === 1
              ? '1 run is missing analysis and will be excluded from comparisons.'
              : `${missingAnalysisIds.length} runs are missing analysis and will be excluded from comparisons.`}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Individual run chip with deselect button
 */
function RunChip({
  run,
  hasMissingAnalysis,
  onDeselect,
}: {
  run: RunWithAnalysis;
  hasMissingAnalysis: boolean;
  onDeselect: () => void;
}) {
  const name = formatRunNameShort(run, 20);

  return (
    <span
      className={`
        inline-flex items-center gap-1 pl-2.5 pr-1 py-1 text-sm rounded-full
        ${hasMissingAnalysis
          ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
          : 'bg-teal-100 text-teal-800 border border-teal-200'
        }
      `}
      title={name}
    >
      {hasMissingAnalysis && (
        <AlertTriangle className="w-3 h-3 mr-0.5" />
      )}
      <span className="truncate max-w-[150px]">{name}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDeselect();
        }}
        className={`
          p-0.5 rounded-full transition-colors
          ${hasMissingAnalysis
            ? 'hover:bg-yellow-200'
            : 'hover:bg-teal-200'
          }
        `}
        aria-label={`Remove ${name}`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}
