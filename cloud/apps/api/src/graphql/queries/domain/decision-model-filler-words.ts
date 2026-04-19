/**
 * Filler-word tolerance for scale-label matching.
 *
 * Mirrors the Python `FILLER_WORDS_PATTERN` in workers/summarize_text.py.
 *
 * Words included (none appear as meaningful content in our value-statement
 * bodies, so stripping them from both sides is safe):
 *
 * - Articles (the|a|an): models often add or drop these.
 * - Possessive pronouns (their|my|your|his|her|its|our): canonical labels
 *   use second-person ("your team") but models frequently answer in first
 *   person ("my team") or with an article ("the team"). Skips personal
 *   pronouns (I/you/me/we) — those have more syntactic weight and could
 *   produce false matches.
 * - Level preset words (negligible|minimal|moderate|substantial|full):
 *   scale labels are level-agnostic by design — the level word appears only
 *   in the prompt sentence. Some models echo the level back into their
 *   answer ("...with full freedom in how they live"), which would
 *   otherwise break substring matching.
 */
const FILLER_WORDS_PATTERN =
  /\b(?:their|my|your|his|her|its|our|the|a|an|negligible|minimal|moderate|substantial|full)\b/gi;

export function stripFillerWords(normalized: string): string {
  return normalized
    .replace(FILLER_WORDS_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
