/**
 * AnalysisFilters Component
 *
 * Filter controls for analysis visualizations.
 * Allows filtering by model and value.
 */

import { X } from 'lucide-react';
import { Button } from '../ui/Button';

export type FilterState = {
  selectedModels: string[];
  selectedValue: string | null;
};

type AnalysisFiltersProps = {
  availableModels: string[];
  availableValues: string[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
};

/**
 * Format value name for display.
 */
function formatValueName(value: string): string {
  return value.replace(/_/g, ' ');
}

export function AnalysisFilters({
  availableModels,
  availableValues,
  filters,
  onFilterChange,
}: AnalysisFiltersProps) {
  const hasActiveFilters =
    filters.selectedModels.length > 0 || filters.selectedValue !== null;

  const handleModelToggle = (model: string) => {
    const newModels = filters.selectedModels.includes(model)
      ? filters.selectedModels.filter((m) => m !== model)
      : [...filters.selectedModels, model];

    onFilterChange({
      ...filters,
      selectedModels: newModels,
    });
  };

  const handleValueChange = (value: string) => {
    onFilterChange({
      ...filters,
      selectedValue: value === '' ? null : value,
    });
  };

  const handleClearFilters = () => {
    onFilterChange({
      selectedModels: [],
      selectedValue: null,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
      {/* Model filter */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Models:</label>
        <div className="flex flex-wrap gap-1">
          {availableModels.map((model) => {
            const isSelected = filters.selectedModels.includes(model);
            return (
              // eslint-disable-next-line react/forbid-elements -- Chip toggle requires custom styling
              <button
                key={model}
                type="button"
                onClick={() => handleModelToggle(model)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  isSelected
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:border-teal-500'
                }`}
                title={model}
              >
                {model.length > 15 ? `${model.slice(0, 12)}...` : model}
              </button>
            );
          })}
        </div>
      </div>

      {/* Value filter */}
      {availableValues.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="value-filter" className="text-sm font-medium text-gray-700">
            Value:
          </label>
          <select
            id="value-filter"
            value={filters.selectedValue || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
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

      {/* Clear filters */}
      {hasActiveFilters && (
        <Button
          variant="secondary"
          size="sm"
          onClick={handleClearFilters}
          className="ml-auto"
        >
          <X className="w-3 h-3 mr-1" />
          Clear filters
        </Button>
      )}

      {/* Active filter summary */}
      {hasActiveFilters && (
        <div className="w-full text-xs text-gray-500 mt-2">
          Filtering: {filters.selectedModels.length > 0 && (
            <span className="text-teal-600 font-medium">
              {filters.selectedModels.length} model{filters.selectedModels.length > 1 ? 's' : ''}
            </span>
          )}
          {filters.selectedModels.length > 0 && filters.selectedValue && ' • '}
          {filters.selectedValue && (
            <span className="text-teal-600 font-medium">
              {formatValueName(filters.selectedValue)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Apply model filter to perModel data.
 */
export function filterByModels<T>(
  perModel: Record<string, T>,
  selectedModels: string[]
): Record<string, T> {
  if (selectedModels.length === 0) return perModel;

  return Object.fromEntries(
    Object.entries(perModel).filter(([modelId]) =>
      selectedModels.includes(modelId)
    )
  );
}
