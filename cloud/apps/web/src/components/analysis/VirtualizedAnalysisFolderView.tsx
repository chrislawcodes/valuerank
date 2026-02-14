/**
 * VirtualizedAnalysisFolderView Component
 *
 * Groups analysis results by their definition's tags in a collapsible folder structure
 * with virtualization for efficient rendering of large datasets.
 * Supports infinite scroll to load more results.
 */

import { useState, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, Folder, FolderOpen, Tag as TagIcon, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { AnalysisCard } from './AnalysisCard';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import type { Run, RunDefinitionTag } from '../../api/operations/runs';

type VirtualizedAnalysisFolderViewProps = {
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

function sortRunsForDisplay(runs: Run[]): Run[] {
  return [...runs].sort((left, right) => {
    const leftName = left.definition?.name ?? '';
    const rightName = right.definition?.name ?? '';
    const byName = leftName.localeCompare(rightName);
    if (byName !== 0) {
      return byName;
    }

    const leftVersion = left.definitionVersion ?? left.definition?.version ?? 0;
    const rightVersion = right.definitionVersion ?? right.definition?.version ?? 0;
    if (leftVersion !== rightVersion) {
      return rightVersion - leftVersion;
    }

    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    return rightTime - leftTime;
  });
}

// Virtual list item types
type FolderHeaderItem = {
  type: 'folder-header';
  id: string;
  tag: RunDefinitionTag | null; // null for untagged
  runCount: number;
};

type SubfolderHeaderItem = {
  type: 'subfolder-header';
  id: string;
  parentId: string;
  tag: RunDefinitionTag | null;
  runCount: number;
};

type RunItem = {
  type: 'run';
  id: string;
  run: Run;
  folderId: string;
  level: 1 | 2;
};

type VirtualItem = FolderHeaderItem | SubfolderHeaderItem | RunItem;

// Type guards
function isFolderHeader(item: VirtualItem): item is FolderHeaderItem {
  return item.type === 'folder-header';
}

function isSubfolderHeader(item: VirtualItem): item is SubfolderHeaderItem {
  return item.type === 'subfolder-header';
}

function isRunItem(item: VirtualItem): item is RunItem {
  return item.type === 'run';
}

// Item heights
const FOLDER_HEADER_HEIGHT = 44;
const SUBFOLDER_HEADER_HEIGHT = 40;
const ANALYSIS_CARD_HEIGHT = 100;
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

export function VirtualizedAnalysisFolderView({
  runs,
  onRunClick,
  hasNextPage,
  loadingMore,
  totalCount,
  onLoadMore,
}: VirtualizedAnalysisFolderViewProps) {
  // Use throttled infinite scroll hook
  const parentRef = useInfiniteScroll({
    hasNextPage,
    loadingMore,
    onLoadMore,
  });

  // Track which folders are expanded (default: first folder expanded)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());

  // Split into Aggregate and Standard runs
  const { aggregateRuns, standardRuns } = useMemo(() => {
    const agg: Run[] = [];
    const std: Run[] = [];
    runs.forEach(r => {
      // Check for Aggregate tag
      if (r.tags?.some(t => t.name === 'Aggregate')) {
        agg.push(r);
      } else {
        std.push(r);
      }
    });
    return {
      aggregateRuns: sortRunsForDisplay(agg),
      standardRuns: std,
    };
  }, [runs]);

  // Group standard runs by tag
  const tagGroups = useMemo(() => {
    const groups = groupRunsByTag(standardRuns);
    return Array.from(groups.values()).sort((a, b) =>
      a.tag.name.localeCompare(b.tag.name)
    );
  }, [standardRuns]);

  // Group aggregate runs by definition tags (excluding the run-level "Aggregate" tag)
  const aggregateTagGroups = useMemo(() => {
    const groups = groupRunsByTag(aggregateRuns);
    return Array.from(groups.values())
      .filter((group) => group.tag.name !== 'Aggregate')
      .sort((a, b) => a.tag.name.localeCompare(b.tag.name));
  }, [aggregateRuns]);

  const aggregateUntaggedRuns = useMemo(() => {
    return aggregateRuns.filter((run) => {
      const tags = (run.definition?.tags ?? []).filter((tag) => tag.name !== 'Aggregate');
      return tags.length === 0;
    });
  }, [aggregateRuns]);

  // Runs with definitions that have no tags (from standard set)
  const untaggedRuns = useMemo(() => {
    return standardRuns.filter((r) => {
      const tags = r.definition?.tags ?? [];
      return tags.length === 0;
    });
  }, [standardRuns]);

  // Build flat list of items for virtualization
  const virtualItems = useMemo((): VirtualItem[] => {
    const items: VirtualItem[] = [];

    // 1. Add Aggregate Runs Folder (First)
    if (aggregateRuns.length > 0) {
      items.push({
        type: 'folder-header',
        id: '__aggregate__',
        tag: { id: '__aggregate__', name: 'Aggregated Trials' }, // Mock tag for display
        runCount: aggregateRuns.length,
      });

      if (expandedFolders.has('__aggregate__')) {
        for (const { tag, runs: taggedRuns } of aggregateTagGroups) {
          const subfolderId = `__aggregate_tag__${tag.id}`;
          items.push({
            type: 'subfolder-header',
            id: subfolderId,
            parentId: '__aggregate__',
            tag,
            runCount: taggedRuns.length,
          });

          if (expandedFolders.has(subfolderId)) {
            for (const run of sortRunsForDisplay(taggedRuns)) {
              items.push({
                type: 'run',
                id: `${subfolderId}-${run.id}`,
                run,
                folderId: subfolderId,
                level: 2,
              });
            }
          }
        }

        if (aggregateUntaggedRuns.length > 0) {
          const subfolderId = '__aggregate_untagged__';
          items.push({
            type: 'subfolder-header',
            id: subfolderId,
            parentId: '__aggregate__',
            tag: null,
            runCount: aggregateUntaggedRuns.length,
          });

          if (expandedFolders.has(subfolderId)) {
            for (const run of sortRunsForDisplay(aggregateUntaggedRuns)) {
              items.push({
                type: 'run',
                id: `${subfolderId}-${run.id}`,
                run,
                folderId: subfolderId,
                level: 2,
              });
            }
          }
        }
      }
    }

    // 2. Add tag folders
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
        for (const run of sortRunsForDisplay(tagRuns)) {
          items.push({
            type: 'run',
            id: `${tag.id}-${run.id}`,
            run,
            folderId: tag.id,
            level: 1,
          });
        }
      }
    }

    // 3. Add untagged folder if there are untagged runs
    if (untaggedRuns.length > 0) {
      items.push({
        type: 'folder-header',
        id: '__untagged__',
        tag: null,
        runCount: untaggedRuns.length,
      });

      if (expandedFolders.has('__untagged__')) {
        for (const run of sortRunsForDisplay(untaggedRuns)) {
          items.push({
            type: 'run',
            id: `untagged-${run.id}`,
            run,
            folderId: '__untagged__',
            level: 1,
          });
        }
      }
    }

    return items;
  }, [tagGroups, untaggedRuns, aggregateRuns, aggregateTagGroups, aggregateUntaggedRuns, expandedFolders]);

  // Estimate size based on item type
  const getItemSize = useCallback((index: number) => {
    const item = virtualItems[index];
    if (!item) return ANALYSIS_CARD_HEIGHT + GAP;
    if (isFolderHeader(item)) {
      return FOLDER_HEADER_HEIGHT + GAP;
    }
    if (isSubfolderHeader(item)) {
      return SUBFOLDER_HEADER_HEIGHT + GAP;
    }
    return ANALYSIS_CARD_HEIGHT + GAP;
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
    if (aggregateRuns.length > 0) {
      allIds.push('__aggregate__');
      for (const group of aggregateTagGroups) {
        allIds.push(`__aggregate_tag__${group.tag.id}`);
      }
      if (aggregateUntaggedRuns.length > 0) {
        allIds.push('__aggregate_untagged__');
      }
    }
    setExpandedFolders(new Set(allIds));
  }, [tagGroups, untaggedRuns.length, aggregateRuns.length, aggregateTagGroups, aggregateUntaggedRuns.length]);

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
          {totalCount !== null && runs.length < totalCount && <> of {totalCount}</>} results
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
                      className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''
                        }`}
                    />
                    {isExpanded ? (
                      <FolderOpen className={`w-4 h-4 ${isUntagged ? 'text-gray-400' : item.id === '__aggregate__' ? 'text-indigo-500' : 'text-amber-500'}`} />
                    ) : (
                      <Folder className={`w-4 h-4 ${isUntagged ? 'text-gray-400' : item.id === '__aggregate__' ? 'text-indigo-500' : 'text-amber-500'}`} />
                    )}
                    {!isUntagged && (
                      <TagIcon className={`w-3.5 h-3.5 ${item.id === '__aggregate__' ? 'text-indigo-600' : 'text-teal-600'}`} />
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

            if (isSubfolderHeader(item)) {
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
                    paddingLeft: '24px',
                    paddingBottom: `${GAP}px`,
                  }}
                >
                  {/* eslint-disable-next-line react/forbid-elements -- Accordion button requires custom full-width layout */}
                  <button
                    type="button"
                    onClick={() => toggleFolder(item.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <ChevronRight
                      className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    {isExpanded ? (
                      <FolderOpen className={`w-4 h-4 ${isUntagged ? 'text-gray-400' : 'text-indigo-500'}`} />
                    ) : (
                      <Folder className={`w-4 h-4 ${isUntagged ? 'text-gray-400' : 'text-indigo-500'}`} />
                    )}
                    {!isUntagged && <TagIcon className="w-3.5 h-3.5 text-teal-600" />}
                    <span className={`font-medium ${isUntagged ? 'text-gray-500' : 'text-gray-900'}`}>
                      {isUntagged ? 'Untagged' : item.tag?.name}
                    </span>
                    <span className="text-sm text-gray-500">({item.runCount})</span>
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
                    paddingLeft: item.level === 2 ? '48px' : '24px',
                    paddingBottom: `${GAP}px`,
                  }}
                >
                  <AnalysisCard run={item.run} onClick={() => onRunClick(item.run.id)} />
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
            <span className="text-sm text-gray-500">Loading more results...</span>
          </div>
        )}

        {/* End of list indicator */}
        {!hasNextPage && runs.length > 0 && (
          <div className="text-center py-4 text-sm text-gray-400">
            All results loaded
          </div>
        )}
      </div>
    </div>
  );
}
