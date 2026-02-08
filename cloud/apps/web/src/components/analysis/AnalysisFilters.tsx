/**
 * AnalysisFilters Component
 *
 * Filter controls for analysis visualizations.
 * Allows filtering by model and value.
 * Collapses on mobile for better space utilization.
 */

import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { CollapsibleFilters } from '../ui/CollapsibleFilters';

export type FilterState = {
  selectedModels: string[];
};

type AnalysisFiltersProps = {
  availableModels: string[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
};

export function AnalysisFilters({
  availableModels,
  filters,
  onFilterChange,
}: AnalysisFiltersProps) {
  const hasActiveFilters = filters.selectedModels.length > 0;

  const handleModelToggle = (model: string) => {
    const newModels = filters.selectedModels.includes(model)
      ? filters.selectedModels.filter((m) => m !== model)
      : [...filters.selectedModels, model];

    onFilterChange({
      ...filters,
      selectedModels: newModels,
    });
  };

  const handleClearFilters = () => {
    onFilterChange({
      selectedModels: [],
    });
  };

  // Count active filters for mobile badge
  const activeFilterCount = filters.selectedModels.length;

  return (
    <CollapsibleFilters
      title="Filters"
      hasActiveFilters={hasActiveFilters}
      activeFilterCount={activeFilterCount}
      onClear={handleClearFilters}
    >
      <div className="flex flex-wrap items-center gap-4 p-4 sm:p-0 sm:bg-transparent bg-gray-50 rounded-lg sm:border-0 border border-gray-200">
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
                  className={`px-2 py-1 text-xs rounded-full transition-colors ${isSelected
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

        {/* Clear filters - hidden on mobile (use CollapsibleFilters clear) */}
        {hasActiveFilters && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClearFilters}
            className="hidden sm:flex ml-auto"
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
          </div>
        )}
      </div>
    </CollapsibleFilters>
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
