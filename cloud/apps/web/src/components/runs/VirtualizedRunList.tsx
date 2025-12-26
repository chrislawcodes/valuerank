/**
 * VirtualizedRunList Component
 *
 * Renders a virtualized list of runs using @tanstack/react-virtual.
 * Only renders visible items for efficient performance with large datasets.
 * Supports infinite scroll to load more runs as user scrolls.
 */

import { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2 } from 'lucide-react';
import type { Run } from '../../api/operations/runs';
import { RunCard } from './RunCard';

type VirtualizedRunListProps = {
  runs: Run[];
  onRunClick: (runId: string) => void;
  hasNextPage: boolean;
  loadingMore: boolean;
  totalCount: number | null;
  onLoadMore: () => void;
};

// Estimated height of each RunCard in pixels
const ESTIMATED_ROW_HEIGHT = 100;
// Gap between cards in pixels
const GAP = 12;
// How many pixels before the end to trigger loading more
const LOAD_MORE_THRESHOLD = 200;

export function VirtualizedRunList({
  runs,
  onRunClick,
  hasNextPage,
  loadingMore,
  totalCount,
  onLoadMore,
}: VirtualizedRunListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Set up the virtualizer
  const virtualizer = useVirtualizer({
    count: runs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT + GAP,
    overscan: 5, // Render 5 extra items above/below viewport
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Trigger load more when scrolling near the end
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      if (distanceFromBottom < LOAD_MORE_THRESHOLD && hasNextPage && !loadingMore) {
        onLoadMore();
      }
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [hasNextPage, loadingMore, onLoadMore]);

  return (
    <div className="space-y-2">
      {/* Results info */}
      <div className="text-sm text-gray-500">
        Showing {runs.length}
        {totalCount !== null && <> of {totalCount}</>} runs
      </div>

      {/* Virtualized scroll container */}
      <div
        ref={parentRef}
        className="h-[600px] overflow-auto rounded-lg"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const run = runs[virtualItem.index];
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
                <RunCard run={run} onClick={() => onRunClick(run.id)} />
              </div>
            );
          })}
        </div>

        {/* Loading indicator at bottom */}
        {loadingMore && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-teal-600 mr-2" />
            <span className="text-sm text-gray-500">Loading more runs...</span>
          </div>
        )}

        {/* End of list indicator */}
        {!hasNextPage && runs.length > 0 && (
          <div className="text-center py-4 text-sm text-gray-400">
            All runs loaded
          </div>
        )}
      </div>
    </div>
  );
}
