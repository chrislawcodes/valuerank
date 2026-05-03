export type ValueRateInput = {
  domainId: string;
  definitionId: string;
  valueKey: string;
  pairKey: string;
  directionKey: string;
  vignetteRate: number;
};

export type ValueRateResult = {
  valueKey: string;
  domainRates: Array<{ domainId: string; rate: number; pairsCounted: number }>;
  crossDomainRate: number | null;
};

function mean(values: Iterable<number>): number | null {
  let sum = 0;
  let count = 0;

  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    sum += value;
    count += 1;
  }

  return count === 0 ? null : sum / count;
}

export function aggregateValueWinRates(
  inputs: Iterable<ValueRateInput>,
): Map<string, ValueRateResult> {
  const vignetteRatesByGroup = new Map<string, ValueRateInput[]>();

  for (const input of inputs) {
    if (!Number.isFinite(input.vignetteRate)) continue;

    const groupKey = [
      input.valueKey,
      input.domainId,
      input.pairKey,
      input.directionKey,
    ].join('||');
    const group = vignetteRatesByGroup.get(groupKey) ?? [];
    group.push(input);
    vignetteRatesByGroup.set(groupKey, group);
  }

  const directionRatesByPair = new Map<
    string,
    { valueKey: string; domainId: string; pairKey: string; directionRate: number }
  >();

  for (const group of vignetteRatesByGroup.values()) {
    const first = group[0];
    if (first == null) continue;
    const directionRate = mean(group.map((item) => item.vignetteRate));
    if (directionRate == null) continue;

    const key = [first.valueKey, first.domainId, first.pairKey, first.directionKey].join('||');
    directionRatesByPair.set(key, {
      valueKey: first.valueKey,
      domainId: first.domainId,
      pairKey: first.pairKey,
      directionRate,
    });
  }

  const directionRatesByValueDomainPair = new Map<
    string,
    { valueKey: string; domainId: string; pairKey: string; directionRates: number[] }
  >();

  for (const directionGroup of directionRatesByPair.values()) {
    const key = [directionGroup.valueKey, directionGroup.domainId, directionGroup.pairKey].join(
      '||',
    );
    const existing = directionRatesByValueDomainPair.get(key) ?? {
      valueKey: directionGroup.valueKey,
      domainId: directionGroup.domainId,
      pairKey: directionGroup.pairKey,
      directionRates: [],
    };
    existing.directionRates.push(directionGroup.directionRate);
    directionRatesByValueDomainPair.set(key, existing);
  }

  const pairRatesByValueDomain = new Map<
    string,
    { valueKey: string; domainId: string; pairRates: number[]; pairsCounted: number }
  >();

  for (const pairGroup of directionRatesByValueDomainPair.values()) {
    const pairRate = mean(pairGroup.directionRates);
    if (pairRate == null) continue;

    const key = [pairGroup.valueKey, pairGroup.domainId].join('||');
    const existing = pairRatesByValueDomain.get(key) ?? {
      valueKey: pairGroup.valueKey,
      domainId: pairGroup.domainId,
      pairRates: [],
      pairsCounted: 0,
    };
    existing.pairRates.push(pairRate);
    existing.pairsCounted += 1;
    pairRatesByValueDomain.set(key, existing);
  }

  const domainRatesByValue = new Map<string, ValueRateResult>();

  for (const domainGroup of pairRatesByValueDomain.values()) {
    const domainRate = mean(domainGroup.pairRates);
    if (domainRate == null) continue;

    const existing = domainRatesByValue.get(domainGroup.valueKey) ?? {
      valueKey: domainGroup.valueKey,
      domainRates: [],
      crossDomainRate: null,
    };
    existing.domainRates.push({
      domainId: domainGroup.domainId,
      rate: domainRate,
      pairsCounted: domainGroup.pairsCounted,
    });
    domainRatesByValue.set(domainGroup.valueKey, existing);
  }

  for (const result of domainRatesByValue.values()) {
    result.domainRates.sort((left, right) => left.domainId.localeCompare(right.domainId));
    result.crossDomainRate = mean(result.domainRates.map((domainRate) => domainRate.rate));
  }

  return domainRatesByValue;
}
