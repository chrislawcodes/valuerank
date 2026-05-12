import { describe, expect, it } from 'vitest';
import { computeCellWeightedDomainRates } from '../../../src/services/analysis/domain-analysis-cell-win-rates.js';
import { encodeCellKey, type CellCounts } from '../../../src/services/analysis/transcript-cell-accumulator.js';
import type { DomainAnalysisValueKey } from '../../../src/graphql/queries/domain-analysis-values.js';

const FIRST_VALUE = 'Achievement';
const SECOND_VALUE = 'Security_Personal';

function buildCellKey(params: {
  definitionId: string;
  modelId: string;
  valueKey: DomainAnalysisValueKey;
  ownLevel: number;
  opponentLevel: number;
}): string {
  return encodeCellKey({
    definitionId: params.definitionId,
    modelId: params.modelId,
    valueKey: params.valueKey,
    ownLevel: params.ownLevel,
    opponentLevel: params.opponentLevel,
  });
}

function buildCounts(wins: number, losses: number, neutrals: number): CellCounts {
  return { wins, losses, neutrals };
}

describe('computeCellWeightedDomainRates', () => {
  it('uses equal-weight cell rates instead of observation-weighted rates', () => {
    const cellMap = new Map<string, CellCounts>([
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(8, 2, 0)],
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 2, opponentLevel: 1 }), buildCounts(1, 0, 0)],
    ]);

    const result = computeCellWeightedDomainRates({
      cellMap,
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
      definitionValuePairById: new Map([['def1', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }]]),
    });

    expect(result.models[0]?.valueWinRates[FIRST_VALUE]).toBe(90);
  });

  it('skips zero-trial cells when averaging win rates', () => {
    const cellMap = new Map<string, CellCounts>([
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(0, 0, 0)],
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 2, opponentLevel: 1 }), buildCounts(1, 1, 0)],
    ]);

    const result = computeCellWeightedDomainRates({
      cellMap,
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
      definitionValuePairById: new Map([['def1', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }]]),
    });

    expect(result.models[0]?.valueWinRates[FIRST_VALUE]).toBe(50);
  });

  it('returns the cell rate when there is one vignette and one cell', () => {
    const cellMap = new Map<string, CellCounts>([
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(3, 1, 0)],
    ]);

    const result = computeCellWeightedDomainRates({
      cellMap,
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
      definitionValuePairById: new Map([['def1', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }]]),
    });

    expect(result.models[0]?.valueWinRates[FIRST_VALUE]).toBe(75);
  });

  it('averages vignette rates across multiple vignettes', () => {
    const cellMap = new Map<string, CellCounts>([
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(4, 1, 0)],
      [buildCellKey({ definitionId: 'def2', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(1, 4, 0)],
    ]);

    const result = computeCellWeightedDomainRates({
      cellMap,
      filteredSourceRunDefinitionById: new Map([
        ['run-1', 'def1'],
        ['run-2', 'def2'],
      ]),
      definitionValuePairById: new Map([
        ['def1', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }],
        ['def2', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }],
      ]),
    });

    expect(result.models[0]?.valueWinRates[FIRST_VALUE]).toBe(50);
  });

  it('leaves a vignette out of valueWinRates when all of its cells are excluded', () => {
    const cellMap = new Map<string, CellCounts>([
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(0, 0, 0)],
    ]);

    const result = computeCellWeightedDomainRates({
      cellMap,
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
      definitionValuePairById: new Map([['def1', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }]]),
    });

    expect(result.models[0]?.valueWinRates[FIRST_VALUE]).toBeUndefined();
  });

  it('returns no models for an empty cell map', () => {
    const result = computeCellWeightedDomainRates({
      cellMap: new Map(),
      filteredSourceRunDefinitionById: new Map(),
      definitionValuePairById: new Map(),
    });

    expect(result.models).toEqual([]);
    expect(result.analyzedDefinitionIds.size).toBe(0);
  });

  it('does not create a zero or NaN win rate when all vignette rates are missing', () => {
    const cellMap = new Map<string, CellCounts>([
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(0, 0, 0)],
      [buildCellKey({ definitionId: 'def2', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(0, 0, 0)],
    ]);

    const result = computeCellWeightedDomainRates({
      cellMap,
      filteredSourceRunDefinitionById: new Map([
        ['run-1', 'def1'],
        ['run-2', 'def2'],
      ]),
      definitionValuePairById: new Map([
        ['def1', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }],
        ['def2', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }],
      ]),
    });

    expect(result.models[0]?.valueWinRates[FIRST_VALUE]).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(result.models[0]?.valueWinRates ?? {}, FIRST_VALUE)).toBe(false);
  });

  it('counts wins across all cells, including zero-trial cells', () => {
    const cellMap = new Map<string, CellCounts>([
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(8, 2, 0)],
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 2, opponentLevel: 1 }), buildCounts(0, 0, 0)],
    ]);

    const result = computeCellWeightedDomainRates({
      cellMap,
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
      definitionValuePairById: new Map([['def1', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }]]),
    });

    expect(result.models[0]?.counts[FIRST_VALUE]).toEqual({
      prioritized: 8,
      deprioritized: 2,
      neutral: 0,
    });
  });

  it('weights directions equally when one direction has more vignettes than the other', () => {
    // 2 vignettes with Achievement-first direction (def1 + def2), 1 with Security-first (def3).
    // Without direction balancing, Achievement-first would get 2/3 of the weight.
    // With direction balancing: avg(def1, def2) → direction rate; then avg(A-first, S-first) → pair rate.
    const cellMap = new Map<string, CellCounts>([
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 1 }), buildCounts(9, 1, 0)],
      [buildCellKey({ definitionId: 'def2', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 1 }), buildCounts(7, 3, 0)],
      [buildCellKey({ definitionId: 'def3', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 1 }), buildCounts(2, 8, 0)],
    ]);

    const result = computeCellWeightedDomainRates({
      cellMap,
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1'], ['run-2', 'def2'], ['run-3', 'def3']]),
      definitionValuePairById: new Map([
        ['def1', { valueA: FIRST_VALUE, valueB: SECOND_VALUE, valueFirst: FIRST_VALUE }],
        ['def2', { valueA: FIRST_VALUE, valueB: SECOND_VALUE, valueFirst: FIRST_VALUE }],
        ['def3', { valueA: FIRST_VALUE, valueB: SECOND_VALUE, valueFirst: SECOND_VALUE }],
      ]),
    });

    // A-first direction rate = avg(90%, 70%) = 80%
    // S-first direction rate = 20%
    // pair rate = avg(80%, 20%) = 50%
    // (old flat average would be (90+70+20)/3 ≈ 60%)
    expect(result.models[0]?.valueWinRates[FIRST_VALUE]).toBeCloseTo(50, 5);
  });

  it('maps pairwise wins by winner and opponent value key', () => {
    const cellMap = new Map<string, CellCounts>([
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(3, 1, 0)],
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: SECOND_VALUE, ownLevel: 2, opponentLevel: 1 }), buildCounts(2, 0, 0)],
    ]);

    const result = computeCellWeightedDomainRates({
      cellMap,
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
      definitionValuePairById: new Map([['def1', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }]]),
    });

    expect(result.models[0]?.pairwiseWins[FIRST_VALUE]?.[SECOND_VALUE]).toBe(3);
    expect(result.models[0]?.pairwiseWins[SECOND_VALUE]?.[FIRST_VALUE]).toBe(2);
  });
});

