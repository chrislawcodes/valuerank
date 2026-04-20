import { describe, expect, it } from 'vitest';

import { canonicalFromDecisionCode, pairFromSnapshot } from '../backfill-canonical-v2-migration.js';

/**
 * Truth-table tests for the migration helper. These lock in the mapping
 * from (decisionCode, orientationFlipped) to a v2 canonicalDecision.
 *
 * Invariants:
 *   - Every return has cacheVersion === 2 literally (no v1 escapes this
 *     helper).
 *   - "3" (neutral) and "refusal" and absent/"other" are
 *     orientation-invariant.
 *   - "5"/"4"/"2"/"1" flip favoredValueKey when orientationFlipped is true.
 */

const PAIR = { valueA: 'Self_Direction_Action', valueB: 'Security_Personal' } as const;

describe('canonicalFromDecisionCode — resolved cases', () => {
  it('"5" + !flipped → strong favor_first, favoredValueKey = valueA', () => {
    expect(canonicalFromDecisionCode('5', PAIR, false)).toEqual({
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Self_Direction_Action',
    });
  });

  it('"5" + flipped → strong favor_second, favoredValueKey = valueB', () => {
    expect(canonicalFromDecisionCode('5', PAIR, true)).toEqual({
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Security_Personal',
    });
  });

  it('"4" + !flipped → lean, favoredValueKey = valueA', () => {
    expect(canonicalFromDecisionCode('4', PAIR, false)).toEqual({
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'lean',
      favoredValueKey: 'Self_Direction_Action',
    });
  });

  it('"4" + flipped → lean, favoredValueKey = valueB', () => {
    expect(canonicalFromDecisionCode('4', PAIR, true)).toEqual({
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'lean',
      favoredValueKey: 'Security_Personal',
    });
  });

  it('"2" + !flipped → lean, favoredValueKey = valueB (opposite side)', () => {
    expect(canonicalFromDecisionCode('2', PAIR, false)).toEqual({
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'lean',
      favoredValueKey: 'Security_Personal',
    });
  });

  it('"2" + flipped → lean, favoredValueKey = valueA', () => {
    expect(canonicalFromDecisionCode('2', PAIR, true)).toEqual({
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'lean',
      favoredValueKey: 'Self_Direction_Action',
    });
  });

  it('"1" + !flipped → strong, favoredValueKey = valueB', () => {
    expect(canonicalFromDecisionCode('1', PAIR, false)).toEqual({
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Security_Personal',
    });
  });

  it('"1" + flipped → strong, favoredValueKey = valueA', () => {
    expect(canonicalFromDecisionCode('1', PAIR, true)).toEqual({
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Self_Direction_Action',
    });
  });
});

describe('canonicalFromDecisionCode — orientation-invariant cases', () => {
  it('"3" + !flipped → neutral, null favoredValueKey', () => {
    expect(canonicalFromDecisionCode('3', PAIR, false)).toEqual({
      cacheVersion: 2,
      decisionState: 'neutral',
      strength: 'neutral',
      favoredValueKey: null,
    });
  });

  it('"3" + flipped → same neutral (orientation-invariant)', () => {
    expect(canonicalFromDecisionCode('3', PAIR, true)).toEqual({
      cacheVersion: 2,
      decisionState: 'neutral',
      strength: 'neutral',
      favoredValueKey: null,
    });
  });

  it('"refusal" + !flipped → refusal, null key', () => {
    expect(canonicalFromDecisionCode('refusal', PAIR, false)).toEqual({
      cacheVersion: 2,
      decisionState: 'refusal',
      strength: 'unknown',
      favoredValueKey: null,
    });
  });

  it('"refusal" + flipped → same refusal (orientation-invariant)', () => {
    expect(canonicalFromDecisionCode('refusal', PAIR, true)).toEqual({
      cacheVersion: 2,
      decisionState: 'refusal',
      strength: 'unknown',
      favoredValueKey: null,
    });
  });

  it('"other" + !flipped → unknown, null key', () => {
    expect(canonicalFromDecisionCode('other', PAIR, false)).toEqual({
      cacheVersion: 2,
      decisionState: 'unknown',
      strength: 'unknown',
      favoredValueKey: null,
    });
  });

  it('"other" + flipped → same unknown (orientation-invariant)', () => {
    expect(canonicalFromDecisionCode('other', PAIR, true)).toEqual({
      cacheVersion: 2,
      decisionState: 'unknown',
      strength: 'unknown',
      favoredValueKey: null,
    });
  });
});

