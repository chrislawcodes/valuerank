/**
 * Level-word tolerance for scale-label matching.
 *
 * Mirrors the Python `FILLER_WORDS_PATTERN` in workers/summarize_text.py.
 *
 * The 5 level preset words (negligible|minimal|moderate|substantial|full)
 * never appear in the canonical scale labels — labels are level-agnostic by
 * design. The level word appears only in the prompt sentence:
 *
 *   "One program provides citizens with [negligible|...|full] freedom..."
 *
 * Some models echo the level word back into the scale-label they pick:
 *
 *   "Strongly support the program that provides citizens with full freedom..."
 *
 * That insertion breaks substring matching against the canonical label
 * ("...with freedom..."). Stripping these words from the candidate text
 * before matching recovers those decisions. None of the value-statement
 * bodies across the four current domains contain these words, so stripping
 * is safe.
 */
const LEVEL_TOLERANT_FILLER_PATTERN = /\b(?:negligible|minimal|moderate|substantial|full)\b/gi;

export function stripLevelWords(normalized: string): string {
  return normalized
    .replace(LEVEL_TOLERANT_FILLER_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
