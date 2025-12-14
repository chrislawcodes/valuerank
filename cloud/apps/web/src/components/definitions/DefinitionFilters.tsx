import { useState, useEffect, useCallback } from 'react';
import { Search, X, Filter, ChevronDown } from 'lucide-react';
import { useTags } from '../../hooks/useTags';

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

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search definitions..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400" />

        {/* Root only toggle */}
        <button
          type="button"
          onClick={handleToggleRootOnly}
          className={`inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition-colors ${
            filters.rootOnly
              ? 'bg-teal-50 border-teal-300 text-teal-700'
              : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
          }`}
        >
          Root only
        </button>

        {/* Has runs toggle */}
        <button
          type="button"
          onClick={handleToggleHasRuns}
          className={`inline-flex items-center px-3 py-1.5 text-sm rounded-full border transition-colors ${
            filters.hasRuns
              ? 'bg-teal-50 border-teal-300 text-teal-700'
              : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
          }`}
        >
          Has runs
        </button>

        {/* Tag filter dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTagDropdown(!showTagDropdown)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-full border transition-colors ${
              filters.tagIds.length > 0
                ? 'bg-teal-50 border-teal-300 text-teal-700'
                : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
            }`}
          >
            Tags
            {filters.tagIds.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 bg-teal-600 text-white text-xs rounded-full">
                {filters.tagIds.length}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${showTagDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showTagDropdown && (
            <div className="absolute z-50 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
              <div className="max-h-48 overflow-y-auto">
                {allTags.length > 0 ? (
                  allTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleTagToggle(tag.id)}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center justify-between ${
                        filters.tagIds.includes(tag.id) ? 'bg-teal-50' : ''
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
            <button
              type="button"
              onClick={() => handleTagToggle(tag.id)}
              className="hover:text-red-600"
              aria-label={`Remove ${tag.name} filter`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        {/* Clear filters button */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
            Clear filters
          </button>
        )}
      </div>
    </div>
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
