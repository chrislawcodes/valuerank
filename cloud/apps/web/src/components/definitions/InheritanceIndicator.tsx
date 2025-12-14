/**
 * InheritanceIndicator - Shows whether a property is inherited or locally overridden.
 *
 * Used in DefinitionEditor to indicate which fields come from parent definitions
 * vs which are locally defined. Also provides a button to clear local override.
 */

type InheritanceIndicatorProps = {
  /** Whether this field is locally overridden (true) or inherited (false) */
  isOverridden: boolean;
  /** Whether the definition is a fork (has a parent to inherit from) */
  isForked: boolean;
  /** Name of the field for display and accessibility */
  fieldName: string;
  /** Callback when user wants to clear the local override */
  onClearOverride?: () => void;
  /** Show as a badge instead of inline text */
  variant?: 'badge' | 'inline';
};

export function InheritanceIndicator({
  isOverridden,
  isForked,
  fieldName,
  onClearOverride,
  variant = 'badge',
}: InheritanceIndicatorProps) {
  // Root definitions don't show inheritance indicators
  if (!isForked) {
    return null;
  }

  if (variant === 'badge') {
    return (
      <div className="flex items-center gap-2">
        {isOverridden ? (
          <>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
              title={`${fieldName} is locally defined`}
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
              Local
            </span>
            {onClearOverride && (
              <button
                type="button"
                onClick={onClearOverride}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
                title={`Clear local ${fieldName} and inherit from parent`}
              >
                Inherit from parent
              </button>
            )}
          </>
        ) : (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
            title={`${fieldName} is inherited from parent`}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
            Inherited
          </span>
        )}
      </div>
    );
  }

  // Inline variant - more compact
  return (
    <span className="text-xs text-gray-500">
      {isOverridden ? (
        <span className="text-blue-600" title={`${fieldName} is locally defined`}>
          (local)
        </span>
      ) : (
        <span className="text-gray-400" title={`${fieldName} is inherited from parent`}>
          (inherited)
        </span>
      )}
    </span>
  );
}

/**
 * InheritanceBanner - Shows a prominent banner when viewing a forked definition.
 */
type InheritanceBannerProps = {
  isForked: boolean;
  parentName?: string;
  parentId?: string;
  /** Navigate to parent definition */
  onViewParent?: () => void;
};

export function InheritanceBanner({
  isForked,
  parentName,
  parentId: _parentId,
  onViewParent,
}: InheritanceBannerProps) {
  if (!isForked) {
    return null;
  }

  return (
    <div className="mb-4 p-3 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-purple-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span className="text-sm text-purple-800">
            This is a fork of{' '}
            {onViewParent && parentName ? (
              <button
                type="button"
                onClick={onViewParent}
                className="font-medium underline hover:text-purple-600"
              >
                {parentName}
              </button>
            ) : (
              <span className="font-medium">{parentName || 'parent definition'}</span>
            )}
          </span>
        </div>
        <span className="text-xs text-purple-600">
          Properties without local overrides are inherited from parent
        </span>
      </div>
    </div>
  );
}