describe('canonicalFromDecisionCode — missing decisionCode cases', () => {
  it('null + !flipped → unknown', () => {
    expect(canonicalFromDecisionCode(null, PAIR, false)).toEqual({
      cacheVersion: 2,
      decisionState: 'unknown',
      strength: 'unknown',
      favoredValueKey: null,
    });
  });

  it('null + flipped → unknown', () => {
    expect(canonicalFromDecisionCode(null, PAIR, true)).toEqual({
      cacheVersion: 2,
      decisionState: 'unknown',
      strength: 'unknown',
      favoredValueKey: null,
    });
  });

  it('undefined + !flipped → unknown', () => {
    expect(canonicalFromDecisionCode(undefined, PAIR, false)).toEqual({
      cacheVersion: 2,
      decisionState: 'unknown',
      strength: 'unknown',
      favoredValueKey: null,
    });
  });

  it('undefined + flipped → unknown', () => {
    expect(canonicalFromDecisionCode(undefined, PAIR, true)).toEqual({
      cacheVersion: 2,
      decisionState: 'unknown',
      strength: 'unknown',
      favoredValueKey: null,
    });
  });

  it('empty string + !flipped → unknown', () => {
    expect(canonicalFromDecisionCode('', PAIR, false)).toEqual({
      cacheVersion: 2,
      decisionState: 'unknown',
      strength: 'unknown',
      favoredValueKey: null,
    });
  });

  it('empty string + flipped → unknown', () => {
    expect(canonicalFromDecisionCode('', PAIR, true)).toEqual({
      cacheVersion: 2,
      decisionState: 'unknown',
      strength: 'unknown',
      favoredValueKey: null,
    });
  });
});

describe('canonicalFromDecisionCode — invariants', () => {
  it('every decisionCode input returns cacheVersion === 2 literally', () => {
    const inputs: (string | null | undefined)[] = [
      '1', '2', '3', '4', '5',
      'refusal', 'other', '', null, undefined,
      'unexpected-garbage',
    ];
    for (const code of inputs) {
      for (const flipped of [false, true]) {
        const out = canonicalFromDecisionCode(code, PAIR, flipped);
        expect(out.cacheVersion).toBe(2);
      }
    }
  });

  it('unexpected decisionCode falls through to unknown (defensive)', () => {
    expect(canonicalFromDecisionCode('99', PAIR, false)).toEqual({
      cacheVersion: 2,
      decisionState: 'unknown',
      strength: 'unknown',
      favoredValueKey: null,
    });
  });
});

describe('pairFromSnapshot', () => {
  it('extracts valueA/valueB from a well-formed snapshot', () => {
    const snapshot = {
      components: {
        value_first: { token: 'Achievement' },
        value_second: { token: 'Hedonism' },
      },
    };
    expect(pairFromSnapshot(snapshot)).toEqual({ valueA: 'Achievement', valueB: 'Hedonism' });
  });

  it('returns null for null snapshot', () => {
    expect(pairFromSnapshot(null)).toBeNull();
  });

  it('returns null for undefined snapshot', () => {
    expect(pairFromSnapshot(undefined)).toBeNull();
  });

  it('returns null when components is missing', () => {
    expect(pairFromSnapshot({})).toBeNull();
  });

  it('returns null when value_first is missing', () => {
    const snapshot = {
      components: {
        value_second: { token: 'Hedonism' },
      },
    };
    expect(pairFromSnapshot(snapshot)).toBeNull();
  });

  it('returns null when value_second is missing', () => {
    const snapshot = {
      components: {
        value_first: { token: 'Achievement' },
      },
    };
    expect(pairFromSnapshot(snapshot)).toBeNull();
  });

  it('returns null when value_first.token is not a string', () => {
    const snapshot = {
      components: {
        value_first: { token: 42 },
        value_second: { token: 'Hedonism' },
      },
    };
    expect(pairFromSnapshot(snapshot)).toBeNull();
  });

  it('returns null when value_second.token is null', () => {
    const snapshot = {
      components: {
        value_first: { token: 'Achievement' },
        value_second: { token: null },
      },
    };
    expect(pairFromSnapshot(snapshot)).toBeNull();
  });

  it('returns null when token is an empty string', () => {
    const snapshot = {
      components: {
        value_first: { token: '' },
        value_second: { token: 'Hedonism' },
      },
    };
    expect(pairFromSnapshot(snapshot)).toBeNull();
  });

  it('returns null for an array (does not throw)', () => {
    expect(pairFromSnapshot([])).toBeNull();
  });

  it('returns null for a primitive string (does not throw)', () => {
    expect(pairFromSnapshot('not an object')).toBeNull();
  });

  it('returns null for a number (does not throw)', () => {
    expect(pairFromSnapshot(42)).toBeNull();
  });

  it('returns null when components is an array (does not throw)', () => {
    expect(pairFromSnapshot({ components: [] })).toBeNull();
  });

  it('returns null when value_first is a primitive (does not throw)', () => {
    expect(pairFromSnapshot({ components: { value_first: 'oops', value_second: { token: 'x' } } })).toBeNull();
  });
});
