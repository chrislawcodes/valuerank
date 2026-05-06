import type {
  PressureSensitivityModel,
  PressureSensitivityValueRate,
  PressureSensitivityValueRateAggregated,
  PressureSensitivityValueRateByDomain,
} from '../../api/operations/pressureSensitivity';

type InputValueRate = PressureSensitivityValueRate & {
  highPressureOnThisValueDomainRates?: PressureSensitivityValueRateByDomain[];
};

type InputModel = Omit<PressureSensitivityModel, 'valueRates'> & {
  valueRates: InputValueRate[];
};

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
  domainRates: Map<string, MutableDomainRateAccumulator>;
};

type MutableDomainRateAccumulator = {
  domainId: string;
  domainName: string;
  pairsMeasured: number;
  sum: number;
  count: number;
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
  models: InputModel[],
): PressureSensitivityValueRateAggregated[] {
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
        domainRates: new Map(),
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

      for (const domainRate of valueRate.highPressureOnThisValueDomainRates ?? []) {
        if (domainRate.rate == null) {
          continue;
        }

        const existingDomainRate = accumulator.domainRates.get(domainRate.domainId);
        const domainAccumulator = existingDomainRate ?? {
          domainId: domainRate.domainId,
          domainName: domainRate.domainName,
          pairsMeasured: domainRate.pairsMeasured,
          sum: 0,
          count: 0,
        };
        domainAccumulator.domainName = domainRate.domainName;
        domainAccumulator.pairsMeasured = Math.max(domainAccumulator.pairsMeasured, domainRate.pairsMeasured);
        domainAccumulator.sum += domainRate.rate;
        domainAccumulator.count += 1;
        accumulator.domainRates.set(domainRate.domainId, domainAccumulator);
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
    highPressureOnThisValueDomainRates: [...rate.domainRates.values()]
      .sort((left, right) => left.domainName.localeCompare(right.domainName) || left.domainId.localeCompare(right.domainId))
      .map((domainRate) => ({
        domainId: domainRate.domainId,
        domainName: domainRate.domainName,
        rate: averageRate(domainRate.sum, domainRate.count),
        pairsMeasured: domainRate.pairsMeasured,
      })),
    pairsMeasured: rate.pairsMeasured,
  }));
}
