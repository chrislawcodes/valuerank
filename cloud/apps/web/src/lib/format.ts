/**
 * Formatting utilities
 */

/**
 * Format a transcript's createdAt timestamp for display in lists and detail views.
 * Always shows MM/DD/YYYY HH:MM AM/PM Pacific.
 */
export function formatTranscriptDate(dateString: string): string {
  const date = new Date(dateString);
  const datePart = date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  });
  return `${datePart} ${timePart} Pacific`;
}

/**
 * Format a run's display name.
 * If the run has a custom name, use it.
 * Otherwise, generate an algorithmic name from the definition name and date.
 *
 * @param run - Object with optional name and definition/date info
 * @returns The display name for the run
 */
export function formatRunName(run: {
  name?: string | null;
  definition?: { name: string } | null;
  createdAt: string | Date;
}): string {
  // Use custom name if set
  if (run.name) {
    return run.name;
  }

  // Generate algorithmic name
  const date = new Date(run.createdAt);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const definitionName = run.definition?.name || 'Unknown';

  return `Run: ${definitionName} on ${dateStr}`;
}

/**
 * Format a run's short display name (for compact displays).
 * Returns just the custom name or a truncated definition name.
 *
 * @param run - Object with optional name and definition info
 * @param maxLength - Maximum length before truncation (default 30)
 * @returns The short display name for the run
 */
export function formatRunNameShort(
  run: {
    name?: string | null;
    definition?: { name: string } | null;
    createdAt: string | Date;
  },
  maxLength = 30
): string {
  const fullName = formatRunName(run);

  if (fullName.length <= maxLength) {
    return fullName;
  }

  return fullName.slice(0, maxLength - 3) + '...';
}
