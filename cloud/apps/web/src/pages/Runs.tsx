/**
 * Runs Page
 *
 * Displays a list of all evaluation runs with filtering and pagination.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { RunCard, RunFilters } from '../components/runs';
import { useRuns } from '../hooks/useRuns';

const PAGE_SIZE = 10;

export function Runs() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);

  const { runs, loading, error, refetch } = useRuns({
    status: status || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const handleStatusChange = useCallback((newStatus: string) => {
    setStatus(newStatus);
    setPage(0); // Reset to first page when filter changes
  }, []);

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
      <div className="flex items-center justify-between">
        <RunFilters status={status} onStatusChange={handleStatusChange} />
        {runs.length > 0 && (
          <span className="text-sm text-gray-500">
            Showing {page * PAGE_SIZE + 1}-{page * PAGE_SIZE + runs.length}
          </span>
        )}
      </div>

      {/* Content */}
      {loading && runs.length === 0 ? (
        <Loading size="lg" text="Loading runs..." />
      ) : error ? (
        <ErrorMessage message={`Failed to load runs: ${error.message}`} />
      ) : runs.length === 0 ? (
        <EmptyState status={status} />
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              onClick={() => handleRunClick(run.id)}
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
function EmptyState({ status }: { status: string }) {
  const navigate = useNavigate();

  if (status) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <Play className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No runs found
        </h3>
        <p className="text-gray-500 mb-4">
          No runs match the selected filter.
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
