/**
 * Pure unit tests for domain-analysis-scoring.ts.
 * No database access. No server setup required.
 */

import { describe, it, expect } from 'vitest';
import {
  computeSmoothedLogOddsScore,
  computeLogOddsFromWinRate,
} from '../../../src/graphql/queries/domain/domain-analysis-scoring.js';

describe('computeSmoothedLogOddsScore', () => {
  it('returns 0 for equal wins and losses', () => {
    expect(computeSmoothedLogOddsScore(10, 10)).toBe(0);
  });

  it('returns a positive score when wins exceed losses', () => {
    expect(computeSmoothedLogOddsScore(80, 20)).toBeGreaterThan(0);
  });

  it('returns a negative score when losses exceed wins', () => {
    expect(computeSmoothedLogOddsScore(20, 80)).toBeLessThan(0);
  });

  it('handles zero wins and losses via +1 smoothing', () => {
    expect(computeSmoothedLogOddsScore(0, 0)).toBe(0);
  });
});

describe('computeLogOddsFromWinRate', () => {
  it('returns 0 for 50% win rate', () => {
    expect(computeLogOddsFromWinRate(50)).toBeCloseTo(0);
  });

  it('returns a positive score for win rates above 50%', () => {
    expect(computeLogOddsFromWinRate(75)).toBeGreaterThan(0);
  });

  it('returns a negative score for win rates below 50%', () => {
    expect(computeLogOddsFromWinRate(25)).toBeLessThan(0);
  });

  it('is symmetric: logit(p) === -logit(1-p)', () => {
    expect(computeLogOddsFromWinRate(70)).toBeCloseTo(-computeLogOddsFromWinRate(30));
  });

  it('returns +Infinity for 100% win rate', () => {
    expect(computeLogOddsFromWinRate(100)).toBe(Infinity);
  });

  it('returns -Infinity for 0% win rate', () => {
    expect(computeLogOddsFromWinRate(0)).toBe(-Infinity);
  });

  it('accepts win rate on 0–100 scale (not 0–1)', () => {
    // logit(0.77) ≈ 1.208
    expect(computeLogOddsFromWinRate(77)).toBeCloseTo(Math.log(0.77 / 0.23), 5);
  });
});
