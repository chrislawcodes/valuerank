import { X } from 'lucide-react';
import type { Tag } from '../../api/operations/tags';

type TagChipsProps = {
  tags: Tag[];
  maxDisplay?: number;
  onRemove?: (tagId: string) => void;
  onTagClick?: (tag: Tag) => void;
  size?: 'sm' | 'md';
  className?: string;
};

export function TagChips({
  tags,
  maxDisplay = 4,
  onRemove,
  onTagClick,
  size = 'sm',
  className = '',
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
      {displayedTags.map((tag) => (
        <span
          key={tag.id}
          className={`inline-flex items-center gap-1 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors ${sizeClasses[size]} ${onTagClick ? 'cursor-pointer' : ''}`}
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
        >
          {tag.name}
          {onRemove && (
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
      ))}
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
