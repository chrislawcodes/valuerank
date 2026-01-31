import { Plus, Check } from 'lucide-react';
import {
  CANONICAL_DIMENSIONS,
  type CanonicalDimension,
} from '@valuerank/shared/canonical-dimensions';

type CanonicalDimensionChipsProps = {
  /** Names of dimensions already added to the definition */
  existingDimensionNames: string[];
  /** Called when user clicks a canonical dimension to add it */
  onAddDimension: (dimension: CanonicalDimension) => void;
  /** Whether adding is disabled (e.g., during save) */
  disabled?: boolean;
};

/**
 * Displays clickable chips for canonical dimensions.
 * Dimensions already added show a checkmark and are non-clickable.
 * Clicking an available dimension adds it with pre-filled levels.
 */
export function CanonicalDimensionChips({
  existingDimensionNames,
  onAddDimension,
  disabled = false,
}: CanonicalDimensionChipsProps) {
  // Normalize existing names for comparison
  const existingNamesLower = new Set(
    existingDimensionNames.map((n) => n.toLowerCase())
  );

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-700">
          Canonical Attributes
        </h4>
        <span className="text-xs text-gray-400">
          Click to add with pre-filled levels
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {CANONICAL_DIMENSIONS.map((dim) => {
          const isAdded = existingNamesLower.has(dim.name.toLowerCase());

          return (
            // eslint-disable-next-line react/forbid-elements -- Chip toggle requires custom styling
            <button
              key={dim.name}
              type="button"
              onClick={() => !isAdded && !disabled && onAddDimension(dim)}
              disabled={isAdded || disabled}
              title={dim.description}
              className={`
                inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm
                transition-colors
                ${isAdded
                  ? 'bg-teal-100 text-teal-700 cursor-default'
                  : disabled
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 cursor-pointer'
                }
              `}
            >
              {isAdded ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>{dim.name.replace(/_/g, ' ')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
