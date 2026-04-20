/**
 * Translates the UI decision-override dropdown's selected scale code
 * (e.g. "1", "2", "3", "4", "5") into the canonical mutation input shape
 * `{decisionState, favoredValueKey?, strength?}` that the server expects.
 *
 * The legacy dropdown still emits 1–5 strings because it's a visual layer
 * over the probe scale. The server no longer accepts that format, so we
 * translate here at the dispatch boundary.
 */

type Pair = { valueA: string; valueB: string } | null;

export type ManualDecisionInput = {
  decisionState: 'resolved' | 'neutral' | 'unknown' | 'refusal';
  favoredValueKey?: string | null;
  strength?: 'strong' | 'lean' | null;
};

export type ManualDecisionDropdownValue =
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | 'refusal'
  | 'unknown'
  | string;

function extractPair(definitionSnapshot: unknown): Pair {
  if (definitionSnapshot == null || typeof definitionSnapshot !== 'object' || Array.isArray(definitionSnapshot)) return null;
  const components = (definitionSnapshot as { components?: unknown }).components;
  if (components == null || typeof components !== 'object' || Array.isArray(components)) return null;
  const vf = (components as { value_first?: unknown }).value_first;
  const vs = (components as { value_second?: unknown }).value_second;
  if (vf == null || typeof vf !== 'object' || Array.isArray(vf)) return null;
  if (vs == null || typeof vs !== 'object' || Array.isArray(vs)) return null;
  const a = (vf as { token?: unknown }).token;
  const b = (vs as { token?: unknown }).token;
  if (typeof a !== 'string' || typeof b !== 'string') return null;
  return { valueA: a, valueB: b };
}

/**
 * Map a dropdown selection + vignette pair + orientation to a canonical
 * mutation input. Returns null if the selection is a resolved-type code
 * but the pair or orientation cannot be determined (caller should handle
 * by surfacing an error — a resolved override without a known pair is a
 * data quality problem).
 */
export function toManualDecisionInput(
  selected: ManualDecisionDropdownValue,
  definitionSnapshot: unknown,
  orientationFlipped: boolean | null,
): ManualDecisionInput | null {
  const code = String(selected).trim();

  if (code === 'refusal') {
    return { decisionState: 'refusal' };
  }
  if (code === 'unknown' || code === '') {
    return { decisionState: 'unknown' };
  }
  if (code === '3') {
    return { decisionState: 'neutral' };
  }

  const pair = extractPair(definitionSnapshot);
  if (pair == null) return null;
  const flipped = orientationFlipped === true;

  // Un-flipped: 5=A strong, 4=A lean, 2=B lean, 1=B strong.
  // Flipped:    5=B strong, 4=B lean, 2=A lean, 1=A strong.
  let favoredValueKey: string;
  let strength: 'strong' | 'lean';
  if (code === '5') {
    favoredValueKey = flipped ? pair.valueB : pair.valueA;
    strength = 'strong';
  } else if (code === '4') {
    favoredValueKey = flipped ? pair.valueB : pair.valueA;
    strength = 'lean';
  } else if (code === '2') {
    favoredValueKey = flipped ? pair.valueA : pair.valueB;
    strength = 'lean';
  } else if (code === '1') {
    favoredValueKey = flipped ? pair.valueA : pair.valueB;
    strength = 'strong';
  } else {
    return null;
  }

  return { decisionState: 'resolved', favoredValueKey, strength };
}
