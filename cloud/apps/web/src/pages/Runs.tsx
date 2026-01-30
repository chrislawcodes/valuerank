/**
 * Runs Page
 *
 * Displays a list of all evaluation runs with filtering and virtualized
 * infinite scroll. Supports folder view grouped by definition tags or
 * flat list view.
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import {
  RunFilters,
  VirtualizedRunList,
  VirtualizedFolderView,
  type RunFilterState,
} from '../components/runs';
import { useInfiniteRuns } from '../hooks/useInfiniteRuns';

const defaultFilters: RunFilterState = {
  status: '',
  tagIds: [],
  viewMode: 'folder',
};

export function Runs() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<RunFilterState>(defaultFilters);

  // Use infinite scroll hook for efficient data loading
  const {
    runs,
    loading,
    loadingMore,
    error,
    hasNextPage,
    totalCount,
    loadMore,
    refetch,
  } = useInfiniteRuns({
    status: filters.status || undefined,
  });

  // Filter runs by selected tags (client-side filtering)
  const filteredRuns = useMemo(() => {
    if (filters.tagIds.length === 0) {
      return runs;
    }
    return runs.filter((run) => {
      const tags = run.definition?.tags ?? [];
      return tags.some((tag) => filters.tagIds.includes(tag.id));
    });
  }, [runs, filters.tagIds]);

  const handleFiltersChange = useCallback((newFilters: RunFilterState) => {
    setFilters(newFilters);
  }, []);

  const handleRunClick = useCallback((runId: string) => {
    navigate(`/runs/${runId}`);
  }, [navigate]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">
          Runs
        </h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={refetch}
          disabled={loading || loadingMore}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading || loadingMore ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <RunFilters filters={filters} onFiltersChange={handleFiltersChange} />
      </div>

      {/* Content - fills remaining height */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <Loading size="lg" text="Loading runs..." />
        ) : error ? (
          <ErrorMessage message={`Failed to load runs: ${error.message}`} />
        ) : filteredRuns.length === 0 ? (
          <EmptyState status={filters.status} hasTagFilter={filters.tagIds.length > 0} />
        ) : filters.viewMode === 'folder' ? (
          <VirtualizedFolderView
            runs={filteredRuns}
            onRunClick={handleRunClick}
            hasNextPage={hasNextPage}
            loadingMore={loadingMore}
            totalCount={totalCount}
            onLoadMore={loadMore}
          />
        ) : (
          <VirtualizedRunList
            runs={filteredRuns}
            onRunClick={handleRunClick}
            hasNextPage={hasNextPage}
            loadingMore={loadingMore}
            totalCount={totalCount}
            onLoadMore={loadMore}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Empty state component.
 */
function EmptyState({ status, hasTagFilter }: { status: string; hasTagFilter: boolean }) {
  const navigate = useNavigate();

  if (status || hasTagFilter) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <Play className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No runs found
        </h3>
        <p className="text-gray-500 mb-4">
          No runs match the selected filters.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-teal-50 flex items-center justify-center">
        <Play className="w-8 h-8 text-teal-600" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        No runs yet
      </h3>
      <p className="text-gray-500 mb-4">
        Start your first evaluation run from a vignette.
      </p>
      <Button onClick={() => navigate('/definitions')}>
        Go to Vignettes
      </Button>
    </div>
  );
}
