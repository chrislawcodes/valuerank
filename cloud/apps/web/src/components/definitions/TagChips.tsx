import { X, Link } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
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

  const badgeSize = size === 'sm' ? 'sm' : 'md';

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {displayedTags.map((tag) => {
        const isInherited = inheritedTagIds.has(tag.id);
        const canRemove = onRemove && !isInherited; // Can't remove inherited tags
        const variant = isInherited && showInheritedStyle ? 'inherited' : 'tag';

        return (
          <Badge
            key={tag.id}
            variant={variant}
            size={badgeSize}
            className={`gap-1 rounded-full transition-colors ${
              onTagClick ? 'cursor-pointer hover:opacity-80' : ''
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
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(tag.id);
                }}
                variant="ghost"
                size="icon"
                className="w-4 h-4 p-0 hover:text-red-600 hover:bg-transparent"
                aria-label={`Remove ${tag.name} tag`}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </Badge>
        );
      })}
      {remainingCount > 0 && (
        <Badge variant="neutral" size={badgeSize} className="rounded-full">
          +{remainingCount} more
        </Badge>
      )}
    </div>
  );
}
