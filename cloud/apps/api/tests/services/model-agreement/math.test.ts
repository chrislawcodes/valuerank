import { describe, expect, it } from 'vitest';
import {
  cohensKappa,
  equalWeightAggregate,
  isTied,
  kappaInterpretation,
  percentAgreement,
} from '../../../src/services/model-agreement/math.js';

describe('model-agreement math', () => {
  it('cohensKappa perfect agreement, 50/50 chance', () => {
    expect(cohensKappa(1.0, 0.5)).toBe(1.0);
  });

  it('cohensKappa observed equals chance', () => {
    expect(cohensKappa(0.5, 0.5)).toBe(0);
  });

  it('cohensKappa worst possible', () => {
    expect(cohensKappa(0.0, 0.5)).toBe(-1);
  });

  it('cohensKappa degenerate chance=1', () => {
    expect(cohensKappa(0.0, 1.0)).toBeNull();
  });

  it('kappaInterpretation null in null out', () => {
    expect(kappaInterpretation(null)).toBeNull();
  });

  it('kappaInterpretation 0.65 substantial', () => {
    expect(kappaInterpretation(0.65)).toBe('Substantial');
  });

  it('kappaInterpretation 0.8 near-perfect', () => {
    expect(kappaInterpretation(0.8)).toBe('Near-perfect');
  });

  it('kappaInterpretation -0.1 poor', () => {
    expect(kappaInterpretation(-0.1)).toBe('Poor (worse than chance)');
  });

  it('kappaInterpretation 0 slight', () => {
    expect(kappaInterpretation(0)).toBe('Slight');
  });

  it('percentAgreement 0/0', () => {
    expect(percentAgreement(0, 0)).toBeNull();
  });

  it('percentAgreement 5/10', () => {
    expect(percentAgreement(5, 10)).toBe(0.5);
  });

  it('equalWeightAggregate sparse vignette does not bias', () => {
    expect(equalWeightAggregate([Array(25).fill(0.6), Array(5).fill(0.6)])).toBeCloseTo(0.6, 12);
  });

  it('equalWeightAggregate 1-cell vs 25-cell equal weight', () => {
    expect(equalWeightAggregate([[1.0], Array(25).fill(0.0)])).toBe(0.5);
  });

  it('equalWeightAggregate empty vignette is null', () => {
    expect(equalWeightAggregate([[]])).toBeNull();
  });

  it('equalWeightAggregate completely empty is null', () => {
    expect(equalWeightAggregate([])).toBeNull();
  });

  it('isTied exact 0.5', () => {
    expect(isTied(0.5)).toBe(true);
  });

  it('isTied 1/2', () => {
    expect(isTied(1 / 2)).toBe(true);
  });

  it('isTied 2/4', () => {
    expect(isTied(2 / 4)).toBe(true);
  });

  it('isTied 3/6', () => {
    expect(isTied(3 / 6)).toBe(true);
  });

  it('isTied within epsilon', () => {
    expect(isTied(0.5000000001)).toBe(true);
  });

  it('isTied 0.49', () => {
    expect(isTied(0.49)).toBe(false);
  });

  it('isTied 0.51', () => {
    expect(isTied(0.51)).toBe(false);
  });
});
