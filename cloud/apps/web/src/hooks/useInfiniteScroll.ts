/**
 * useInfiniteScroll Hook
 *
 * Provides throttled scroll handling for infinite scroll containers.
 * Automatically triggers loadMore when scrolling near the bottom.
 */

import { useEffect, useRef, useCallback } from 'react';

// How many pixels before the end to trigger loading more
const LOAD_MORE_THRESHOLD = 200;
// Throttle scroll events (ms)
const SCROLL_THROTTLE_MS = 100;

type UseInfiniteScrollOptions = {
  /** Whether there are more items to load */
  hasNextPage: boolean;
  /** Whether currently loading more items */
  loadingMore: boolean;
  /** Callback to load more items */
  onLoadMore: () => void;
  /** Optional threshold in pixels from bottom to trigger load */
  threshold?: number;
  /** Optional throttle time in ms */
  throttleMs?: number;
};

/**
 * Hook for handling infinite scroll with throttling.
 * Returns a ref to attach to the scroll container.
 */
export function useInfiniteScroll(options: UseInfiniteScrollOptions) {
  const {
    hasNextPage,
    loadingMore,
    onLoadMore,
    threshold = LOAD_MORE_THRESHOLD,
    throttleMs = SCROLL_THROTTLE_MS,
  } = options;

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTime = useRef<number>(0);

  // Throttled scroll handler
  const handleScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastScrollTime.current < throttleMs) {
      return;
    }
    lastScrollTime.current = now;

    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceFromBottom < threshold && hasNextPage && !loadingMore) {
      onLoadMore();
    }
  }, [hasNextPage, loadingMore, onLoadMore, threshold, throttleMs]);

  // Attach scroll listener
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return scrollRef;
}
