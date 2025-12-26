/**
 * VirtualizedFolderView Component
 *
 * Groups runs by their definition's tags in a collapsible folder structure
 * with virtualization for efficient rendering of large datasets.
 * Supports infinite scroll to load more runs.
 */

import { useState, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, Folder, FolderOpen, Tag as TagIcon, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { RunCard } from './RunCard';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import type { Run, RunDefinitionTag } from '../../api/operations/runs';

type VirtualizedFolderViewProps = {
  runs: Run[];
  onRunClick: (runId: string) => void;
  hasNextPage: boolean;
  loadingMore: boolean;
  totalCount: number | null;
  onLoadMore: () => void;
};

type TagFolder = {
  tag: RunDefinitionTag;
  runs: Run[];
};

// Virtual list item types
type FolderHeaderItem = {
  type: 'folder-header';
  id: string;
  tag: RunDefinitionTag | null; // null for untagged
  runCount: number;
};

type RunItem = {
  type: 'run';
  id: string;
  run: Run;
  folderId: string;
};

type VirtualItem = FolderHeaderItem | RunItem;

// Type guards
function isFolderHeader(item: VirtualItem): item is FolderHeaderItem {
  return item.type === 'folder-header';
}

function isRunItem(item: VirtualItem): item is RunItem {
  return item.type === 'run';
}

// Item heights
const FOLDER_HEADER_HEIGHT = 44;
const RUN_CARD_HEIGHT = 100;
const GAP = 8;

/**
 * Groups runs by their definition's tags.
 */
function groupRunsByTag(runs: Run[]): Map<string, TagFolder> {
  const tagMap = new Map<string, TagFolder>();

  for (const run of runs) {
    const tags = run.definition?.tags ?? [];

    for (const tag of tags) {
      const existing = tagMap.get(tag.id);
      if (existing) {
        existing.runs.push(run);
      } else {
        tagMap.set(tag.id, { tag, runs: [run] });
      }
    }
  }

  return tagMap;
}

export function VirtualizedFolderView({
  runs,
  onRunClick,
  hasNextPage,
  loadingMore,
  totalCount,
  onLoadMore,
}: VirtualizedFolderViewProps) {
  // Use throttled infinite scroll hook
  const parentRef = useInfiniteScroll({
    hasNextPage,
    loadingMore,
    onLoadMore,
  });

  // Track which folders are expanded (default: first folder expanded)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());

  // Group runs by tag
  const tagGroups = useMemo(() => {
    const groups = groupRunsByTag(runs);
    return Array.from(groups.values()).sort((a, b) =>
      a.tag.name.localeCompare(b.tag.name)
    );
  }, [runs]);

  // Runs with definitions that have no tags
  const untaggedRuns = useMemo(() => {
    return runs.filter((r) => {
      const tags = r.definition?.tags ?? [];
      return tags.length === 0;
    });
  }, [runs]);

  // Build flat list of items for virtualization
  const virtualItems = useMemo((): VirtualItem[] => {
    const items: VirtualItem[] = [];

    // Add tag folders
    for (const { tag, runs: tagRuns } of tagGroups) {
      // Add folder header
      items.push({
        type: 'folder-header',
        id: tag.id,
        tag,
        runCount: tagRuns.length,
      });

      // Add runs if folder is expanded
      if (expandedFolders.has(tag.id)) {
        for (const run of tagRuns) {
          items.push({
            type: 'run',
            id: `${tag.id}-${run.id}`,
            run,
            folderId: tag.id,
          });
        }
      }
    }

    // Add untagged folder if there are untagged runs
    if (untaggedRuns.length > 0) {
      items.push({
        type: 'folder-header',
        id: '__untagged__',
        tag: null,
        runCount: untaggedRuns.length,
      });

      if (expandedFolders.has('__untagged__')) {
        for (const run of untaggedRuns) {
          items.push({
            type: 'run',
            id: `untagged-${run.id}`,
            run,
            folderId: '__untagged__',
          });
        }
      }
    }

    return items;
  }, [tagGroups, untaggedRuns, expandedFolders]);

  // Estimate size based on item type
  const getItemSize = useCallback((index: number) => {
    const item = virtualItems[index];
    if (!item) return RUN_CARD_HEIGHT + GAP;
    if (isFolderHeader(item)) {
      return FOLDER_HEADER_HEIGHT + GAP;
    }
    return RUN_CARD_HEIGHT + GAP;
  }, [virtualItems]);

  // Set up virtualizer
  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getItemSize,
    overscan: 5,
  });

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = tagGroups.map((g) => g.tag.id);
    if (untaggedRuns.length > 0) {
      allIds.push('__untagged__');
    }
    setExpandedFolders(new Set(allIds));
  }, [tagGroups, untaggedRuns.length]);

  const collapseAll = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  if (tagGroups.length === 0 && untaggedRuns.length === 0) {
    return null;
  }

  const visibleItems = virtualizer.getVirtualItems();

  return (
    <div className="h-full flex flex-col">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-500">
          {runs.length}
          {totalCount !== null && runs.length < totalCount && <> of {totalCount}</>} runs
          {' · '}
          {tagGroups.length + (untaggedRuns.length > 0 ? 1 : 0)} folders
        </div>

        {/* Expand/Collapse all controls */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Button
            type="button"
            onClick={expandAll}
            variant="ghost"
            size="sm"
            className="p-0 h-auto text-xs text-gray-500 hover:text-gray-700 hover:underline hover:bg-transparent"
          >
            Expand all
          </Button>
          <span>/</span>
          <Button
            type="button"
            onClick={collapseAll}
            variant="ghost"
            size="sm"
            className="p-0 h-auto text-xs text-gray-500 hover:text-gray-700 hover:underline hover:bg-transparent"
          >
            Collapse all
          </Button>
        </div>
      </div>

      {/* Virtualized scroll container */}
      <div
        ref={parentRef}
        className="flex-1 min-h-0 overflow-auto"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {visibleItems.map((virtualRow) => {
            const item = virtualItems[virtualRow.index];
            if (!item) return null;

            if (isFolderHeader(item)) {
              const isExpanded = expandedFolders.has(item.id);
              const isUntagged = item.tag === null;

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: `${GAP}px`,
                  }}
                >
                  {/* eslint-disable-next-line react/forbid-elements -- Accordion button requires custom full-width layout */}
                  <button
                    type="button"
                    onClick={() => toggleFolder(item.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <ChevronRight
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                    {isExpanded ? (
                      <FolderOpen className={`w-4 h-4 ${isUntagged ? 'text-gray-400' : 'text-amber-500'}`} />
                    ) : (
                      <Folder className={`w-4 h-4 ${isUntagged ? 'text-gray-400' : 'text-amber-500'}`} />
                    )}
                    {!isUntagged && (
                      <TagIcon className="w-3.5 h-3.5 text-teal-600" />
                    )}
                    <span className={`font-medium ${isUntagged ? 'text-gray-500' : 'text-gray-900'}`}>
                      {isUntagged ? 'Untagged' : item.tag?.name}
                    </span>
                    <span className="text-sm text-gray-500">
                      ({item.runCount})
                    </span>
                  </button>
                </div>
              );
            }

            // Run item - use type guard to narrow type
            if (isRunItem(item)) {
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingLeft: '24px',
                    paddingBottom: `${GAP}px`,
                  }}
                >
                  <RunCard run={item.run} onClick={() => onRunClick(item.run.id)} />
                </div>
              );
            }

            return null;
          })}
        </div>

        {/* Loading indicator */}
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
