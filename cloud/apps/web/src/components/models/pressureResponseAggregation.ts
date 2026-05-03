import type {
  PressureSensitivityModel,
  PressureSensitivityValueRate,
} from '../../api/operations/pressureSensitivity';

type RateField =
  | 'averageWinRate'
  | 'balancedWinRate'
  | 'highPressureOnThisValueWinRate'
  | 'highPressureOnOpposingValueWinRate';

type MutableRateAccumulator = {
  pairsMeasured: number;
  sums: Record<RateField, number>;
  counts: Record<RateField, number>;
  valueLabel: string;
  valueToken: string;
};

const RATE_FIELDS: RateField[] = [
  'averageWinRate',
  'balancedWinRate',
  'highPressureOnThisValueWinRate',
  'highPressureOnOpposingValueWinRate',
];

function averageRate(sum: number, count: number): number | null {
  return count > 0 ? sum / count : null;
}

export function averageValueRatesAcrossModels(
  models: PressureSensitivityModel[],
): PressureSensitivityValueRate[] {
  if (models.length === 0) {
    return [];
  }

  const ratesByValue = new Map<string, MutableRateAccumulator>();

  for (const model of models) {
    for (const valueRate of model.valueRates) {
      const existing = ratesByValue.get(valueRate.valueToken);
      const accumulator = existing ?? {
        pairsMeasured: valueRate.pairsMeasured,
        sums: {
          averageWinRate: 0,
          balancedWinRate: 0,
          highPressureOnThisValueWinRate: 0,
          highPressureOnOpposingValueWinRate: 0,
        },
        counts: {
          averageWinRate: 0,
          balancedWinRate: 0,
          highPressureOnThisValueWinRate: 0,
          highPressureOnOpposingValueWinRate: 0,
        },
        valueLabel: valueRate.valueLabel,
        valueToken: valueRate.valueToken,
      };

      // pairsMeasured should be structural per value, but keep the max if older data varies.
      accumulator.pairsMeasured = Math.max(accumulator.pairsMeasured, valueRate.pairsMeasured);

      for (const field of RATE_FIELDS) {
        const rate = valueRate[field];
        if (rate == null) {
          continue;
        }
        accumulator.sums[field] += rate;
        accumulator.counts[field] += 1;
      }

      if (existing == null) {
        ratesByValue.set(valueRate.valueToken, accumulator);
      }
    }
  }

  return Array.from(ratesByValue.values()).map((rate) => ({
    valueToken: rate.valueToken,
    valueLabel: rate.valueLabel,
    averageWinRate: averageRate(rate.sums.averageWinRate, rate.counts.averageWinRate),
    balancedWinRate: averageRate(rate.sums.balancedWinRate, rate.counts.balancedWinRate),
    highPressureOnThisValueWinRate: averageRate(
      rate.sums.highPressureOnThisValueWinRate,
      rate.counts.highPressureOnThisValueWinRate,
    ),
    highPressureOnOpposingValueWinRate: averageRate(
      rate.sums.highPressureOnOpposingValueWinRate,
      rate.counts.highPressureOnOpposingValueWinRate,
    ),
    pairsMeasured: rate.pairsMeasured,
  }));
}
