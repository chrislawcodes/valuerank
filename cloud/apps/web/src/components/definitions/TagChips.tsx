import { X, Link } from 'lucide-react';
import type { Tag } from '../../api/operations/tags';

type TagChipsProps = {
  tags: Tag[];
  maxDisplay?: number;
  onRemove?: (tagId: string) => void;
  onTagClick?: (tag: Tag) => void;
  size?: 'sm' | 'md';
  className?: string;
  /** IDs of tags that are inherited from parent (Phase 12) */
  inheritedTagIds?: Set<string>;
  /** Show inherited tags with different styling */
  showInheritedStyle?: boolean;
};

export function TagChips({
  tags,
  maxDisplay = 4,
  onRemove,
  onTagClick,
  size = 'sm',
  className = '',
  inheritedTagIds = new Set(),
  showInheritedStyle = true,
}: TagChipsProps) {
  if (tags.length === 0) {
    return null;
  }

  const displayedTags = tags.slice(0, maxDisplay);
  const remainingCount = tags.length - maxDisplay;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {displayedTags.map((tag) => {
        const isInherited = inheritedTagIds.has(tag.id);
        const canRemove = onRemove && !isInherited; // Can't remove inherited tags

        return (
          <span
            key={tag.id}
            className={`inline-flex items-center gap-1 rounded-full transition-colors ${sizeClasses[size]} ${
              onTagClick ? 'cursor-pointer' : ''
            } ${
              isInherited && showInheritedStyle
                ? 'bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            onClick={(e) => {
              if (onTagClick) {
                e.stopPropagation();
                onTagClick(tag);
              }
            }}
            role={onTagClick ? 'button' : undefined}
            tabIndex={onTagClick ? 0 : undefined}
            onKeyDown={(e) => {
              if (onTagClick && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.stopPropagation();
                onTagClick(tag);
              }
            }}
            title={isInherited ? `Inherited from parent` : undefined}
          >
            {isInherited && showInheritedStyle && (
              <Link className="w-3 h-3" />
            )}
            {tag.name}
            {canRemove && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(tag.id);
                }}
                className="hover:text-red-600 transition-colors rounded-full"
                aria-label={`Remove ${tag.name} tag`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        );
      })}
      {remainingCount > 0 && (
        <span
          className={`inline-flex items-center bg-gray-50 text-gray-500 rounded-full ${sizeClasses[size]}`}
        >
          +{remainingCount} more
        </span>
      )}
    </div>
  );
}
