import { describe, expect, it } from 'vitest';
import { parsePairList } from '../../../src/services/consistency/modelsConsistencyData.js';

describe('parsePairConditions — null winRate handling', () => {
  it('includes a condition whose winRate cannot be parsed as null rather than dropping it', () => {
    const raw = [
      {
        domainId: 'domain-1',
        valueKey: 'Achievement',
        perCondition: [
          { scenarioId: 'sc-1', netPressureRank: 1, winRate: 0.7, matches: 7, trials: 10 },
          { scenarioId: 'sc-2', netPressureRank: -1, winRate: null, matches: 0, trials: 10 },
        ],
      },
    ];

    const pairs = parsePairList(raw);
    expect(pairs).toHaveLength(1);
    const conditions = pairs[0]!.perCondition;
    expect(conditions).toHaveLength(2);
    const nullCondition = conditions.find((c) => c.scenarioId === 'sc-2');
    expect(nullCondition?.winRate).toBeNull();
  });

  it('excludes a null-winRate condition from the coherence correlation', () => {
    const raw = [
      {
        domainId: 'domain-1',
        valueKey: 'Achievement',
        perCondition: [
          { scenarioId: 'sc-1', netPressureRank: 2, winRate: 0.9, matches: 9, trials: 10 },
          { scenarioId: 'sc-2', netPressureRank: 1, winRate: 0.7, matches: 7, trials: 10 },
          { scenarioId: 'sc-3', netPressureRank: -1, winRate: 0.3, matches: 3, trials: 10 },
          { scenarioId: 'sc-no-data', netPressureRank: -2, winRate: null, matches: 0, trials: 0 },
        ],
      },
    ];

    const pairs = parsePairList(raw);
    const pair = pairs[0]!;
    expect(pair.perCondition).toHaveLength(4);
    expect(pair.determinate).toBe(true);
    expect(pair.coherent).toBe(true);
  });

  it('marks pair as not determinate when fewer than 3 conditions have a real winRate', () => {
    const raw = [
      {
        domainId: 'domain-1',
        valueKey: 'Achievement',
        perCondition: [
          { scenarioId: 'sc-1', netPressureRank: 1, winRate: 0.7, matches: 7, trials: 10 },
          { scenarioId: 'sc-2', netPressureRank: -1, winRate: null, matches: 0, trials: 10 },
          { scenarioId: 'sc-3', netPressureRank: 0, winRate: null, matches: 0, trials: 10 },
        ],
      },
    ];

    const pairs = parsePairList(raw);
    expect(pairs[0]?.determinate).toBe(false);
  });
});
