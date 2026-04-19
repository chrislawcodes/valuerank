import type { DecisionMetadata } from '../../utils/methodology';
import type { TranscriptDecisionModelV2Canonical } from '../../api/operations/runs';

/**
 * Build a hover-tooltip string for the decision display in a transcript row.
 *
 * For resolved decisions: returns the generic label ("Decision summary" or
 * "Decision") — matches the prior behavior.
 *
 * For unresolved / ambiguous / fallback decisions: returns a multi-line
 * string with the parser's investigation data (parseClass, parsePath,
 * matchedLabel if any, and the first ~280 chars of the model's response
 * via responseExcerpt) so operators can see *why* the parser gave up
 * without having to open the transcript.
 */
export function buildDecisionTooltip(
  canonical: TranscriptDecisionModelV2Canonical | null,
  metadata: DecisionMetadata | null,
  mode: 'audit' | 'legacy',
): string {
  const genericLabel = mode === 'audit' ? 'Decision summary' : 'Decision';

  const isUnresolved =
    canonical == null
    || canonical.direction === 'unknown'
    || canonical.strength === 'unknown'
    || canonical.source === 'error';
  const isBorderline = metadata?.parseClass === 'ambiguous' || metadata?.parseClass === 'fallback_resolved';

  if (!isUnresolved && !isBorderline) {
    return genericLabel;
  }

  const parts: string[] = [];
  if (isUnresolved) {
    parts.push('Decision could not be resolved from the model response.');
  }
  if (metadata?.parseClass) {
    parts.push(`Parse class: ${metadata.parseClass}`);
  }
  if (metadata?.parsePath) {
    parts.push(`Parse path: ${metadata.parsePath}`);
  }
  if (metadata?.matchedLabel) {
    parts.push(`Matched label: ${metadata.matchedLabel}`);
  }
  if (metadata?.responseExcerpt) {
    parts.push(`Model response: ${metadata.responseExcerpt}`);
  }

  return parts.length > 0 ? parts.join('\n') : genericLabel;
}
