import { FileText, GitBranch, Play, Calendar } from 'lucide-react';
import type { Definition } from '../../api/operations/definitions';
import { TagChips } from './TagChips';

type DefinitionCardProps = {
  definition: Definition;
  onClick?: () => void;
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DefinitionCard({ definition, onClick }: DefinitionCardProps) {
  const hasParent = definition.parentId !== null;
  const childrenCount = definition.children?.length ?? 0;
  const hasChildren = childrenCount > 0;

  return (
    // eslint-disable-next-line react/forbid-elements -- Card button requires custom full-width layout styling
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-lg border border-gray-200 p-4 hover:border-teal-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <h3 className="font-medium text-gray-900 truncate">{definition.name}</h3>
        </div>
        {/* Version indicator */}
        {hasParent && (
          <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">
            <GitBranch className="w-3 h-3" />
            Fork
          </span>
        )}
      </div>

      {/* Tags */}
      {definition.tags.length > 0 && (
        <TagChips tags={definition.tags} maxDisplay={4} size="sm" className="mb-3" />
      )}

      {/* Meta info */}
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {formatDate(definition.createdAt)}
        </span>
        <span className="flex items-center gap-1">
          <Play className="w-4 h-4" />
          {definition.runCount} run{definition.runCount !== 1 ? 's' : ''}
        </span>
        {hasChildren && (
          <span className="flex items-center gap-1">
            <GitBranch className="w-4 h-4" />
            {childrenCount} fork{childrenCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  );
}
