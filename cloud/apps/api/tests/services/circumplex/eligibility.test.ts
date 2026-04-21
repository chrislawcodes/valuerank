import { describe, expect, it } from 'vitest';
import { SCHWARTZ_CIRCULAR_ORDER } from '@valuerank/shared/schwartz';
import { classifyEligibility } from '../../../src/services/circumplex/eligibility.js';
import type { CircumplexPairMatrix } from '../../../src/services/circumplex/aggregation.js';

function buildMatrix(fill: (row: number, col: number) => { winRate: number | null; trials: number; neutrals: number }): CircumplexPairMatrix {
  return SCHWARTZ_CIRCULAR_ORDER.map((_value, row) =>
    SCHWARTZ_CIRCULAR_ORDER.map((_other, col) => (
      row === col ? { winRate: null, trials: 0, neutrals: 0 } : fill(row, col)
    )));
}

function setPair(matrix: CircumplexPairMatrix, row: number, col: number, trials: number): void {
  const cell = { winRate: 0.5, trials, neutrals: 0 };
  matrix[row]![col] = cell;
  matrix[col]![row] = cell;
}

describe('classifyEligibility', () => {
  it('marks a fully covered model eligible', () => {
    const pairwise = buildMatrix(() => ({ winRate: 0.5, trials: 5, neutrals: 0 }));
    const result = classifyEligibility({
      model: { modelId: 'm1', modelLabel: 'Model 1', providerName: 'Provider' },
      pairwise,
      minTrialsPerValue: 5,
    });

    expect(result.status).toBe('eligible');
    expect(result.reason).toBeUndefined();
    expect(result.trialsPerValue.every((entry) => entry.trials === 45)).toBe(true);
  });

  it('flags missing values', () => {
    const pairwise = buildMatrix(() => ({ winRate: 0.5, trials: 5, neutrals: 0 }));
    for (let col = 1; col < SCHWARTZ_CIRCULAR_ORDER.length; col += 1) {
      pairwise[0]![col] = { winRate: null, trials: 0, neutrals: 0 };
      pairwise[col]![0] = { winRate: null, trials: 0, neutrals: 0 };
    }

    const result = classifyEligibility({
      model: { modelId: 'm1', modelLabel: 'Model 1', providerName: 'Provider' },
      pairwise,
      minTrialsPerValue: 5,
    });

    expect(result.status).toBe('insufficient');
    expect(result.reason).toBe('missing_values');
    expect(result.trialsPerValue[0]?.trials).toBe(0);
  });

  it('flags values below the trial threshold', () => {
    const pairwise = buildMatrix(() => ({ winRate: 0.5, trials: 5, neutrals: 0 }));
    for (let col = 1; col < SCHWARTZ_CIRCULAR_ORDER.length; col += 1) {
      pairwise[0]![col] = { winRate: null, trials: 0, neutrals: 0 };
      pairwise[col]![0] = { winRate: null, trials: 0, neutrals: 0 };
    }
    setPair(pairwise, 0, 1, 2);
    setPair(pairwise, 0, 2, 0);

    const result = classifyEligibility({
      model: { modelId: 'm1', modelLabel: 'Model 1', providerName: 'Provider' },
      pairwise,
      minTrialsPerValue: 5,
    });

    expect(result.status).toBe('insufficient');
    expect(result.reason).toBe('below_threshold');
    expect(result.trialsPerValue[0]?.trials).toBe(2);
  });

  it('flags empty models as no transcripts for signature', () => {
    const pairwise = buildMatrix(() => ({ winRate: null, trials: 0, neutrals: 0 }));
    const result = classifyEligibility({
      model: { modelId: 'm1', modelLabel: 'Model 1', providerName: 'Provider' },
      pairwise,
      minTrialsPerValue: 5,
    });

    expect(result.status).toBe('insufficient');
    expect(result.reason).toBe('no_transcripts_for_signature');
  });
});
