/**
 * ComparisonFilters Component
 *
 * Filter controls for cross-run comparison visualizations.
 * - Model filter dropdown (common models across runs)
 * - Display mode toggle (overlay/side-by-side)
 * - Value filter dropdown (optional, for value-focused visualizations)
 */

import { LayoutGrid, Layers, X } from 'lucide-react';
import type { ComparisonFilters as FilterState, DisplayMode, RunWithAnalysis } from './types';

type ComparisonFiltersProps = {
  /** Current filter state */
  filters: FilterState;
  /** Callback to update filters */
  onFilterChange: (filters: Partial<FilterState>) => void;
  /** Selected runs with analysis (for extracting available models/values) */
  runs: RunWithAnalysis[];
  /** Whether to show display mode toggle */
  showDisplayMode?: boolean;
  /** Whether to show value filter */
  showValueFilter?: boolean;
};

/**
 * Extract common models across all runs
 */
function getCommonModels(runs: RunWithAnalysis[]): string[] {
  if (runs.length === 0) return [];

  const modelSets = runs.map((run) => new Set(run.config.models as string[]));
  const firstSet = modelSets[0];
  if (!firstSet) return [];

  const commonModels = [...firstSet].filter((model) =>
    modelSets.every((set) => set.has(model))
  );

  return commonModels.sort();
}

/**
 * Extract all unique models across runs
 */
function getAllModels(runs: RunWithAnalysis[]): string[] {
  const allModels = new Set<string>();
  for (const run of runs) {
    for (const model of run.config.models as string[]) {
      allModels.add(model);
    }
  }
  return [...allModels].sort();
}

/**
 * Extract available values from runs (from analysis data)
 */
function getAvailableValues(runs: RunWithAnalysis[]): string[] {
  const values = new Set<string>();
  for (const run of runs) {
    if (run.analysis?.perModel) {
      for (const modelData of Object.values(run.analysis.perModel)) {
        // perModel data has values: Record<string, ValueStats>
        if (modelData.values) {
          for (const valueName of Object.keys(modelData.values)) {
            values.add(valueName);
          }
        }
      }
    }
  }
  return [...values].sort();
}

/**
 * Format model ID for display (show just the model name portion)
 */
function formatModel(modelId: string): string {
  const parts = modelId.split(':');
  return parts[parts.length - 1] || modelId;
}

/**
 * Format value name for display
 */
function formatValueName(value: string): string {
  return value.replace(/_/g, ' ');
}

export function ComparisonFilters({
  filters,
  onFilterChange,
  runs,
  showDisplayMode = true,
  showValueFilter = false,
}: ComparisonFiltersProps) {
  const allModels = getAllModels(runs);
  const commonModels = getCommonModels(runs);
  const availableValues = showValueFilter ? getAvailableValues(runs) : [];

  const hasActiveFilters = filters.model !== undefined || filters.value !== undefined;

  const handleModelChange = (model: string) => {
    onFilterChange({
      model: model === '' ? undefined : model,
    });
  };

  const handleValueChange = (value: string) => {
    onFilterChange({
      value: value === '' ? undefined : value,
    });
  };

  const handleDisplayModeChange = (mode: DisplayMode) => {
    onFilterChange({
      displayMode: mode,
    });
  };

  const handleClearFilters = () => {
    onFilterChange({
      model: undefined,
      value: undefined,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
      {/* Model filter */}
      <div className="flex items-center gap-2">
        <label htmlFor="model-filter" className="text-sm font-medium text-gray-600">
          Model:
        </label>
        <select
          id="model-filter"
          value={filters.model || ''}
          onChange={(e) => handleModelChange(e.target.value)}
          className="px-3 py-1.5 text-sm bg-white text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        >
          <option value="">All models ({allModels.length})</option>
          {commonModels.length > 0 && commonModels.length < allModels.length && (
            <optgroup label="Common models">
              {commonModels.map((model) => (
                <option key={model} value={model}>
                  {formatModel(model)}
                </option>
              ))}
            </optgroup>
          )}
          {commonModels.length > 0 && commonModels.length < allModels.length ? (
            <optgroup label="All models">
              {allModels.filter((m) => !commonModels.includes(m)).map((model) => (
                <option key={model} value={model}>
                  {formatModel(model)}
                </option>
              ))}
            </optgroup>
          ) : (
            allModels.map((model) => (
              <option key={model} value={model}>
                {formatModel(model)}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Value filter */}
      {showValueFilter && availableValues.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="value-filter" className="text-sm font-medium text-gray-600">
            Value:
          </label>
          <select
            id="value-filter"
            value={filters.value || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            className="px-3 py-1.5 text-sm bg-white text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="">All values</option>
            {availableValues.map((value) => (
              <option key={value} value={value}>
                {formatValueName(value)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Display mode toggle */}
      {showDisplayMode && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm font-medium text-gray-600">Display:</span>
          <div className="flex rounded-md overflow-hidden border border-gray-300">
            <button
              onClick={() => handleDisplayModeChange('overlay')}
              title="Overlay charts"
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                filters.displayMode === 'overlay'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Layers className="w-4 h-4" />
              Overlay
            </button>
            <button
              onClick={() => handleDisplayModeChange('side-by-side')}
              title="Side-by-side charts"
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors border-l border-gray-300 ${
                filters.displayMode === 'side-by-side'
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Side-by-side
            </button>
          </div>
        </div>
      )}

      {/* Clear filters button */}
      {hasActiveFilters && (
        <button
          onClick={handleClearFilters}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          title="Clear filters"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  );
}
