import { describe, expect, it } from 'vitest';
import {
  computePairwiseKappaWithBreakdown,
  type ComparableCell,
} from '../../../src/services/model-agreement/aggregation.js';

function cell(
  definitionId: string,
  valuePairKey: string,
  modelAChoice: ComparableCell['modelAChoice'],
  modelBChoice: ComparableCell['modelBChoice'],
): ComparableCell {
  const aFrac = modelAChoice === 'A' ? 1.0 : modelAChoice === 'B' ? 0.0 : 0.5;
  const bFrac = modelBChoice === 'A' ? 1.0 : modelBChoice === 'B' ? 0.0 : 0.5;
  return {
    definitionId,
    valuePairKey,
    modelAProportionA: aFrac,
    modelBProportionA: bFrac,
    modelAChoice,
    modelBChoice,
    divergence: Math.abs(aFrac - bFrac),
    agrees: modelAChoice === modelBChoice,
  };
}

describe('computePairwiseKappaWithBreakdown', () => {
  function makeDomainMap(entries: Array<[string, string]>): Map<string, string> {
    return new Map(entries);
  }

  function makeDomainsById(entries: Array<[string, string]>): Map<string, { id: string; name: string }> {
    return new Map(entries.map(([id, name]) => [id, { id, name }]));
  }

  it('returns spread=null when only 1 domain has data', () => {
    const cells = [
      cell('def-1-a', 'A::B', 'A', 'A'),
      cell('def-1-b', 'A::B', 'B', 'B'),
    ];
    const definitionDomainIdById = makeDomainMap([
      ['def-1-a', 'dom-1'],
      ['def-1-b', 'dom-1'],
    ]);
    const domainsById = makeDomainsById([['dom-1', 'Job Choice']]);

    const result = computePairwiseKappaWithBreakdown(cells, definitionDomainIdById, domainsById);

    expect(result.domainCount).toBe(1);
    expect(result.spread).toBeNull();
    expect(result.kappaByDomain).toHaveLength(1);
    expect(result.kappaByDomain[0]?.domainName).toBe('Job Choice');
  });

  it('returns small spread when 4 domains all have kappa near 0.65', () => {
    const makeAgree = (defPrefix: string): ComparableCell[] =>
      Array.from({ length: 13 }, (_, index) => cell(`${defPrefix}-a${index}`, 'A::B', 'A', 'A'));
    const makeDisagree = (defPrefix: string): ComparableCell[] =>
      Array.from({ length: 7 }, (_, index) => cell(`${defPrefix}-d${index}`, 'A::B', 'A', 'B'));

    const domain1Agree = makeAgree('def-1');
    const domain1Disagree = makeDisagree('def-1');
    const domain2Agree = makeAgree('def-2');
    const domain2Disagree = makeDisagree('def-2');
    const domain3Agree = makeAgree('def-3');
    const domain3Disagree = makeDisagree('def-3');
    const domain4Agree = makeAgree('def-4');
    const domain4Disagree = makeDisagree('def-4');

    const cells: ComparableCell[] = [
      ...domain1Agree, ...domain1Disagree,
      ...domain2Agree, ...domain2Disagree,
      ...domain3Agree, ...domain3Disagree,
      ...domain4Agree, ...domain4Disagree,
    ];

    const definitionDomainIdById = makeDomainMap([
      ...domain1Agree.map((entry) => [entry.definitionId, 'dom-1'] as [string, string]),
      ...domain1Disagree.map((entry) => [entry.definitionId, 'dom-1'] as [string, string]),
      ...domain2Agree.map((entry) => [entry.definitionId, 'dom-2'] as [string, string]),
      ...domain2Disagree.map((entry) => [entry.definitionId, 'dom-2'] as [string, string]),
      ...domain3Agree.map((entry) => [entry.definitionId, 'dom-3'] as [string, string]),
      ...domain3Disagree.map((entry) => [entry.definitionId, 'dom-3'] as [string, string]),
      ...domain4Agree.map((entry) => [entry.definitionId, 'dom-4'] as [string, string]),
      ...domain4Disagree.map((entry) => [entry.definitionId, 'dom-4'] as [string, string]),
    ]);
    const domainsById = makeDomainsById([
      ['dom-1', 'Domain 1'],
      ['dom-2', 'Domain 2'],
      ['dom-3', 'Domain 3'],
      ['dom-4', 'Domain 4'],
    ]);

    const result = computePairwiseKappaWithBreakdown(cells, definitionDomainIdById, domainsById);

    expect(result.domainCount).toBe(4);
    expect(result.spread).not.toBeNull();
    expect(result.spread ?? Infinity).toBeLessThan(0.01);
  });

  it('returns correct spread when domains span different kappa values', () => {
    // Domain A: models agree most of the time — both alternate A/B together.
    // Each vignette has 2 cells: (A,A) and (B,B) so the models track each other perfectly.
    // This produces kappa = 1 for domain A.
    const highAgreeCells: ComparableCell[] = Array.from({ length: 10 }, (_, index) => [
      cell(`hi-${index}-a`, 'X::Y', 'A', 'A'),
      cell(`hi-${index}-b`, 'X::Y', 'B', 'B'),
    ]).flat();

    // Domain B: models disagree most of the time — (A,B) and (B,A) pairs.
    // This produces kappa = -1 for domain B.
    const lowAgreeCells: ComparableCell[] = Array.from({ length: 10 }, (_, index) => [
      cell(`lo-${index}-a`, 'X::Y', 'A', 'B'),
      cell(`lo-${index}-b`, 'X::Y', 'B', 'A'),
    ]).flat();

    // Assign each unique definitionId to its domain.
    // Note: each cell has a unique definitionId, so each is its own vignette.
    const definitionDomainIdById = new Map<string, string>();
    highAgreeCells.forEach((entry) => definitionDomainIdById.set(entry.definitionId, 'dom-high'));
    lowAgreeCells.forEach((entry) => definitionDomainIdById.set(entry.definitionId, 'dom-low'));

    const domainsById = makeDomainsById([
      ['dom-high', 'High Domain'],
      ['dom-low', 'Low Domain'],
    ]);
    const allCells = [...highAgreeCells, ...lowAgreeCells];

    const result = computePairwiseKappaWithBreakdown(allCells, definitionDomainIdById, domainsById);

    expect(result.domainCount).toBe(2);
    expect(result.spread).not.toBeNull();
    const kappas = result.kappaByDomain.map((entry) => entry.kappa).filter((kappa): kappa is number => kappa != null);
    expect(kappas).toHaveLength(2);
    const expectedSpread = Math.max(...kappas) - Math.min(...kappas);
    expect(result.spread).toBeCloseTo(expectedSpread, 10);
    // High domain should have positive kappa, low domain negative — spread must be > 0
    expect(result.spread ?? 0).toBeGreaterThan(0);
  });

  it('averageKappa is equal-weight mean of per-domain values', () => {
    const cells: ComparableCell[] = [
      cell('def-1-a', 'A::B', 'A', 'A'),
      cell('def-1-b', 'A::B', 'B', 'B'),
      cell('def-2-a', 'A::B', 'A', 'A'),
      cell('def-2-b', 'A::B', 'B', 'B'),
    ];
    const definitionDomainIdById = new Map<string, string>([
      ['def-1-a', 'dom-1'],
      ['def-1-b', 'dom-1'],
      ['def-2-a', 'dom-2'],
      ['def-2-b', 'dom-2'],
    ]);
    const domainsById = makeDomainsById([
      ['dom-1', 'Domain 1'],
      ['dom-2', 'Domain 2'],
    ]);

    const result = computePairwiseKappaWithBreakdown(cells, definitionDomainIdById, domainsById);

    const perDomainKappas = result.kappaByDomain
      .map((entry) => entry.kappa)
      .filter((kappa): kappa is number => kappa != null);
    expect(perDomainKappas).toHaveLength(2);
    const expected = perDomainKappas.reduce((sum, kappa) => sum + kappa, 0) / perDomainKappas.length;
    expect(result.averageKappa).toBeCloseTo(expected, 10);
  });
});
