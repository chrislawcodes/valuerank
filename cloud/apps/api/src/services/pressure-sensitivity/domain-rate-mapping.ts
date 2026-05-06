type DomainRateInput = {
  domainId: string;
  rate: number;
  pairsCounted: number;
};

export function mapHighPressureDomainRates(
  domainRates: ReadonlyArray<DomainRateInput> | undefined,
  domainNameById: ReadonlyMap<string, string>,
): Array<{
  domainId: string;
  domainName: string;
  rate: number;
  pairsMeasured: number;
}> {
  return (domainRates ?? []).map((domainRate) => ({
    domainId: domainRate.domainId,
    domainName: domainNameById.get(domainRate.domainId) ?? domainRate.domainId,
    rate: domainRate.rate,
    pairsMeasured: domainRate.pairsCounted,
  }));
}
