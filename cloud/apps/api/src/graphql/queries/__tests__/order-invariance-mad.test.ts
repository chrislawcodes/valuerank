import { describe, it, expect } from 'vitest';
import { computeMADMetrics, getScaleEffectStatus } from '../order-invariance.js';

describe('computeMADMetrics', () => {
  it('all 4 variants present: correct MAD values', () => {
    const pivot = new Map<string, Record<string, number>>();
    pivot.set('cell1', { baseline: 1, scale_flipped: 3, presentation_flipped: 2, fully_flipped: 5 });
    const result = computeMADMetrics(pivot);
    expect(result.presentationEffectMAD).toBe(1.5);
    expect(result.scaleEffectMAD).toBe(2.5);
  });

  it('only baseline + fully_flipped (legacy): both metrics null', () => {
    const pivot = new Map<string, Record<string, number>>();
    pivot.set('cell1', { baseline: 1, fully_flipped: 5 });
    const result = computeMADMetrics(pivot);
    expect(result.presentationEffectMAD).toBeNull();
    expect(result.scaleEffectMAD).toBeNull();
  });

  it('only baseline + scale_flipped: presentationEffectMAD null, scaleEffectMAD computed', () => {
    const pivot = new Map<string, Record<string, number>>();
    pivot.set('cell1', { baseline: 1, scale_flipped: 4 });
    const result = computeMADMetrics(pivot);
    expect(result.presentationEffectMAD).toBeNull();
    expect(result.scaleEffectMAD).toBe(3);
  });

  it('multiple cells: averages correctly', () => {
    const pivot = new Map<string, Record<string, number>>();
    pivot.set('cell1', { baseline: 1, scale_flipped: 2 });
    pivot.set('cell2', { baseline: 1, scale_flipped: 4 });
    const result = computeMADMetrics(pivot);
    expect(result.scaleEffectMAD).toBe(2);
  });
});

describe('getScaleEffectStatus', () => {
  it('null → UNKNOWN', () => expect(getScaleEffectStatus(null)).toBe('UNKNOWN'));
  it('0.5 → NORMAL', () => expect(getScaleEffectStatus(0.5)).toBe('NORMAL'));
  it('0.51 → WARNING', () => expect(getScaleEffectStatus(0.51)).toBe('WARNING'));
  it('1.0 → WARNING', () => expect(getScaleEffectStatus(1.0)).toBe('WARNING'));
  it('1.01 → SEVERE', () => expect(getScaleEffectStatus(1.01)).toBe('SEVERE'));
});
