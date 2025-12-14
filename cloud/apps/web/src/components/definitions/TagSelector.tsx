import { useState, useRef, useEffect, useMemo } from 'react';
import { Tag as TagIcon, Plus, Check, X, ChevronDown, Link } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { Tag } from '../../api/operations/tags';
import { useTags } from '../../hooks/useTags';

type TagSelectorProps = {
  selectedTags: Tag[];
  /** Tags inherited from parent definitions (read-only) */
  inheritedTags?: Tag[];
  onTagAdd: (tagId: string) => void;
  onTagRemove: (tagId: string) => void;
  onTagCreate: (tagName: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
};

export function TagSelector({
  selectedTags,
  inheritedTags = [],
  onTagAdd,
  onTagRemove,
  onTagCreate,
  disabled = false,
  className = '',
}: TagSelectorProps) {
  // Create a set of inherited tag IDs for efficient lookup
  const inheritedTagIds = useMemo(
    () => new Set(inheritedTags.map((t) => t.id)),
    [inheritedTags]
  );
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { tags: allTags, loading } = useTags();

  // Filter out already selected/inherited tags and apply search
  const availableTags = allTags.filter((tag) => {
    const isSelected = selectedTags.some((t) => t.id === tag.id);
    const isInherited = inheritedTagIds.has(tag.id);
    const matchesSearch = !search || tag.name.toLowerCase().includes(search.toLowerCase());
    return !isSelected && !isInherited && matchesSearch;
  });

  // Check if search term could create a new tag
  const canCreateNew =
    search.trim().length > 0 &&
    !allTags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleTagSelect = (tag: Tag) => {
    onTagAdd(tag.id);
    setSearch('');
  };

  const handleCreateTag = async () => {
    if (!canCreateNew || isCreating) return;

    setIsCreating(true);
    try {
      await onTagCreate(search.trim());
      setSearch('');
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canCreateNew) {
      e.preventDefault();
      handleCreateTag();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Selected tags (local + inherited) */}
      <div className="flex flex-wrap gap-1 mb-2">
        {/* Inherited tags first (read-only, purple styling) */}
        {inheritedTags.map((tag) => (
          <Badge
            key={`inherited-${tag.id}`}
            variant="inherited"
            size="md"
            className="gap-1 rounded-full"
            title="Inherited from parent definition"
          >
            <Link className="w-3 h-3" />
            {tag.name}
          </Badge>
        ))}
        {/* Local tags (removable) */}
        {selectedTags.map((tag) => (
          <Badge
            key={tag.id}
            variant="selected"
            size="md"
            className="gap-1 rounded-full"
          >
            {tag.name}
            <Button
              type="button"
              onClick={() => onTagRemove(tag.id)}
              disabled={disabled}
              variant="ghost"
              size="icon"
              className="w-4 h-4 p-0 hover:text-teal-900 hover:bg-transparent"
              aria-label={`Remove ${tag.name} tag`}
            >
              <X className="w-3 h-3" />
            </Button>
          </Badge>
        ))}
      </div>

      {/* Dropdown trigger */}
      <Button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        variant="secondary"
        size="sm"
        className="gap-2"
      >
        <TagIcon className="w-4 h-4" />
        Add Tag
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search or create tag..."
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          {/* Tag list */}
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="p-3 text-sm text-gray-500 text-center">Loading tags...</div>
            ) : (
              <>
                {/* Create new tag option */}
                {canCreateNew && (
                  // eslint-disable-next-line react/forbid-elements -- Menu item requires custom full-width layout
                  <button
                    type="button"
                    onClick={handleCreateTag}
                    disabled={isCreating}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-teal-50 flex items-center gap-2 text-teal-600 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    Create &quot;{search.trim()}&quot;
                    {isCreating && <span className="text-xs">(creating...)</span>}
                  </button>
                )}

                {/* Existing tags */}
                {availableTags.length > 0 ? (
                  availableTags.map((tag) => (
                    // eslint-disable-next-line react/forbid-elements -- Menu item requires custom full-width layout
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleTagSelect(tag)}
                      className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center justify-between"
                    >
                      <span>{tag.name}</span>
                      <Check className="w-4 h-4 text-gray-300" />
                    </button>
                  ))
                ) : (
                  !canCreateNew && (
                    <div className="p-3 text-sm text-gray-500 text-center">
                      {search ? 'No matching tags' : 'No tags available'}
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
