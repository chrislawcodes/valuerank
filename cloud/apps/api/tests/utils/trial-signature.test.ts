import { describe, expect, it } from 'vitest';
import { formatTrialSignature } from '../../src/utils/trial-signature.js';

describe('formatTrialSignature', () => {
  it('formats zero temperature explicitly', () => {
    expect(formatTrialSignature(2, 0)).toBe('v2t0');
  });

  it('formats default temperature token', () => {
    expect(formatTrialSignature(3, null)).toBe('v3td');
  });

  it('formats unknown version token', () => {
    expect(formatTrialSignature(null, 0.7)).toBe('v?t0.7');
  });

  it('trims trailing zeros', () => {
    expect(formatTrialSignature(2, 1.25)).toBe('v2t1.25');
  });

  it('treats non-finite temperature as default', () => {
    expect(formatTrialSignature(4, Number.NaN)).toBe('v4td');
  });
});
