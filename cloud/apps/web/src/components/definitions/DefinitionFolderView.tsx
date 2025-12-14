import { useState, useMemo } from 'react';
import { ChevronRight, Folder, FolderOpen, Tag as TagIcon } from 'lucide-react';
import { DefinitionCard } from './DefinitionCard';
import type { Definition, Tag } from '../../api/operations/definitions';

type DefinitionFolderViewProps = {
  definitions: Definition[];
  onDefinitionClick: (definition: Definition) => void;
};

type _TagFolder = {
  tag: Tag;
  definitions: Definition[];
  isExpanded: boolean;
};

/**
 * Groups definitions by their tags (including inherited tags).
 * Definitions with multiple tags will appear in multiple folders.
 */
function groupDefinitionsByTag(definitions: Definition[]): Map<string, { tag: Tag; definitions: Definition[] }> {
  const tagMap = new Map<string, { tag: Tag; definitions: Definition[] }>();

  for (const definition of definitions) {
    // Use allTags if available, otherwise fall back to tags
    const effectiveTags = definition.allTags ?? definition.tags;

    for (const tag of effectiveTags) {
      const existing = tagMap.get(tag.id);
      if (existing) {
        existing.definitions.push(definition);
      } else {
        tagMap.set(tag.id, { tag, definitions: [definition] });
      }
    }
  }

  return tagMap;
}

export function DefinitionFolderView({
  definitions,
  onDefinitionClick,
}: DefinitionFolderViewProps) {
  // Track which folders are expanded (default: all collapsed)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Group definitions by tag
  const tagGroups = useMemo(() => {
    const groups = groupDefinitionsByTag(definitions);
    // Sort by tag name
    return Array.from(groups.values()).sort((a, b) =>
      a.tag.name.localeCompare(b.tag.name)
    );
  }, [definitions]);

  // Definitions without any tags
  const untaggedDefinitions = useMemo(() => {
    return definitions.filter((d) => {
      const effectiveTags = d.allTags ?? d.tags;
      return effectiveTags.length === 0;
    });
  }, [definitions]);

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
    setExpandedFolders(new Set(tagGroups.map((g) => g.tag.id)));
  };

  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  if (tagGroups.length === 0 && untaggedDefinitions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Expand/Collapse all controls */}
      {tagGroups.length > 0 && (
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
      {tagGroups.map(({ tag, definitions: tagDefinitions }) => {
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
                ({tagDefinitions.length})
              </span>
            </button>

            {/* Folder contents */}
            {isExpanded && (
              <div className="p-2 space-y-2 bg-white">
                {tagDefinitions.map((definition) => (
                  <DefinitionCard
                    key={`${tag.id}-${definition.id}`}
                    definition={definition}
                    onClick={() => onDefinitionClick(definition)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Untagged definitions */}
      {untaggedDefinitions.length > 0 && (
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
              ({untaggedDefinitions.length})
            </span>
          </button>

          {expandedFolders.has('__untagged__') && (
            <div className="p-2 space-y-2 bg-white">
              {untaggedDefinitions.map((definition) => (
                <DefinitionCard
                  key={`untagged-${definition.id}`}
                  definition={definition}
                  onClick={() => onDefinitionClick(definition)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
