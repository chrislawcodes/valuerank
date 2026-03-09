import { describe, expect, it } from 'vitest';
import {
  aggregateWithinCellDisagreementRate,
  classifyStableSide,
  computeCanonicalCellScore,
  computeMatch,
  computePairMarginSummary,
  computeScaleOrderPullLabel,
  computeValueOrderPullLabel,
  computeWithinCellDisagreementRate,
  getPairedConsideredTrials,
  getConsideredTrials,
} from '../order-effect-analysis.js';

describe('order-effect-analysis helpers', () => {
  describe('getConsideredTrials', () => {
    it('uses the current inner-slice trim rule for arrays of length 3 or more', () => {
      expect(getConsideredTrials([1, 5, 3, 4, 4], true)).toEqual([3, 4, 4]);
      expect(getConsideredTrials([2, 4, 5], true)).toEqual([4]);
    });

    it('does not trim selected sets smaller than 3 items', () => {
      expect(getConsideredTrials([5], true)).toEqual([5]);
      expect(getConsideredTrials([5, 1], true)).toEqual([1, 5]);
    });

    it('returns the full sorted set when trimOutliers is false', () => {
      expect(getConsideredTrials([5, 1, 4], false)).toEqual([1, 4, 5]);
    });

    it('keeps raw and normalized considered trials aligned to the same inner-slice positions', () => {
      expect(
        getPairedConsideredTrials([4, 4, 4, 1, 5], [4, 4, 4, 1, 5], true)
      ).toEqual({
        raw: [4, 4, 4],
        normalized: [4, 4, 4],
      });
    });

    it('selects raw considered trials by normalized ordering, not an independent raw sort', () => {
      expect(
        getPairedConsideredTrials([5, 1, 4, 2, 3], [1, 2, 3, 4, 5], true)
      ).toEqual({
        raw: [1, 4, 2],
        normalized: [2, 3, 4],
      });
    });
  });

  describe('computeCanonicalCellScore', () => {
    it('uses the mode when there is a single mode', () => {
      expect(computeCanonicalCellScore([3, 4, 4])).toBe(4);
    });

    it('uses the median as a tiebreaker when there are multiple modes', () => {
      expect(computeCanonicalCellScore([2, 3, 4])).toBe(3);
      expect(computeCanonicalCellScore([2, 2, 4, 4, 5])).toBe(4);
    });
  });

  describe('classifyStableSide', () => {
    it('marks [4,2,4] as lean_high under the strict >50% rule', () => {
      expect(classifyStableSide([4, 2, 4])).toBe('lean_high');
    });

    it('marks [5,5,1,1,3] as unstable', () => {
      expect(classifyStableSide([5, 5, 1, 1, 3])).toBe('unstable');
    });

    it('marks [3,3,4] as unstable', () => {
      expect(classifyStableSide([3, 3, 4])).toBe('unstable');
    });

    it('excludes a neutral-heavy non-midpoint-looking distribution from stable eligibility', () => {
      expect(classifyStableSide([1, 3, 3, 3, 2])).toBe('unstable');
    });
  });

  describe('computeWithinCellDisagreementRate', () => {
    it('counts midpoint trials as disagreement against the winning side bucket', () => {
      expect(computeWithinCellDisagreementRate([4, 4, 3, 3, 2])).toBeCloseTo(0.6);
    });

    it('returns 1.0 when the <3 and >3 buckets are tied', () => {
      expect(computeWithinCellDisagreementRate([2, 2, 4, 4])).toBe(1);
    });

    it('treats all-midpoint cells as zero disagreement', () => {
      expect(computeWithinCellDisagreementRate([3, 3, 3])).toBe(0);
    });

    it('aggregates model disagreement as a simple mean of per-cell rates', () => {
      expect(aggregateWithinCellDisagreementRate([0.6, 1.0])).toBeCloseTo(0.8);
    });
  });

  describe('computePairMarginSummary', () => {
    it('summarizes limiting margins with mean/median/p25/p75', () => {
      expect(computePairMarginSummary([1, 1, 2])).toEqual({
        mean: 4 / 3,
        median: 1,
        p25: 1,
        p75: 2,
      });
    });

    it('returns null when no eligible margins are present', () => {
      expect(computePairMarginSummary([null, null])).toBeNull();
    });
  });

  describe('computeMatch', () => {
    it('uses canonical score side-of-midpoint agreement for directionOnly=true', () => {
      expect(computeMatch(4, 5, true)).toBe(true);
      expect(computeMatch(4, 2, true)).toBe(false);
      expect(computeMatch(3, 5, true)).toBe(false);
      expect(computeMatch(3, 3, true)).toBe(false);
    });

    it('uses exact equality for directionOnly=false', () => {
      expect(computeMatch(4, 4, false)).toBe(true);
      expect(computeMatch(4, 5, false)).toBe(false);
    });
  });

  describe('pull label helpers', () => {
    it('enforces the minimum of three non-zero pairs', () => {
      expect(computeValueOrderPullLabel([1, 1])).toBe('no clear pull');
      expect(computeScaleOrderPullLabel([-1, -1])).toBe('no clear pull');
    });

    it('assigns value-order pull labels at the 2/3 threshold', () => {
      expect(computeValueOrderPullLabel([1, 2, -1])).toBe('toward second-listed');
      expect(computeValueOrderPullLabel([-1, -2, 1])).toBe('toward first-listed');
      expect(computeValueOrderPullLabel([0, 0, 0])).toBe('no clear pull');
    });

    it('assigns scale-order pull labels from raw-score drift signs', () => {
      expect(computeScaleOrderPullLabel([2, 1, -1])).toBe('toward higher numbers');
      expect(computeScaleOrderPullLabel([-2, -1, 1])).toBe('toward lower numbers');
      expect(computeScaleOrderPullLabel([0, 0, 0])).toBe('no clear pull');
    });
  });
});
