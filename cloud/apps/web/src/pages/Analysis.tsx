/**
 * Analysis Page
 *
 * Displays a list of runs with analysis results, with filtering, pagination,
 * and optional folder view grouped by definition tags.
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { AnalysisCard } from '../components/analysis/AnalysisCard';
import { useRunsWithAnalysis } from '../hooks/useRunsWithAnalysis';

const PAGE_SIZE = 10;

export function Analysis() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [analysisStatusFilter, setAnalysisStatusFilter] = useState<'CURRENT' | 'SUPERSEDED' | ''>('');

  const { runs, loading, error, refetch } = useRunsWithAnalysis({
    analysisStatus: analysisStatusFilter || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const handleAnalysisClick = useCallback((runId: string) => {
    navigate(`/analysis/${runId}`);
  }, [navigate]);

  const handlePrevPage = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const handleStatusFilterChange = useCallback((status: string) => {
    setAnalysisStatusFilter(status as 'CURRENT' | 'SUPERSEDED' | '');
    setPage(0);
  }, []);

  // Determine if there might be more pages
  const hasNextPage = runs.length === PAGE_SIZE;
  const hasPrevPage = page > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">
          Analysis
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
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="analysis-status-filter" className="text-sm text-gray-600">
            Status:
          </label>
          <select
            id="analysis-status-filter"
            value={analysisStatusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          >
            <option value="">All</option>
            <option value="CURRENT">Current</option>
            <option value="SUPERSEDED">Superseded</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      {!loading && runs.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Showing {page * PAGE_SIZE + 1}-{page * PAGE_SIZE + runs.length}
            {analysisStatusFilter && ` (${analysisStatusFilter.toLowerCase()})`}
          </span>
        </div>
      )}

      {/* Content */}
      {loading && runs.length === 0 ? (
        <Loading size="lg" text="Loading analysis results..." />
      ) : error ? (
        <ErrorMessage message={`Failed to load analysis: ${error.message}`} />
      ) : runs.length === 0 ? (
        <EmptyState hasStatusFilter={!!analysisStatusFilter} />
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <AnalysisCard
              key={run.id}
              run={run}
              onClick={() => handleAnalysisClick(run.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(hasPrevPage || hasNextPage) && (
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
function EmptyState({ hasStatusFilter }: { hasStatusFilter: boolean }) {
  const navigate = useNavigate();

  if (hasStatusFilter) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <BarChart2 className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No analysis found
        </h3>
        <p className="text-gray-500 mb-4">
          No analysis results match the selected filter.
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
