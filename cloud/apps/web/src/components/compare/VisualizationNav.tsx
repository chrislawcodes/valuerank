/**
 * Visualization Navigation for Cross-Run Comparison
 *
 * Tab navigation for switching between registered visualizations.
 * Disables tabs when the minimum run requirement is not met.
 */

import { listVisualizations } from './visualizations/registry';
import type { VisualizationType } from './types';

type VisualizationNavProps = {
  /** Currently selected visualization */
  activeVisualization: VisualizationType;
  /** Number of runs currently selected with analysis */
  runCount: number;
  /** Callback when visualization is changed */
  onVisualizationChange: (viz: VisualizationType) => void;
  /** Optional className for container */
  className?: string;
};

/**
 * Tab navigation for comparison visualizations.
 * Automatically shows all registered visualizations and disables
 * those that don't have enough runs selected.
 */
export function VisualizationNav({
  activeVisualization,
  runCount,
  onVisualizationChange,
  className = '',
}: VisualizationNavProps) {
  const visualizations = listVisualizations();

  if (visualizations.length === 0) {
    return null;
  }

  return (
    <div className={`flex items-center gap-1 border-b border-gray-200 ${className}`}>
      {visualizations.map((viz) => {
        const Icon = viz.icon;
        const isActive = activeVisualization === viz.id;
        const isDisabled = runCount < viz.minRuns;

        const buttonClasses = [
          'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
          'border-b-2 -mb-[2px]',
          isActive
            ? 'text-teal-600 border-teal-600'
            : isDisabled
              ? 'text-gray-400 border-transparent cursor-not-allowed'
              : 'text-gray-600 border-transparent hover:text-gray-900 hover:border-gray-300',
        ].join(' ');

        return (
          <button
            key={viz.id}
            onClick={() => !isDisabled && onVisualizationChange(viz.id)}
            disabled={isDisabled}
            title={isDisabled
              ? `Requires ${viz.minRuns}+ runs (${runCount} selected)`
              : viz.description
            }
            className={buttonClasses}
          >
            <Icon className="w-4 h-4" />
            <span>{viz.label}</span>
          </button>
        );
      })}
    </div>
  );
}
