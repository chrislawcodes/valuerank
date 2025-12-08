/**
 * Runs Page
 *
 * Displays a list of all evaluation runs with filtering, pagination,
 * and optional folder view grouped by definition tags.
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { RunCard, RunFilters, RunFolderView, type RunFilterState } from '../components/runs';
import { useRuns } from '../hooks/useRuns';

const PAGE_SIZE = 10;

const defaultFilters: RunFilterState = {
  status: '',
  tagIds: [],
  viewMode: 'folder',
};

export function Runs() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<RunFilterState>(defaultFilters);
  const [page, setPage] = useState(0);

  const { runs, loading, error, refetch } = useRuns({
    status: filters.status || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
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
    // Reset to first page when filters change (except view mode)
    if (newFilters.status !== filters.status || newFilters.tagIds !== filters.tagIds) {
      setPage(0);
    }
  }, [filters.status, filters.tagIds]);

  const handleRunClick = useCallback((runId: string) => {
    navigate(`/runs/${runId}`);
  }, [navigate]);

  const handlePrevPage = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  // Determine if there might be more pages
  const hasNextPage = runs.length === PAGE_SIZE;
  const hasPrevPage = page > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">
          Runs
        </h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <RunFilters filters={filters} onFiltersChange={handleFiltersChange} />

      {/* Results count */}
      {!loading && filteredRuns.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {filters.viewMode === 'flat' ? (
              <>Showing {page * PAGE_SIZE + 1}-{page * PAGE_SIZE + filteredRuns.length}</>
            ) : (
              <>{filteredRuns.length} run{filteredRuns.length !== 1 ? 's' : ''}</>
            )}
            {filters.tagIds.length > 0 && ' matching tags'}
          </span>
        </div>
      )}

      {/* Content */}
      {loading && runs.length === 0 ? (
        <Loading size="lg" text="Loading runs..." />
      ) : error ? (
        <ErrorMessage message={`Failed to load runs: ${error.message}`} />
      ) : filteredRuns.length === 0 ? (
        <EmptyState status={filters.status} hasTagFilter={filters.tagIds.length > 0} />
      ) : filters.viewMode === 'folder' ? (
        <RunFolderView runs={filteredRuns} onRunClick={handleRunClick} />
      ) : (
        <div className="space-y-3">
          {filteredRuns.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              onClick={() => handleRunClick(run.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination (only in flat view) */}
      {filters.viewMode === 'flat' && (hasPrevPage || hasNextPage) && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevPage}
            disabled={!hasPrevPage || loading}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-gray-500 px-4">
            Page {page + 1}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNextPage}
            disabled={!hasNextPage || loading}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
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
        Start your first evaluation run from a definition.
      </p>
      <Button onClick={() => navigate('/definitions')}>
        Go to Definitions
      </Button>
    </div>
  );
}
