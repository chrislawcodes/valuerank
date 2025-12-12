/**
 * AnalysisFolderView Component
 *
 * Groups runs with analysis by their definition's tags in a collapsible folder structure.
 */

import { useState, useMemo } from 'react';
import { ChevronRight, Folder, FolderOpen, Tag as TagIcon } from 'lucide-react';
import { AnalysisCard } from './AnalysisCard';
import type { Run, RunDefinitionTag } from '../../api/operations/runs';

type AnalysisFolderViewProps = {
  runs: Run[];
  onRunClick: (runId: string) => void;
};

type TagFolder = {
  tag: RunDefinitionTag;
  runs: Run[];
};

/**
 * Groups runs by their definition's tags.
 * Runs with definitions that have multiple tags will appear in multiple folders.
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

export function AnalysisFolderView({ runs, onRunClick }: AnalysisFolderViewProps) {
  // Track which folders are expanded (default: all collapsed)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Group runs by tag
  const tagGroups = useMemo(() => {
    const groups = groupRunsByTag(runs);
    // Sort by tag name
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

  const toggleFolder = (tagId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allIds = tagGroups.map((g) => g.tag.id);
    if (untaggedRuns.length > 0) {
      allIds.push('__untagged__');
    }
    setExpandedFolders(new Set(allIds));
  };

  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  if (tagGroups.length === 0 && untaggedRuns.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Expand/Collapse all controls */}
      {(tagGroups.length > 0 || untaggedRuns.length > 0) && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <button
            type="button"
            onClick={expandAll}
            className="hover:text-gray-700 hover:underline"
          >
            Expand all
          </button>
          <span>/</span>
          <button
            type="button"
            onClick={collapseAll}
            className="hover:text-gray-700 hover:underline"
          >
            Collapse all
          </button>
        </div>
      )}

      {/* Tag folders */}
      {tagGroups.map(({ tag, runs: tagRuns }) => {
        const isExpanded = expandedFolders.has(tag.id);

        return (
          <div key={tag.id} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Folder header */}
            <button
              type="button"
              onClick={() => toggleFolder(tag.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <ChevronRight
                className={`w-4 h-4 text-gray-400 transition-transform ${
                  isExpanded ? 'rotate-90' : ''
                }`}
              />
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-amber-500" />
              ) : (
                <Folder className="w-4 h-4 text-amber-500" />
              )}
              <TagIcon className="w-3.5 h-3.5 text-teal-600" />
              <span className="font-medium text-gray-900">{tag.name}</span>
              <span className="text-sm text-gray-500">
                ({tagRuns.length})
              </span>
            </button>

            {/* Folder contents */}
            {isExpanded && (
              <div className="p-2 space-y-2 bg-white">
                {tagRuns.map((run) => (
                  <AnalysisCard
                    key={`${tag.id}-${run.id}`}
                    run={run}
                    onClick={() => onRunClick(run.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Untagged runs */}
      {untaggedRuns.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleFolder('__untagged__')}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <ChevronRight
              className={`w-4 h-4 text-gray-400 transition-transform ${
                expandedFolders.has('__untagged__') ? 'rotate-90' : ''
              }`}
            />
            {expandedFolders.has('__untagged__') ? (
              <FolderOpen className="w-4 h-4 text-gray-400" />
            ) : (
              <Folder className="w-4 h-4 text-gray-400" />
            )}
            <span className="font-medium text-gray-500">Untagged</span>
            <span className="text-sm text-gray-500">
              ({untaggedRuns.length})
            </span>
          </button>

          {expandedFolders.has('__untagged__') && (
            <div className="p-2 space-y-2 bg-white">
              {untaggedRuns.map((run) => (
                <AnalysisCard
                  key={`untagged-${run.id}`}
                  run={run}
                  onClick={() => onRunClick(run.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
