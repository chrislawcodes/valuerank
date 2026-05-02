/**
 * Value-pair canonicalization for the pressure-sensitivity report.
 *
 * Per spec FR-024:
 *  - Pair identity is the alphabetically sorted tuple of value tokens, joined by `::`.
 *  - The canonical first/second coordinates are assigned alphabetically (sorted[0] / sorted[1]).
 *  - When a Definition's stored `value_first` order disagrees with canonical own, the
 *    transcript-emitted `favor_first` / `favor_second` direction is remapped before bucketing.
 *
 * Self-pairs and missing tokens collapse to null (excluded under FR-018(g) by callers).
 */

export type CanonicalDirection =
  | 'favor_first'
  | 'favor_second'
  | 'neutral'
  | 'refusal'
  | 'unknown';

export type AssignedOutcome = 'own_picked' | 'opponent_picked' | 'neutral' | 'unscored';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Returns the canonical pair key (alphabetically sorted tokens joined by `::`) for a value pair.
 * Returns null for missing tokens, non-string tokens, or self-pairs.
 */
export function canonicalValuePairKey(tokenA: unknown, tokenB: unknown): string | null {
  if (!isNonEmptyString(tokenA) || !isNonEmptyString(tokenB)) return null;
  const a = tokenA.trim();
  const b = tokenB.trim();
  if (a === b) return null;
  return [a, b].sort().join('::');
}

/**
 * Returns `[firstValueToken, secondValueToken]` for the canonical assignment. Inputs are
 * assumed to already pass `canonicalValuePairKey`'s validation.
 */
export function canonicalOwnOpponent(tokenA: string, tokenB: string): [string, string] {
  const sorted = [tokenA.trim(), tokenB.trim()].sort();
  return [sorted[0]!, sorted[1]!];
}

/**
 * Maps a transcript's canonical decision direction (which is relative to the Definition's
 * stored `value_first` / `value_second` order) to `own_picked` / `opponent_picked` / `neutral`
 * / `unscored` in canonical (alphabetical) own/opponent terms.
 *
 * If the Definition's `value_first` token is NOT the canonical own, `favor_first` and
 * `favor_second` are swapped — this is the round-4 remap fix that prevents inverted Δ
 * values for mirrored Definitions.
 */
export function assignOwnOpponent(
  valueFirstToken: string,
  valueSecondToken: string,
  canonicalDirection: CanonicalDirection,
): AssignedOutcome {
  if (canonicalDirection === 'refusal' || canonicalDirection === 'unknown') return 'unscored';
  if (canonicalDirection === 'neutral') return 'neutral';

  const [firstValueToken] = canonicalOwnOpponent(valueFirstToken, valueSecondToken);
  const valueFirstIsFirst = valueFirstToken.trim() === firstValueToken;

  if (canonicalDirection === 'favor_first') {
    return valueFirstIsFirst ? 'own_picked' : 'opponent_picked';
  }
  // favor_second
  return valueFirstIsFirst ? 'opponent_picked' : 'own_picked';
}

type DefinitionDimensionLite = {
  name?: unknown;
  levels?: unknown;
};

/**
 * Looks up the (own, opponent) pressure level pair for a scenario against its parent Definition's
 * dimensions. Matches dimensions to value tokens by `name`, regardless of `value_first`/`value_second`
 * order in the Definition. Returns null if either dimension is missing or its scenario-side value
 * cannot be resolved by the lookup.
 */
export function assignOwnOpponentLevels(
  definitionDimensions: ReadonlyArray<DefinitionDimensionLite>,
  scenarioDimensionValues: Record<string, unknown>,
  ownLookup: (rawLabel: unknown) => number | null,
  opponentLookup: (rawLabel: unknown) => number | null,
  firstValueToken: string,
  secondValueToken: string,
): { ownLevel: number; opponentLevel: number } | null {
  const ownTrimmed = firstValueToken.trim();
  const opponentTrimmed = secondValueToken.trim();

  const ownDim = definitionDimensions.find(
    (d) => typeof d.name === 'string' && d.name.trim().toLowerCase() === ownTrimmed.toLowerCase(),
  );
  const opponentDim = definitionDimensions.find(
    (d) => typeof d.name === 'string' && d.name.trim().toLowerCase() === opponentTrimmed.toLowerCase(),
  );
  if (!ownDim || !opponentDim) return null;

  const ownStoredName = (ownDim.name as string).trim();
  const opponentStoredName = (opponentDim.name as string).trim();
  const ownRaw = scenarioDimensionValues[ownStoredName];
  const opponentRaw = scenarioDimensionValues[opponentStoredName];
  if (ownRaw === undefined || opponentRaw === undefined) return null;

  const ownLevel = ownLookup(ownRaw);
  const opponentLevel = opponentLookup(opponentRaw);
  if (ownLevel === null || opponentLevel === null) return null;

  return { ownLevel, opponentLevel };
}
