/**
 * RunSelector Component
 *
 * Multi-select list of runs available for comparison.
 * Uses virtualization for efficient rendering with large datasets.
 * Includes search filtering, infinite scroll, and max selection limit.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { RunSelectorItem } from './RunSelectorItem';
import { Loading } from '../ui/Loading';
import type { ComparisonRun } from '../../api/operations/comparison';

const MAX_RUNS = 10;

// Estimated height of each RunSelectorItem in pixels
const ESTIMATED_ROW_HEIGHT = 88;
// Gap between items in pixels
const GAP = 8;
// How many pixels before the end to trigger loading more
const LOAD_MORE_THRESHOLD = 200;

type RunSelectorProps = {
  /** Available runs to select from */
  runs: ComparisonRun[];
  /** Currently selected run IDs */
  selectedIds: string[];
  /** Loading state */
  loading?: boolean;
  /** Loading more state (for infinite scroll) */
  loadingMore?: boolean;
  /** Whether there are more runs to load */
  hasNextPage?: boolean;
  /** Total count of runs (for display) */
  totalCount?: number | null;
  /** Error message */
  error?: string | null;
  /** Callback when selection changes */
  onSelectionChange: (ids: string[]) => void;
  /** Callback to refetch runs */
  onRefresh?: () => void;
  /** Callback to load more runs */
  onLoadMore?: () => void;
};

export function RunSelector({
  runs,
  selectedIds,
  loading = false,
  loadingMore = false,
  hasNextPage = false,
  totalCount,
  error,
  onSelectionChange,
  onRefresh,
  onLoadMore,
}: RunSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);

  // Filter runs by search query
  const filteredRuns = useMemo(() => {
    if (!searchQuery.trim()) return runs;

    const query = searchQuery.toLowerCase();
    return runs.filter((run) => {
      const definitionName = run.definition?.name?.toLowerCase() || '';
      const runId = run.id.toLowerCase();
      const tags = run.definition?.tags?.map((t) => t.name.toLowerCase()) || [];

      return (
        definitionName.includes(query) ||
        runId.includes(query) ||
        tags.some((tag) => tag.includes(query))
      );
    });
  }, [runs, searchQuery]);

  // Set up virtualizer
  const virtualizer = useVirtualizer({
    count: filteredRuns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT + GAP,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Trigger load more when scrolling near the end
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement || !onLoadMore) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // Only load more when not searching (search filters locally)
      if (
        distanceFromBottom < LOAD_MORE_THRESHOLD &&
        hasNextPage &&
        !loadingMore &&
        !searchQuery.trim()
      ) {
        onLoadMore();
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [hasNextPage, loadingMore, onLoadMore, searchQuery]);

  // Check if we've hit the selection limit
  const atLimit = selectedIds.length >= MAX_RUNS;

  // Handle toggle
  const handleToggle = useCallback(
    (runId: string) => {
      if (selectedIds.includes(runId)) {
        onSelectionChange(selectedIds.filter((id) => id !== runId));
      } else if (!atLimit) {
        onSelectionChange([...selectedIds, runId]);
      }
    },
    [selectedIds, onSelectionChange, atLimit]
  );

  // Handle select all (visible runs, up to limit)
  const handleSelectAll = useCallback(() => {
    const currentSelected = new Set(selectedIds);
    const toAdd = filteredRuns
      .filter((r) => !currentSelected.has(r.id))
      .slice(0, MAX_RUNS - selectedIds.length)
      .map((r) => r.id);

    onSelectionChange([...selectedIds, ...toAdd]);
  }, [filteredRuns, selectedIds, onSelectionChange]);

  // Handle clear selection
  const handleClearSelection = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-700">Select Runs</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {selectedIds.length}/{MAX_RUNS} selected
          </span>
          {onRefresh && (
            <Button
              type="button"
              onClick={onRefresh}
              disabled={loading || loadingMore}
              variant="ghost"
              size="icon"
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Refresh runs"
              aria-label="Refresh runs"
            >
              <RefreshCw className={`w-4 h-4 ${loading || loadingMore ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search runs..."
          className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </div>

      {/* Quick actions and count */}
      {filteredRuns.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleSelectAll}
              disabled={atLimit}
              variant="ghost"
              size="sm"
              className="px-0 py-0 h-auto text-xs text-teal-600 hover:text-teal-700 hover:bg-transparent disabled:text-gray-400"
            >
              Select all
            </Button>
            {selectedIds.length > 0 && (
              <>
                <span className="text-gray-300">|</span>
                <Button
                  type="button"
                  onClick={handleClearSelection}
                  variant="ghost"
                  size="sm"
                  className="px-0 py-0 h-auto text-xs text-gray-500 hover:text-gray-700 hover:bg-transparent"
                >
                  Clear selection
                </Button>
              </>
            )}
          </div>
          <span className="text-xs text-gray-500">
            {filteredRuns.length}
            {totalCount !== null && totalCount !== undefined && !searchQuery.trim() && (
              <> of {totalCount}</>
            )}{' '}
            runs
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Run list - virtualized */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        style={{ contain: 'strict' }}
      >
        {loading && runs.length === 0 ? (
          <Loading size="sm" text="Loading runs..." />
        ) : filteredRuns.length === 0 ? (
          <EmptyState hasSearch={searchQuery.length > 0} totalRuns={runs.length} />
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualItem) => {
              const run = filteredRuns[virtualItem.index];
              if (!run) return null;

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                    paddingBottom: `${GAP}px`,
                  }}
                >
                  <RunSelectorItem
                    run={run}
                    isSelected={selectedIds.includes(run.id)}
                    isDisabled={atLimit && !selectedIds.includes(run.id)}
                    onToggle={() => handleToggle(run.id)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Loading more indicator */}
        {loadingMore && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-teal-600 mr-2" />
            <span className="text-xs text-gray-500">Loading more runs...</span>
          </div>
        )}

        {/* End of list indicator */}
        {!hasNextPage && runs.length > 0 && !searchQuery.trim() && (
          <div className="text-center py-2 text-xs text-gray-400">
            All runs loaded
          </div>
        )}
      </div>

      {/* Selection limit warning */}
      {atLimit && (
        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
          Maximum {MAX_RUNS} runs can be compared at once.
        </div>
      )}
    </div>
  );
}

/**
 * Empty state when no runs match
 */
function EmptyState({ hasSearch, totalRuns }: { hasSearch: boolean; totalRuns: number }) {
  if (hasSearch) {
    return (
      <div className="text-center py-8">
        <Search className="w-8 h-8 mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">No runs match your search.</p>
      </div>
    );
  }

  if (totalRuns === 0) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-8 h-8 mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-500 mb-1">No runs with analysis found.</p>
        <p className="text-xs text-gray-400">
          Complete a run and generate analysis to compare results.
        </p>
      </div>
    );
  }

  return null;
}
