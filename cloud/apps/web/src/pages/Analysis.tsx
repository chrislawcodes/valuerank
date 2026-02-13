/**
 * Analysis Page
 *
 * Displays a list of runs with analysis results, with filtering and
 * virtualized infinite scroll. Supports folder view grouped by definition
 * tags or flat list view.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, RefreshCw, Clock3 } from 'lucide-react';
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
    softRefetch,
  } = useInfiniteRunsWithAnalysis({
    analysisStatus: filters.analysisStatus || undefined,
  });

  const inProgressAnalysisRuns = useMemo(
    () => runs
      .filter((run) => run.analysisStatus === 'pending' || run.analysisStatus === 'computing'),
    [runs]
  );

  useEffect(() => {
    if (inProgressAnalysisRuns.length === 0) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      softRefetch();
    }, 7000);

    return () => window.clearInterval(interval);
  }, [softRefetch, inProgressAnalysisRuns.length]);

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

      {inProgressAnalysisRuns.length > 0 && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-blue-600" />
            <p className="text-sm font-medium text-blue-900">
              {inProgressAnalysisRuns.length} analysis {inProgressAnalysisRuns.length === 1 ? 'is' : 'are'} in progress
            </p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {inProgressAnalysisRuns.slice(0, 5).map((run) => (
              <Button
                key={run.id}
                variant="ghost"
                size="sm"
                className="h-7 border border-blue-200 bg-white px-2 text-blue-700 hover:bg-blue-100"
                onClick={() => navigate(`/analysis/${run.id}`)}
              >
                {run.name || run.definition?.name || run.id}
              </Button>
            ))}
            {inProgressAnalysisRuns.length > 5 && (
              <span className="text-xs text-blue-700 self-center">
                +{inProgressAnalysisRuns.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

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
    </div >
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
        Complete a trial to generate analysis results.
      </p>
      <Button onClick={() => navigate('/runs')}>
        Go to Trials
      </Button>
    </div>
  );
}
