import { describe, expect, it } from 'vitest';

import {
  isGoodCanonical,
  pairFromSnapshot,
} from '../backfill-canonical-v2-migration.js';

/**
 * Tests for the migration's classification helpers.
 *
 * The end-to-end classification+resolver-delegation path is exercised by
 * a future integration test; this file covers the pure helpers:
 *   - isGoodCanonical: "is this existing canonical trustworthy?"
 *   - pairFromSnapshot: "extract {valueA, valueB} from the snapshot JSON"
 */

describe('isGoodCanonical', () => {
  it('accepts resolved + strong + valid key', () => {
    expect(isGoodCanonical({
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Tradition',
    })).toBe(true);
  });

  it('accepts resolved + lean + valid key', () => {
    expect(isGoodCanonical({
      decisionState: 'resolved',
      strength: 'lean',
      favoredValueKey: 'Security_Personal',
    })).toBe(true);
  });

  it('accepts neutral + neutral + null key', () => {
    expect(isGoodCanonical({
      decisionState: 'neutral',
      strength: 'neutral',
      favoredValueKey: null,
    })).toBe(true);
  });

  it('accepts refusal + any non-unknown strength + null key', () => {
    expect(isGoodCanonical({
      decisionState: 'refusal',
      strength: 'lean', // Could be any non-unknown value
      favoredValueKey: null,
    })).toBe(true);
  });

  it('rejects decisionState unknown', () => {
    expect(isGoodCanonical({
      decisionState: 'unknown',
      strength: 'strong',
      favoredValueKey: 'Tradition',
    })).toBe(false);
  });

  it('rejects strength unknown', () => {
    expect(isGoodCanonical({
      decisionState: 'resolved',
      strength: 'unknown',
      favoredValueKey: 'Tradition',
    })).toBe(false);
  });

  it('rejects resolved with null favoredValueKey', () => {
    expect(isGoodCanonical({
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: null,
    })).toBe(false);
  });

  it('rejects resolved with strength neutral (ambiguous)', () => {
    expect(isGoodCanonical({
      decisionState: 'resolved',
      strength: 'neutral',
      favoredValueKey: 'Tradition',
    })).toBe(false);
  });

  it('rejects neutral with non-null favoredValueKey', () => {
    expect(isGoodCanonical({
      decisionState: 'neutral',
      strength: 'neutral',
      favoredValueKey: 'Tradition',
    })).toBe(false);
  });

  it('rejects neutral with strength other than neutral', () => {
    expect(isGoodCanonical({
      decisionState: 'neutral',
      strength: 'strong',
      favoredValueKey: null,
    })).toBe(false);
  });

  it('rejects null input', () => {
    expect(isGoodCanonical(null)).toBe(false);
  });

  it('rejects undefined input', () => {
    expect(isGoodCanonical(undefined)).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(isGoodCanonical('string')).toBe(false);
    expect(isGoodCanonical(42)).toBe(false);
    expect(isGoodCanonical([])).toBe(false);
  });

  it('rejects missing decisionState', () => {
    expect(isGoodCanonical({
      strength: 'strong',
      favoredValueKey: 'Tradition',
    })).toBe(false);
  });

  it('rejects non-string decisionState', () => {
    expect(isGoodCanonical({
      decisionState: 42,
      strength: 'strong',
      favoredValueKey: 'Tradition',
    })).toBe(false);
  });

  it('rejects unknown decisionState value', () => {
    expect(isGoodCanonical({
      decisionState: 'bogus',
      strength: 'strong',
      favoredValueKey: 'Tradition',
    })).toBe(false);
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
    expect(pairFromSnapshot({ components: { value_second: { token: 'Hedonism' } } })).toBeNull();
  });

  it('returns null when value_second is missing', () => {
    expect(pairFromSnapshot({ components: { value_first: { token: 'Achievement' } } })).toBeNull();
  });

  it('returns null when value_first.token is non-string', () => {
    expect(pairFromSnapshot({
      components: {
        value_first: { token: 42 },
        value_second: { token: 'Hedonism' },
      },
    })).toBeNull();
  });

  it('returns null when value_second.token is null', () => {
    expect(pairFromSnapshot({
      components: {
        value_first: { token: 'Achievement' },
        value_second: { token: null },
      },
    })).toBeNull();
  });

  it('returns null when token is an empty string', () => {
    expect(pairFromSnapshot({
      components: {
        value_first: { token: '' },
        value_second: { token: 'Hedonism' },
      },
    })).toBeNull();
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
