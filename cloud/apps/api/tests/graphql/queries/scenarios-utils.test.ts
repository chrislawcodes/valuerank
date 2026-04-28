import { describe, expect, it } from 'vitest';
import { buildSafeLevelLookup } from '../../../src/graphql/queries/scenarios-utils.js';

const canonical = {
  name: 'tradition',
  levels: [
    { score: 1, label: 'negligible' },
    { score: 2, label: 'minimal' },
    { score: 3, label: 'moderate' },
    { score: 4, label: 'substantial' },
    { score: 5, label: 'full' },
  ],
};

describe('buildSafeLevelLookup', () => {
  it('resolves all canonical labels for a 5-level definition', () => {
    const result = buildSafeLevelLookup(canonical);

    expect(result.exclusionReason).toBeNull();
    expect(result.lookup('negligible')).toBe(1);
    expect(result.lookup('minimal')).toBe(2);
    expect(result.lookup('moderate')).toBe(3);
    expect(result.lookup('substantial')).toBe(4);
    expect(result.lookup('full')).toBe(5);
  });

  it('resolves stringified scores via the lookup', () => {
    const result = buildSafeLevelLookup(canonical);

    expect(result.lookup('1')).toBe(1);
    expect(result.lookup('5')).toBe(5);
    expect(result.lookup(3)).toBe(3);
  });

  it('rejects label-vs-label collision', () => {
    const result = buildSafeLevelLookup({
      levels: [
        { score: 1, label: 'moderate' },
        { score: 3, label: 'moderate' },
      ],
    });

    expect(result.exclusionReason).toBe('collision');
    expect(result.lookup('moderate')).toBeNull();
  });

  it('rejects score-vs-score collision', () => {
    const result = buildSafeLevelLookup({
      levels: [
        { score: 1, label: 'low' },
        { score: 1, label: 'minimal' },
      ],
    });

    expect(result.exclusionReason).toBe('collision');
  });

  it('rejects label-vs-score collision (label is another level’s score as a string)', () => {
    const result = buildSafeLevelLookup({
      levels: [
        { score: 1, label: 'low' },
        { score: 2, label: '1' },
      ],
    });

    expect(result.exclusionReason).toBe('collision');
  });

  it('rejects out-of-range scores', () => {
    expect(buildSafeLevelLookup({ levels: [{ score: 6, label: 'too-high' }] }).exclusionReason).toBe(
      'out-of-range',
    );
    expect(buildSafeLevelLookup({ levels: [{ score: 0, label: 'too-low' }] }).exclusionReason).toBe(
      'out-of-range',
    );
    expect(buildSafeLevelLookup({ levels: [{ score: 1.5, label: 'half' }] }).exclusionReason).toBe(
      'out-of-range',
    );
  });

  it('returns legacy-values-only when levels are missing but values are present', () => {
    const result = buildSafeLevelLookup({ values: ['low', 'high'] });
    expect(result.exclusionReason).toBe('legacy-values-only');
    expect(result.lookup('low')).toBeNull();
  });

  it('returns empty-levels when nothing is provided', () => {
    expect(buildSafeLevelLookup(undefined).exclusionReason).toBe('empty-levels');
    expect(buildSafeLevelLookup({}).exclusionReason).toBe('empty-levels');
    expect(buildSafeLevelLookup({ levels: [] }).exclusionReason).toBe('empty-levels');
  });

  it('trims and lowercases label inputs before lookup', () => {
    const result = buildSafeLevelLookup(canonical);

    expect(result.lookup(' moderate ')).toBe(3);
    expect(result.lookup('MODERATE')).toBe(3);
    expect(result.lookup('Moderate')).toBe(3);
  });

  it('coerces numeric-string labels (e.g. "1.0") to the canonical score', () => {
    const result = buildSafeLevelLookup(canonical);

    expect(result.lookup('1.0')).toBe(1);
    expect(result.lookup('  3 ')).toBe(3);
  });

  it('returns null on totally unknown labels', () => {
    const result = buildSafeLevelLookup(canonical);

    expect(result.lookup('not-a-level')).toBeNull();
    expect(result.lookup('')).toBeNull();
    expect(result.lookup(null)).toBeNull();
  });
});
