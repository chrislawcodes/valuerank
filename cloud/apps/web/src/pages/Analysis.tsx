/**
 * Analysis Page
 *
 * Displays a list of runs with analysis results, with filtering and
 * virtualized infinite scroll. Supports folder view grouped by definition
 * tags or flat list view.
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import {
  AnalysisListFilters,
  VirtualizedAnalysisList,
  VirtualizedAnalysisFolderView,
  type AnalysisFilterState,
} from '../components/analysis';
import { useInfiniteRunsWithAnalysis } from '../hooks/useInfiniteRunsWithAnalysis';

const defaultFilters: AnalysisFilterState = {
  analysisStatus: '',
  tagIds: [],
  viewMode: 'folder',
};

export function Analysis() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AnalysisFilterState>(defaultFilters);

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
  } = useInfiniteRunsWithAnalysis({
    analysisStatus: filters.analysisStatus || undefined,
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

  const handleFiltersChange = useCallback((newFilters: AnalysisFilterState) => {
    setFilters(newFilters);
  }, []);

  const handleAnalysisClick = useCallback((runId: string) => {
    navigate(`/analysis/${runId}`);
  }, [navigate]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">
          Analysis
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
        <AnalysisListFilters filters={filters} onFiltersChange={handleFiltersChange} />
      </div>

      {/* Content - fills remaining height */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <Loading size="lg" text="Loading analysis results..." />
        ) : error ? (
          <ErrorMessage message={`Failed to load analysis: ${error.message}`} />
        ) : filteredRuns.length === 0 ? (
          <EmptyState hasStatusFilter={!!filters.analysisStatus} hasTagFilter={filters.tagIds.length > 0} />
        ) : filters.viewMode === 'folder' ? (
          <VirtualizedAnalysisFolderView
            runs={filteredRuns}
            onRunClick={handleAnalysisClick}
            hasNextPage={hasNextPage}
            loadingMore={loadingMore}
            totalCount={totalCount}
            onLoadMore={loadMore}
          />
        ) : (
          <VirtualizedAnalysisList
            runs={filteredRuns}
            onRunClick={handleAnalysisClick}
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
function EmptyState({ hasStatusFilter, hasTagFilter }: { hasStatusFilter: boolean; hasTagFilter: boolean }) {
  const navigate = useNavigate();

  if (hasStatusFilter || hasTagFilter) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <BarChart2 className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No analysis found
        </h3>
        <p className="text-gray-500 mb-4">
          No analysis results match the selected filters.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-teal-50 flex items-center justify-center">
        <BarChart2 className="w-8 h-8 text-teal-600" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        No analysis results yet
      </h3>
      <p className="text-gray-500 mb-4">
        Complete a run to generate analysis results.
      </p>
      <Button onClick={() => navigate('/runs')}>
        Go to Runs
      </Button>
    </div>
  );
}
