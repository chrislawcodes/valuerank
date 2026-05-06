import { describe, expect, it } from 'vitest';
import type {
  PressureSensitivityModel,
  PressureSensitivityValueRateAggregated,
} from '../../api/operations/pressureSensitivity';
import { averageValueRatesAcrossModels } from './pressureResponseAggregation';

function createValueRate(
  valueLabel: string,
  overrides: Partial<PressureSensitivityValueRateAggregated> = {},
): PressureSensitivityValueRateAggregated {
  return {
    valueToken: valueLabel.toLowerCase(),
    valueLabel,
    averageWinRate: 0.5,
    balancedWinRate: 0.5,
    highPressureOnThisValueWinRate: 0.5,
    highPressureOnOpposingValueWinRate: 0.5,
    highPressureOnThisValueDomainRates: [],
    pairsMeasured: 9,
    ...overrides,
  };
}

function createModel(modelId: string, valueRates: PressureSensitivityValueRateAggregated[]): PressureSensitivityModel {
  return {
    modelId,
    label: modelId,
    providerName: 'Provider',
    unscoredCount: 0,
    pushedEffectPairsUsed: 0,
    domainPressureEffects: [],
    pressureResponseSummary: {
      mean: 0.1,
      rangeMin: 0.05,
      rangeMax: 0.15,
      pairsMeasured: valueRates[0]?.pairsMeasured ?? 0,
    },
    valueRates,
    valuePairs: [],
  };
}

describe('averageValueRatesAcrossModels', () => {
  it('returns an empty array for no models', () => {
    expect(averageValueRatesAcrossModels([])).toEqual([]);
  });

  it('returns the single model rates unchanged', () => {
    const model = createModel('Model A', [
      createValueRate('Alpha', {
        averageWinRate: 0.6,
        balancedWinRate: 0.4,
        highPressureOnThisValueWinRate: 0.8,
        highPressureOnOpposingValueWinRate: 0.3,
      }),
    ]);

    expect(averageValueRatesAcrossModels([model])).toEqual(model.valueRates);
  });

  it('averages full data across two models and keeps the max pairsMeasured', () => {
    const averaged = averageValueRatesAcrossModels([
      createModel('Model A', [
        createValueRate('Alpha', {
          averageWinRate: 0.4,
          balancedWinRate: 0.2,
          highPressureOnThisValueWinRate: 0.6,
          highPressureOnOpposingValueWinRate: 0.1,
          pairsMeasured: 7,
        }),
      ]),
      createModel('Model B', [
        createValueRate('Alpha', {
          averageWinRate: 0.8,
          balancedWinRate: 0.4,
          highPressureOnThisValueWinRate: 1,
          highPressureOnOpposingValueWinRate: 0.3,
          pairsMeasured: 9,
        }),
      ]),
    ]);

    expect(averaged).toHaveLength(1);
    expect(averaged[0]?.valueToken).toBe('alpha');
    expect(averaged[0]?.valueLabel).toBe('Alpha');
    expect(averaged[0]?.pairsMeasured).toBe(9);
    expect(averaged[0]?.averageWinRate).toBeCloseTo(0.6);
    expect(averaged[0]?.balancedWinRate).toBeCloseTo(0.3);
    expect(averaged[0]?.highPressureOnThisValueWinRate).toBeCloseTo(0.8);
    expect(averaged[0]?.highPressureOnOpposingValueWinRate).toBeCloseTo(0.2);
  });

  it('skips nulls when averaging and returns null when every model is null', () => {
    const averaged = averageValueRatesAcrossModels([
      createModel('Model A', [
        createValueRate('Alpha', {
          averageWinRate: null,
          balancedWinRate: 0.4,
          highPressureOnThisValueWinRate: null,
          highPressureOnOpposingValueWinRate: 0.1,
        }),
      ]),
      createModel('Model B', [
        createValueRate('Alpha', {
          averageWinRate: 0.8,
          balancedWinRate: null,
          highPressureOnThisValueWinRate: null,
          highPressureOnOpposingValueWinRate: 0.3,
        }),
      ]),
    ]);

    expect(averaged).toEqual([
      {
        valueToken: 'alpha',
        valueLabel: 'Alpha',
        averageWinRate: 0.8,
        balancedWinRate: 0.4,
        highPressureOnThisValueWinRate: null,
        highPressureOnOpposingValueWinRate: 0.2,
        highPressureOnThisValueDomainRates: [],
        pairsMeasured: 9,
      },
    ]);
  });

  it('averages per-domain high-pressure rates across models', () => {
    const averaged = averageValueRatesAcrossModels([
      createModel('Model A', [
        createValueRate('Alpha', {
          highPressureOnThisValueDomainRates: [
            { domainId: 'jobs', domainName: 'Jobs', rate: 0.6, pairsMeasured: 7 },
            { domainId: 'city', domainName: 'City Planning', rate: 0.2, pairsMeasured: 5 },
          ],
        }),
      ]),
      createModel('Model B', [
        createValueRate('Alpha', {
          highPressureOnThisValueDomainRates: [
            { domainId: 'jobs', domainName: 'Jobs', rate: 0.8, pairsMeasured: 9 },
          ],
        }),
      ]),
    ]);

    expect(averaged[0]?.highPressureOnThisValueDomainRates).toEqual([
      {
        domainId: 'city',
        domainName: 'City Planning',
        rate: 0.2,
        pairsMeasured: 5,
      },
      {
        domainId: 'jobs',
        domainName: 'Jobs',
        rate: 0.7,
        pairsMeasured: 9,
      },
    ]);
  });
});
