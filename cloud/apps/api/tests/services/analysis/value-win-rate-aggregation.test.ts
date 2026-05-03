import { describe, expect, it } from 'vitest';
import {
  aggregateValueWinRates,
  type ValueRateInput,
} from '../../../src/services/analysis/value-win-rate-aggregation.js';

function buildInput(overrides: Partial<ValueRateInput> = {}): ValueRateInput {
  return {
    domainId: 'domain-a',
    definitionId: 'def-1',
    valueKey: 'Achievement',
    pairKey: 'achievement::security_personal',
    directionKey: 'Achievement',
    vignetteRate: 0.5,
    ...overrides,
  };
}

describe('aggregateValueWinRates', () => {
  it('returns the vignette rate for a single-domain single-pair single-direction input', () => {
    const result = aggregateValueWinRates([buildInput({ vignetteRate: 0.8 })]);

    expect(result.get('Achievement')).toEqual({
      valueKey: 'Achievement',
      domainRates: [{ domainId: 'domain-a', rate: 0.8, pairsCounted: 1 }],
      crossDomainRate: 0.8,
    });
  });

  it('averages direction means before the pair rate', () => {
    const result = aggregateValueWinRates([
      buildInput({ definitionId: 'def-a-1', directionKey: 'Achievement', vignetteRate: 0.8 }),
      buildInput({ definitionId: 'def-a-2', directionKey: 'Achievement', vignetteRate: 0.6 }),
      buildInput({ definitionId: 'def-b-1', directionKey: 'Security_Personal', vignetteRate: 0.2 }),
    ]);

    expect(result.get('Achievement')?.crossDomainRate).toBeCloseTo(0.45, 10);
  });

  it('averages pair rates equally within a domain', () => {
    const result = aggregateValueWinRates([
      buildInput({ pairKey: 'achievement::security_personal', vignetteRate: 0.6 }),
      buildInput({
        definitionId: 'def-2',
        pairKey: 'achievement::hedonism',
        vignetteRate: 0.2,
      }),
    ]);

    expect(result.get('Achievement')).toEqual({
      valueKey: 'Achievement',
      domainRates: [{ domainId: 'domain-a', rate: 0.4, pairsCounted: 2 }],
      crossDomainRate: 0.4,
    });
  });

  it('equal-weights domains when both domains contain the same value pairs', () => {
    const result = aggregateValueWinRates([
      buildInput({ domainId: 'domain-a', pairKey: 'achievement::security_personal', vignetteRate: 0.8 }),
      buildInput({ domainId: 'domain-a', definitionId: 'def-a-2', pairKey: 'achievement::hedonism', vignetteRate: 0.4 }),
      buildInput({ domainId: 'domain-b', definitionId: 'def-b-1', pairKey: 'achievement::security_personal', vignetteRate: 0.2 }),
      buildInput({ domainId: 'domain-b', definitionId: 'def-b-2', pairKey: 'achievement::hedonism', vignetteRate: 0.4 }),
    ]);

    expect(result.get('Achievement')?.domainRates).toHaveLength(2);
    expect(result.get('Achievement')?.domainRates[0]).toEqual({
      domainId: 'domain-a',
      rate: expect.closeTo(0.6, 10),
      pairsCounted: 2,
    });
    expect(result.get('Achievement')?.domainRates[1]).toEqual({
      domainId: 'domain-b',
      rate: expect.closeTo(0.3, 10),
      pairsCounted: 2,
    });
    expect(result.get('Achievement')?.crossDomainRate).toBeCloseTo(0.45, 10);
  });

  it('does not match pair-first cross-domain averaging when domain coverage is uneven', () => {
    const result = aggregateValueWinRates([
      buildInput({ domainId: 'domain-a', pairKey: 'achievement::security_personal', vignetteRate: 1 }),
      buildInput({ domainId: 'domain-a', definitionId: 'def-a-2', pairKey: 'achievement::hedonism', vignetteRate: 0 }),
      buildInput({ domainId: 'domain-b', definitionId: 'def-b-1', pairKey: 'achievement::hedonism', vignetteRate: 0 }),
    ]);

    const canonicalRate = result.get('Achievement')?.crossDomainRate;
    const wrongPairFirstRate = (1 + 0) / 2;

    expect(canonicalRate).toBeCloseTo(0.25, 10);
    expect(canonicalRate).not.toBeCloseTo(wrongPairFirstRate, 10);
  });

  it('returns an empty map for empty inputs', () => {
    expect(aggregateValueWinRates([]).size).toBe(0);
  });

  it('ignores NaN and Infinity vignette rates', () => {
    const result = aggregateValueWinRates([
      buildInput({ definitionId: 'def-valid', vignetteRate: 0.6 }),
      buildInput({ definitionId: 'def-nan', pairKey: 'achievement::hedonism', vignetteRate: Number.NaN }),
      buildInput({
        definitionId: 'def-inf',
        pairKey: 'achievement::stimulation',
        vignetteRate: Number.POSITIVE_INFINITY,
      }),
    ]);

    expect(result.get('Achievement')).toEqual({
      valueKey: 'Achievement',
      domainRates: [{ domainId: 'domain-a', rate: 0.6, pairsCounted: 1 }],
      crossDomainRate: 0.6,
    });
  });
});
