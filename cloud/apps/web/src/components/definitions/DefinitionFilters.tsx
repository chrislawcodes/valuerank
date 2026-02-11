import { useState, useEffect, useCallback } from 'react';
import { Search, X, Filter, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { CollapsibleFilters } from '../ui/CollapsibleFilters';
import { useTags } from '../../hooks/useTags';
import { getCanonicalDimensionNames } from '@valuerank/shared';

export type DefinitionFilterState = {
  search: string;
  rootOnly: boolean;
  hasRuns: boolean;
  tagIds: string[];
};

type DefinitionFiltersProps = {
  filters: DefinitionFilterState;
  onFiltersChange: (filters: DefinitionFilterState) => void;
  className?: string;
};

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export function DefinitionFilters({
  filters,
  onFiltersChange,
  className = '',
}: DefinitionFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  const { tags: allTags } = useTags();
  const schwartzValues = getCanonicalDimensionNames();

  // Debounce search input
  const debouncedSearch = useDebounce(searchInput, 300);

  // Update filters when debounced search changes
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onFiltersChange({ ...filters, search: debouncedSearch });
    }
  }, [debouncedSearch, filters, onFiltersChange]);

  // Check if any filters are active
  const hasActiveFilters =
    filters.search.length > 0 ||
    filters.rootOnly ||
    filters.hasRuns ||
    filters.tagIds.length > 0;

  const handleClearFilters = () => {
    setSearchInput('');
    onFiltersChange({
      search: '',
      rootOnly: false,
      hasRuns: false,
      tagIds: [],
    });
  };

  const handleToggleRootOnly = () => {
    onFiltersChange({ ...filters, rootOnly: !filters.rootOnly });
  };

  const handleToggleHasRuns = () => {
    onFiltersChange({ ...filters, hasRuns: !filters.hasRuns });
  };

  const handleTagToggle = useCallback(
    (tagId: string) => {
      const isSelected = filters.tagIds.includes(tagId);
      const newTagIds = isSelected
        ? filters.tagIds.filter((id) => id !== tagId)
        : [...filters.tagIds, tagId];
      onFiltersChange({ ...filters, tagIds: newTagIds });
    },
    [filters, onFiltersChange]
  );

  const selectedTags = allTags.filter((t) => filters.tagIds.includes(t.id));

  // Count active filters for mobile badge
  const activeFilterCount =
    (filters.search ? 1 : 0) +
    (filters.rootOnly ? 1 : 0) +
    (filters.hasRuns ? 1 : 0) +
    filters.tagIds.length;

  return (
    <CollapsibleFilters
      title="Filters"
      hasActiveFilters={hasActiveFilters}
      activeFilterCount={activeFilterCount}
      onClear={handleClearFilters}
      className={className}
    >
      <div className="space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            list="schwartz-values"
            placeholder="Search metadata (AND by default)"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <datalist id="schwartz-values">
            {schwartzValues.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          {searchInput && (
            <Button
              type="button"
              onClick={() => setSearchInput('')}
              variant="ghost"
              size="icon"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 p-0 text-gray-400 hover:text-gray-600 hover:bg-transparent"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Search covers vignette metadata (name, attributes, template, tags). Schwartz values autocomplete as you type. Use explicit <code>OR</code> for OR matching.
        </p>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />

          {/* Root only toggle */}
          {/* eslint-disable-next-line react/forbid-elements -- Chip toggle requires custom styling */}
          <button
            type="button"
            onClick={handleToggleRootOnly}
            className={`inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition-colors ${filters.rootOnly
                ? 'bg-teal-50 border-teal-300 text-teal-700'
                : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
              }`}
          >
            Root only
          </button>

          {/* Has runs toggle */}
          {/* eslint-disable-next-line react/forbid-elements -- Chip toggle requires custom styling */}
          <button
            type="button"
            onClick={handleToggleHasRuns}
            className={`inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition-colors ${filters.hasRuns
                ? 'bg-teal-50 border-teal-300 text-teal-700'
                : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
              }`}
          >
            Has trials
          </button>

          {/* Tag filter dropdown */}
          <div className="relative">
            <Button
              type="button"
              onClick={() => setShowTagDropdown(!showTagDropdown)}
              variant="secondary"
              size="sm"
              className={`rounded-full ${filters.tagIds.length > 0
                  ? 'bg-teal-50 border-teal-300 text-teal-700'
                  : ''
                }`}
            >
              Tags
              {filters.tagIds.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 bg-teal-600 text-white text-xs rounded-full ml-1">
                  {filters.tagIds.length}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${showTagDropdown ? 'rotate-180' : ''}`} />
            </Button>

            {showTagDropdown && (
              <div className="absolute z-50 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                <div className="max-h-48 overflow-y-auto">
                  {allTags.length > 0 ? (
                    allTags.map((tag) => (
                      // eslint-disable-next-line react/forbid-elements -- Menu item requires custom styling
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => handleTagToggle(tag.id)}
                        className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center justify-between ${filters.tagIds.includes(tag.id) ? 'bg-teal-50' : ''
                          }`}
                      >
                        <span>{tag.name}</span>
                        {filters.tagIds.includes(tag.id) && (
                          <span className="text-teal-600">✓</span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-sm text-gray-500 text-center">No tags available</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Selected tags display */}
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
            >
              {tag.name}
              <Button
                type="button"
                onClick={() => handleTagToggle(tag.id)}
                variant="ghost"
                size="icon"
                className="w-4 h-4 p-0 hover:text-red-600 hover:bg-transparent"
                aria-label={`Remove ${tag.name} filter`}
              >
                <X className="w-3 h-3" />
              </Button>
            </span>
          ))}

          {/* Clear filters button - hidden on mobile (use CollapsibleFilters clear) */}
          {hasActiveFilters && (
            <Button
              type="button"
              onClick={handleClearFilters}
              variant="ghost"
              size="sm"
              className="hidden sm:flex px-3 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-transparent"
            >
              <X className="w-4 h-4 mr-1" />
              Clear filters
            </Button>
          )}
        </div>
      </div>
    </CollapsibleFilters>
  );
}

// Close dropdown when clicking outside
export function useClickOutside(
  ref: React.RefObject<HTMLElement>,
  handler: () => void
) {
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, handler]);
}
