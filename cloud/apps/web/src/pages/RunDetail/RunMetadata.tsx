/**
 * Run Metadata
 *
 * Displays metadata row with dates and duration.
 */

import { Calendar, Clock, Play } from 'lucide-react';
import { formatTemperatureSetting } from '../../lib/temperature';

type RunMetadataProps = {
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  temperature?: number | null;
};

/**
 * Format a date string for display.
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Calculate run duration.
 */
function calculateDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const durationMs = end.getTime() - start.getTime();

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function RunMetadata({ createdAt, startedAt, completedAt, temperature }: RunMetadataProps) {
  return (
    <div className="flex items-center gap-6 text-sm text-gray-500 mb-6 pb-6 border-b border-gray-200">
      <span className="flex items-center gap-1">
        <Calendar className="w-4 h-4" />
        Created {formatDate(createdAt)}
      </span>
      {startedAt && (
        <span className="flex items-center gap-1">
          <Play className="w-4 h-4" />
          Started {formatDate(startedAt)}
        </span>
      )}
      <span className="flex items-center gap-1">
        <Clock className="w-4 h-4" />
        Duration: {calculateDuration(startedAt, completedAt)}
      </span>
      <span>{formatTemperatureSetting(temperature)}</span>
    </div>
  );
}
