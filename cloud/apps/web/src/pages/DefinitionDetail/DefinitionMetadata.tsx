/**
 * Definition Metadata
 *
 * Displays metadata row with creation date, run count, and fork count.
 */

import { Calendar, Play, GitBranch } from 'lucide-react';

type DefinitionMetadataProps = {
  createdAt: string;
  runCount: number;
  childCount: number;
};

/**
 * Format a date string for display.
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DefinitionMetadata({ createdAt, runCount, childCount }: DefinitionMetadataProps) {
  return (
    <div className="flex items-center gap-6 text-sm text-gray-500 mb-6 pb-6 border-b border-gray-200">
      <span className="flex items-center gap-1">
        <Calendar className="w-4 h-4" />
        Created {formatDate(createdAt)}
      </span>
      <span className="flex items-center gap-1">
        <Play className="w-4 h-4" />
        {runCount} run{runCount !== 1 ? 's' : ''}
      </span>
      {childCount > 0 && (
        <span className="flex items-center gap-1">
          <GitBranch className="w-4 h-4" />
          {childCount} fork{childCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
