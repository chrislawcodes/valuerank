import { describe, expect, it } from 'vitest';
import {
  assignOwnOpponent,
  assignOwnOpponentLevels,
  canonicalOwnOpponent,
  canonicalValuePairKey,
} from '../../../src/services/pressure-sensitivity/value-pair.js';

describe('canonicalValuePairKey', () => {
  it('returns the alphabetically sorted token pair joined by ::', () => {
    expect(canonicalValuePairKey('power', 'achievement')).toBe('achievement::power');
    expect(canonicalValuePairKey('achievement', 'power')).toBe('achievement::power');
  });

  it('treats whitespace-only differences as equivalent', () => {
    expect(canonicalValuePairKey(' power ', 'achievement')).toBe('achievement::power');
  });

  it('returns null for self-pairs', () => {
    expect(canonicalValuePairKey('power', 'power')).toBeNull();
    expect(canonicalValuePairKey(' power', 'power ')).toBeNull();
  });

  it('returns null for missing or non-string tokens', () => {
    expect(canonicalValuePairKey(undefined, 'power')).toBeNull();
    expect(canonicalValuePairKey('power', null)).toBeNull();
    expect(canonicalValuePairKey('power', '')).toBeNull();
    expect(canonicalValuePairKey(42, 'power')).toBeNull();
  });
});

describe('canonicalOwnOpponent', () => {
  it('returns the alphabetically sorted (own, opponent) tokens', () => {
    expect(canonicalOwnOpponent('power', 'achievement')).toEqual(['achievement', 'power']);
    expect(canonicalOwnOpponent('achievement', 'power')).toEqual(['achievement', 'power']);
  });
});

describe('assignOwnOpponent', () => {
  it('passes refusal and unknown through as unscored', () => {
    expect(assignOwnOpponent('power', 'achievement', 'refusal')).toBe('unscored');
    expect(assignOwnOpponent('power', 'achievement', 'unknown')).toBe('unscored');
  });

  it('passes neutral through unchanged', () => {
    expect(assignOwnOpponent('power', 'achievement', 'neutral')).toBe('neutral');
  });

  it('does NOT swap when value_first is canonical own', () => {
    // canonical own is "achievement"; if the Definition's value_first IS achievement,
    // favor_first means own picked.
    expect(assignOwnOpponent('achievement', 'power', 'favor_first')).toBe('own_picked');
    expect(assignOwnOpponent('achievement', 'power', 'favor_second')).toBe('opponent_picked');
  });

  it('swaps when value_first is the opponent (canonical own is value_second)', () => {
    // canonical own is "achievement"; here Definition stored value_first = "power" (opponent),
    // so favor_first must remap to opponent_picked.
    expect(assignOwnOpponent('power', 'achievement', 'favor_first')).toBe('opponent_picked');
    expect(assignOwnOpponent('power', 'achievement', 'favor_second')).toBe('own_picked');
  });
});

describe('assignOwnOpponentLevels', () => {
  const dims = [
    { name: 'power', levels: [{ score: 1, label: 'minimal' }] },
    { name: 'achievement', levels: [{ score: 1, label: 'minimal' }] },
  ];
  const ownLookup = (raw: unknown) => (raw === 'minimal' ? 1 : raw === 'full' ? 5 : null);
  const opponentLookup = ownLookup;

  it('returns the matching (own, opponent) levels by token name', () => {
    const result = assignOwnOpponentLevels(
      dims,
      { achievement: 'minimal', power: 'full' },
      ownLookup,
      opponentLookup,
      'achievement',
      'power',
    );

    expect(result).toEqual({ ownLevel: 1, opponentLevel: 5 });
  });

  it('returns null when a dimension is missing from the Definition', () => {
    const result = assignOwnOpponentLevels(
      [{ name: 'achievement', levels: [{ score: 1, label: 'minimal' }] }],
      { achievement: 'minimal', power: 'full' },
      ownLookup,
      opponentLookup,
      'achievement',
      'power',
    );

    expect(result).toBeNull();
  });

  it('returns null when the scenario lacks a dimension value', () => {
    const result = assignOwnOpponentLevels(
      dims,
      { achievement: 'minimal' },
      ownLookup,
      opponentLookup,
      'achievement',
      'power',
    );

    expect(result).toBeNull();
  });

  it('returns null when a level lookup misses', () => {
    const result = assignOwnOpponentLevels(
      dims,
      { achievement: 'minimal', power: 'middling' },
      ownLookup,
      opponentLookup,
      'achievement',
      'power',
    );

    expect(result).toBeNull();
  });
});
