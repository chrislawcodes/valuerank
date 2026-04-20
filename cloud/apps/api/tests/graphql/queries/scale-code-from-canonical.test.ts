import { describe, expect, it } from 'vitest';

import { scaleCodeFromCanonical } from '../../../src/graphql/queries/domain/scale-code-from-canonical.js';
import type { CachedWinnerFirstDecision } from '../../../src/graphql/queries/domain/decision-model-types.js';

const PAIR = { valueA: 'Self_Direction_Action', valueB: 'Security_Personal' } as const;

function makeCanonical(
  overrides: Partial<CachedWinnerFirstDecision> = {},
): CachedWinnerFirstDecision {
  return {
    cacheVersion: 2,
    decisionState: 'resolved',
    strength: 'strong',
    favoredValueKey: 'Self_Direction_Action',
    ...overrides,
  };
}

describe('scaleCodeFromCanonical — resolved cases', () => {
  it('valueA + strong + un-flipped → "5"', () => {
    const c = makeCanonical({
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Self_Direction_Action',
    });
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('5');
  });

  it('valueA + strong + flipped → "1"', () => {
    const c = makeCanonical({
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Self_Direction_Action',
    });
    expect(scaleCodeFromCanonical(c, PAIR, true)).toBe('1');
  });

  it('valueA + lean + un-flipped → "4"', () => {
    const c = makeCanonical({
      decisionState: 'resolved',
      strength: 'lean',
      favoredValueKey: 'Self_Direction_Action',
    });
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('4');
  });

  it('valueA + lean + flipped → "2"', () => {
    const c = makeCanonical({
      decisionState: 'resolved',
      strength: 'lean',
      favoredValueKey: 'Self_Direction_Action',
    });
    expect(scaleCodeFromCanonical(c, PAIR, true)).toBe('2');
  });

  it('valueB + strong + un-flipped → "1"', () => {
    const c = makeCanonical({
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Security_Personal',
    });
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('1');
  });

  it('valueB + strong + flipped → "5"', () => {
    const c = makeCanonical({
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Security_Personal',
    });
    expect(scaleCodeFromCanonical(c, PAIR, true)).toBe('5');
  });

  it('valueB + lean + un-flipped → "2"', () => {
    const c = makeCanonical({
      decisionState: 'resolved',
      strength: 'lean',
      favoredValueKey: 'Security_Personal',
    });
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('2');
  });

  it('valueB + lean + flipped → "4"', () => {
    const c = makeCanonical({
      decisionState: 'resolved',
      strength: 'lean',
      favoredValueKey: 'Security_Personal',
    });
    expect(scaleCodeFromCanonical(c, PAIR, true)).toBe('4');
  });
});

describe('scaleCodeFromCanonical — orientation-invariant cases', () => {
  it('neutral decisionState → "3" (un-flipped)', () => {
    const c = makeCanonical({
      decisionState: 'neutral',
      strength: 'neutral',
      favoredValueKey: null,
    });
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('3');
  });

  it('neutral decisionState → "3" (flipped)', () => {
    const c = makeCanonical({
      decisionState: 'neutral',
      strength: 'neutral',
      favoredValueKey: null,
    });
    expect(scaleCodeFromCanonical(c, PAIR, true)).toBe('3');
  });

  it('refusal → "refusal" regardless of orientation', () => {
    const c = makeCanonical({
      decisionState: 'refusal',
      strength: 'unknown',
      favoredValueKey: null,
    });
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('refusal');
    expect(scaleCodeFromCanonical(c, PAIR, true)).toBe('refusal');
  });

  it('unknown → "unknown" regardless of orientation', () => {
    const c = makeCanonical({
      decisionState: 'unknown',
      strength: 'unknown',
      favoredValueKey: null,
    });
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('unknown');
    expect(scaleCodeFromCanonical(c, PAIR, true)).toBe('unknown');
  });
});

describe('scaleCodeFromCanonical — malformed canonicals fall to unknown', () => {
  it('resolved with null favoredValueKey → "unknown"', () => {
    const c = makeCanonical({
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: null,
    });
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('unknown');
  });

  it('resolved with strength=unknown → "unknown"', () => {
    const c = makeCanonical({
      decisionState: 'resolved',
      strength: 'unknown',
      favoredValueKey: 'Self_Direction_Action',
    });
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('unknown');
  });

  it('resolved with strength=neutral → "unknown"', () => {
    const c = makeCanonical({
      decisionState: 'resolved',
      strength: 'neutral',
      favoredValueKey: 'Self_Direction_Action',
    });
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('unknown');
  });

  it('resolved with favoredValueKey not in pair → "unknown"', () => {
    const c = makeCanonical({
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Tradition',
    });
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('unknown');
  });
});

describe('scaleCodeFromCanonical — cacheVersion tolerance', () => {
  it('accepts cacheVersion 1 canonicals (deploy-window bridge)', () => {
    const c: CachedWinnerFirstDecision = {
      cacheVersion: 1,
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Self_Direction_Action',
    };
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('5');
  });

  it('accepts cacheVersion 2 canonicals', () => {
    const c: CachedWinnerFirstDecision = {
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Self_Direction_Action',
    };
    expect(scaleCodeFromCanonical(c, PAIR, false)).toBe('5');
  });
});
