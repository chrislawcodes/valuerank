import { useState, type ReactNode } from 'react';
import { Filter, ChevronDown, X } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/utils';

type CollapsibleFiltersProps = {
  /** Filter content to show */
  children: ReactNode;
  /** Title shown in collapsed state */
  title?: string;
  /** Whether any filters are currently active */
  hasActiveFilters?: boolean;
  /** Number of active filters (shown as badge) */
  activeFilterCount?: number;
  /** Callback to clear all filters */
  onClear?: () => void;
  /** Additional className for the container */
  className?: string;
  /** Start collapsed on mobile (default: true) */
  defaultCollapsed?: boolean;
};

/**
 * Collapsible filter wrapper for mobile viewports
 *
 * On desktop (>= 640px): Shows filters inline
 * On mobile (< 640px): Collapses into an expandable panel
 *
 * Children are rendered ONCE and the container styling changes based on viewport.
 *
 * @example
 * <CollapsibleFilters
 *   title="Filters"
 *   hasActiveFilters={filters.length > 0}
 *   activeFilterCount={filters.length}
 *   onClear={handleClearFilters}
 * >
 *   <StatusFilter ... />
 *   <TagFilter ... />
 * </CollapsibleFilters>
 */
export function CollapsibleFilters({
  children,
  title = 'Filters',
  hasActiveFilters = false,
  activeFilterCount,
  onClear,
  className,
  defaultCollapsed = true,
}: CollapsibleFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);

  return (
    <div className={cn('w-full', className)}>
      {/* Mobile: Collapsible trigger (hidden on desktop) */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              'flex-1 justify-between min-h-[44px]',
              hasActiveFilters && 'bg-teal-50 border-teal-300 text-teal-700'
            )}
            aria-expanded={isExpanded}
            aria-controls="collapsible-filters-content"
          >
            <span className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              {title}
              {activeFilterCount !== undefined && activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-teal-600 text-white text-xs font-medium rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </span>
            <ChevronDown
              className={cn(
                'w-4 h-4 transition-transform duration-200',
                isExpanded && 'rotate-180'
              )}
            />
          </Button>

          {/* Clear button when filters are active */}
          {hasActiveFilters && onClear && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="min-h-[44px] px-3 text-gray-500 hover:text-gray-700"
              aria-label="Clear all filters"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Filter content - rendered once with responsive styling */}
      <div
        id="collapsible-filters-content"
        className={cn(
          // Mobile: collapsible with animation
          'sm:block sm:max-h-none sm:opacity-100 sm:mt-0 sm:p-0 sm:bg-transparent sm:rounded-none sm:border-0',
          // Mobile collapsed/expanded states
          'overflow-hidden transition-all duration-200 ease-in-out',
          isExpanded
            ? 'max-h-[500px] opacity-100 mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200'
            : 'max-h-0 opacity-0 sm:overflow-visible'
        )}
      >
        {children}
      </div>
    </div>
  );
}
