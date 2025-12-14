/**
 * AnalysisListFilters Component
 *
 * Filter controls for the analysis list with status, tags, and view mode toggle.
 */

import { useState, useCallback } from 'react';
import { List, FolderTree, X, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { useTags } from '../../hooks/useTags';

export type AnalysisViewMode = 'flat' | 'folder';

export type AnalysisFilterState = {
  analysisStatus: 'CURRENT' | 'SUPERSEDED' | '';
  tagIds: string[];
  viewMode: AnalysisViewMode;
};

type StatusOption = {
  value: '' | 'CURRENT' | 'SUPERSEDED';
  label: string;
};

const STATUS_OPTIONS: StatusOption[] = [
  { value: '', label: 'All Analysis' },
  { value: 'CURRENT', label: 'Current' },
  { value: 'SUPERSEDED', label: 'Superseded' },
];

type AnalysisListFiltersProps = {
  filters: AnalysisFilterState;
  onFiltersChange: (filters: AnalysisFilterState) => void;
};

export function AnalysisListFilters({ filters, onFiltersChange }: AnalysisListFiltersProps) {
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const { tags: allTags } = useTags();

  const handleStatusChange = useCallback(
    (status: string) => {
      onFiltersChange({ ...filters, analysisStatus: status as '' | 'CURRENT' | 'SUPERSEDED' });
    },
    [filters, onFiltersChange]
  );

  const handleViewModeChange = useCallback(
    (viewMode: AnalysisViewMode) => {
      onFiltersChange({ ...filters, viewMode });
    },
    [filters, onFiltersChange]
  );

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

  const handleClearTags = useCallback(() => {
    onFiltersChange({ ...filters, tagIds: [] });
  }, [filters, onFiltersChange]);

  const selectedTags = allTags.filter((t) => filters.tagIds.includes(t.id));

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Status filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="analysis-status-filter" className="text-sm text-gray-600">
            Status:
          </label>
          <select
            id="analysis-status-filter"
            value={filters.analysisStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tag filter dropdown */}
        <div className="relative">
          <Button
            type="button"
            onClick={() => setShowTagDropdown(!showTagDropdown)}
            variant="secondary"
            size="sm"
            className={`${
              filters.tagIds.length > 0
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
            <ChevronDown
              className={`w-4 h-4 ml-1 transition-transform ${showTagDropdown ? 'rotate-180' : ''}`}
            />
          </Button>

          {showTagDropdown && (
            <div className="absolute z-50 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
              <div className="max-h-48 overflow-y-auto">
                {allTags.length > 0 ? (
                  allTags.map((tag) => (
                    // eslint-disable-next-line react/forbid-elements -- Menu item requires custom semantic button styling
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
                  <div className="p-3 text-sm text-gray-500 text-center">
                    No tags available
                  </div>
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

        {/* Clear tags button */}
        {filters.tagIds.length > 0 && (
          <Button
            type="button"
            onClick={handleClearTags}
            variant="ghost"
            size="sm"
            className="px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-transparent"
          >
            <X className="w-3 h-3 mr-1" />
            Clear tags
          </Button>
        )}
      </div>

      {/* View mode toggle */}
      <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
        <Button
          type="button"
          onClick={() => handleViewModeChange('flat')}
          variant="ghost"
          size="icon"
          className={`rounded-none p-1.5 ${
            filters.viewMode === 'flat'
              ? 'bg-teal-50 text-teal-600'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
          }`}
          title="List view"
          aria-label="List view"
        >
          <List className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          onClick={() => handleViewModeChange('folder')}
          variant="ghost"
          size="icon"
          className={`rounded-none p-1.5 ${
            filters.viewMode === 'folder'
              ? 'bg-teal-50 text-teal-600'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
          }`}
          title="Folder view (by tag)"
          aria-label="Folder view (by tag)"
        >
          <FolderTree className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
