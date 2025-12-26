/**
 * VirtualizedList Component
 *
 * Generic virtualized list using @tanstack/react-virtual.
 * Only renders visible items for efficient performance with large datasets.
 * Supports infinite scroll to load more items as user scrolls.
 */

import { useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2 } from 'lucide-react';

// Estimated height of each item in pixels (can be overridden)
const DEFAULT_ROW_HEIGHT = 100;
// Gap between items in pixels
const DEFAULT_GAP = 12;
// How many pixels before the end to trigger loading more
const LOAD_MORE_THRESHOLD = 200;
// Throttle scroll events (ms)
const SCROLL_THROTTLE_MS = 100;

type VirtualizedListProps<T extends { id: string }> = {
  /** Items to render */
  items: T[];
  /** Render function for each item */
  renderItem: (item: T) => React.ReactNode;
  /** Whether there are more items to load */
  hasNextPage: boolean;
  /** Whether currently loading more items */
  loadingMore: boolean;
  /** Total count of items (for display) */
  totalCount: number | null;
  /** Callback to load more items */
  onLoadMore: () => void;
  /** Estimated row height in pixels */
  estimatedRowHeight?: number;
  /** Gap between items in pixels */
  gap?: number;
  /** Label for the items (e.g., "runs", "results") */
  itemLabel?: string;
  /** Custom class name for the container */
  className?: string;
};

export function VirtualizedList<T extends { id: string }>({
  items,
  renderItem,
  hasNextPage,
  loadingMore,
  totalCount,
  onLoadMore,
  estimatedRowHeight = DEFAULT_ROW_HEIGHT,
  gap = DEFAULT_GAP,
  itemLabel = 'items',
  className = '',
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const lastScrollTime = useRef<number>(0);

  // Set up the virtualizer
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight + gap,
    overscan: 5, // Render 5 extra items above/below viewport
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Throttled scroll handler for infinite scroll
  const handleScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastScrollTime.current < SCROLL_THROTTLE_MS) {
      return;
    }
    lastScrollTime.current = now;

    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceFromBottom < LOAD_MORE_THRESHOLD && hasNextPage && !loadingMore) {
      onLoadMore();
    }
  }, [hasNextPage, loadingMore, onLoadMore]);

  // Attach scroll listener
  useEffect(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Results info */}
      <div className="text-sm text-gray-500 mb-2">
        Showing {items.length}
        {totalCount !== null && <> of {totalCount}</>} {itemLabel}
      </div>

      {/* Virtualized scroll container */}
      <div
        ref={parentRef}
        className="flex-1 min-h-0 overflow-auto rounded-lg"
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
            const item = items[virtualItem.index];
            if (!item) return null;

            return (
              <div
                key={item.id}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                  paddingBottom: `${gap}px`,
                }}
              >
                {renderItem(item)}
              </div>
            );
          })}
        </div>

        {/* Loading indicator at bottom */}
        {loadingMore && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-teal-600 mr-2" />
            <span className="text-sm text-gray-500">Loading more {itemLabel}...</span>
          </div>
        )}

        {/* End of list indicator */}
        {!hasNextPage && items.length > 0 && (
          <div className="text-center py-4 text-sm text-gray-400">
            All {itemLabel} loaded
          </div>
        )}
      </div>
    </div>
  );
}
