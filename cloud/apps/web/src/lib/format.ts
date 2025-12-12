/**
 * Formatting utilities
 */

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
