import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, List, FolderTree } from 'lucide-react';
import { DefinitionCard } from './DefinitionCard';
import { DefinitionFilters, type DefinitionFilterState } from './DefinitionFilters';
import { DefinitionFolderView } from './DefinitionFolderView';
import { EmptyState } from '../ui/EmptyState';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Button } from '../ui/Button';
import type { Definition } from '../../api/operations/definitions';

type ViewMode = 'flat' | 'folder';

type DefinitionListProps = {
  definitions: Definition[];
  loading: boolean;
  error: Error | null;
  onCreateNew?: () => void;
  filters?: DefinitionFilterState;
  onFiltersChange?: (filters: DefinitionFilterState) => void;
};

function DefinitionListSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-gray-200 rounded" />
            <div className="h-5 bg-gray-200 rounded w-1/3" />
          </div>
          <div className="flex gap-2 mb-3">
            <div className="h-5 bg-gray-100 rounded-full w-16" />
            <div className="h-5 bg-gray-100 rounded-full w-20" />
          </div>
          <div className="flex gap-4">
            <div className="h-4 bg-gray-100 rounded w-24" />
            <div className="h-4 bg-gray-100 rounded w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

const defaultFilters: DefinitionFilterState = {
  search: '',
  rootOnly: false,
  hasRuns: false,
  tagIds: [],
};

export function DefinitionList({
  definitions,
  loading,
  error,
  onCreateNew,
  filters: externalFilters,
  onFiltersChange: externalOnFiltersChange,
}: DefinitionListProps) {
  const navigate = useNavigate();

  // Use internal state if no external filters provided
  const [internalFilters, setInternalFilters] = useState<DefinitionFilterState>(defaultFilters);
  const filters = externalFilters ?? internalFilters;
  const onFiltersChange = externalOnFiltersChange ?? setInternalFilters;

  // View mode state (flat list vs folder view)
  const [viewMode, setViewMode] = useState<ViewMode>('folder');

  const hasActiveFilters =
    filters.search.length > 0 ||
    filters.rootOnly ||
    filters.hasRuns ||
    filters.tagIds.length > 0;

  // Must be defined before any early returns (React hooks rule)
  const handleDefinitionClick = useCallback(
    (definition: Definition) => {
      navigate(`/definitions/${definition.id}`);
    },
    [navigate]
  );

  if (error) {
    return (
      <ErrorMessage message={`Failed to load definitions: ${error.message}`} />
    );
  }

  // Show empty state only when not loading and no definitions exist AND no filters are active
  if (!loading && definitions.length === 0 && !hasActiveFilters) {
    return (
      <EmptyState
        icon={FileText}
        title="No definitions yet"
        description="Create your first scenario definition to get started with AI moral values evaluation."
        action={
          onCreateNew
            ? {
                label: 'Create Definition',
                onClick: onCreateNew,
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with create button and view toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Definitions</h2>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('flat')}
              className={`p-1.5 transition-colors ${
                viewMode === 'flat'
                  ? 'bg-teal-50 text-teal-600'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
              title="List view"
              aria-label="List view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('folder')}
              className={`p-1.5 transition-colors ${
                viewMode === 'folder'
                  ? 'bg-teal-50 text-teal-600'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
              title="Folder view (by tag)"
              aria-label="Folder view (by tag)"
            >
              <FolderTree className="w-4 h-4" />
            </button>
          </div>
          {onCreateNew && (
            <Button onClick={onCreateNew} variant="primary" size="sm">
              <Plus className="w-4 h-4 mr-1" />
              New Definition
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <DefinitionFilters filters={filters} onFiltersChange={onFiltersChange} />

      {/* Loading skeleton */}
      {loading && definitions.length === 0 && <DefinitionListSkeleton />}

      {/* Results count */}
      {!loading && (
        <p className="text-sm text-gray-500">
          {definitions.length} definition{definitions.length !== 1 ? 's' : ''}
          {hasActiveFilters && ' matching filters'}
        </p>
      )}

      {/* No results with filters */}
      {!loading && definitions.length === 0 && hasActiveFilters && (
        <div className="text-center py-8">
          <p className="text-gray-500">No definitions match your filters</p>
          <button
            type="button"
            onClick={() => onFiltersChange(defaultFilters)}
            className="mt-2 text-teal-600 hover:text-teal-700 text-sm"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Definition cards - flat list or folder view */}
      {definitions.length > 0 && viewMode === 'flat' && (
        <div className="space-y-3">
          {definitions.map((definition) => (
            <DefinitionCard
              key={definition.id}
              definition={definition}
              onClick={() => handleDefinitionClick(definition)}
            />
          ))}
        </div>
      )}

      {/* Folder view grouped by tags */}
      {definitions.length > 0 && viewMode === 'folder' && (
        <DefinitionFolderView
          definitions={definitions}
          onDefinitionClick={handleDefinitionClick}
        />
      )}

      {/* Loading indicator for pagination */}
      {loading && definitions.length > 0 && (
        <Loading size="sm" text="Loading more..." />
      )}
    </div>
  );
}