describe('computeCellWeightedDomainRates exc-neutral rates', () => {
  it('computes exc-neutral rates from decisive responses only', () => {
    const cellMap = new Map<string, CellCounts>([
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(3, 2, 5)],
    ]);

    const result = computeCellWeightedDomainRates({
      cellMap,
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
      definitionValuePairById: new Map([['def1', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }]]),
    });

    expect(result.excNeutralValueWinRatesByModel.get('m1')?.[FIRST_VALUE]).toBeCloseTo(60, 5);
  });

  it('omits values with no decisive responses from exc-neutral rates', () => {
    const cellMap = new Map<string, CellCounts>([
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(0, 0, 5)],
    ]);

    const result = computeCellWeightedDomainRates({
      cellMap,
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
      definitionValuePairById: new Map([['def1', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }]]),
    });

    const excNeutralRates = result.excNeutralValueWinRatesByModel.get('m1') ?? {};
    expect(excNeutralRates[FIRST_VALUE]).toBeUndefined();
    expect(Object.keys(excNeutralRates)).toHaveLength(0);
  });

  it('matches standard win rates when there are no neutral responses', () => {
    const cellMap = new Map<string, CellCounts>([
      [buildCellKey({ definitionId: 'def1', modelId: 'm1', valueKey: FIRST_VALUE, ownLevel: 1, opponentLevel: 2 }), buildCounts(3, 2, 0)],
    ]);

    const result = computeCellWeightedDomainRates({
      cellMap,
      filteredSourceRunDefinitionById: new Map([['run-1', 'def1']]),
      definitionValuePairById: new Map([['def1', { valueA: FIRST_VALUE, valueB: SECOND_VALUE }]]),
    });

    expect(result.models[0]?.valueWinRates[FIRST_VALUE]).toBe(result.excNeutralValueWinRatesByModel.get('m1')?.[FIRST_VALUE]);
  });
});
