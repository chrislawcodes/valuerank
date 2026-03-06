import { describe, it, expect } from 'vitest';
import { normalizeDecision } from '../order-invariance.js';

describe('normalizeDecision', () => {
  it('baseline (variantType=null) → score unchanged', () => {
    expect(normalizeDecision(1, null)).toBe(1);
    expect(normalizeDecision(3, null)).toBe(3);
    expect(normalizeDecision(5, null)).toBe(5);
  });

  it("presentation_flipped → score unchanged (same scale direction as baseline)", () => {
    expect(normalizeDecision(1, 'presentation_flipped')).toBe(1);
    expect(normalizeDecision(5, 'presentation_flipped')).toBe(5);
    expect(normalizeDecision(3, 'presentation_flipped')).toBe(3);
  });

  it("scale_flipped → score inverted (6 - score)", () => {
    expect(normalizeDecision(1, 'scale_flipped')).toBe(5);
    expect(normalizeDecision(5, 'scale_flipped')).toBe(1);
    expect(normalizeDecision(3, 'scale_flipped')).toBe(3);
    expect(normalizeDecision(2, 'scale_flipped')).toBe(4);
    expect(normalizeDecision(4, 'scale_flipped')).toBe(2);
  });

  it("fully_flipped → score inverted (6 - score)", () => {
    expect(normalizeDecision(1, 'fully_flipped')).toBe(5);
    expect(normalizeDecision(5, 'fully_flipped')).toBe(1);
    expect(normalizeDecision(3, 'fully_flipped')).toBe(3);
  });

  it('unknown variantType → score unchanged (defensive)', () => {
    expect(normalizeDecision(3, 'unknown_variant')).toBe(3);
  });
});
