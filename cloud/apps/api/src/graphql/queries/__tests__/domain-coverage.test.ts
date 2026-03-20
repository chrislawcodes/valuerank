import { describe, expect, it } from 'vitest';
import { extractValuePair, selectPrimaryDefinitionCount } from '../domain-coverage-utils.js';

describe('extractValuePair', () => {
  it('normalizes lowercase dimension names to canonical coverage keys', () => {
    expect(
      extractValuePair({
        dimensions: [
          { name: 'achievement' },
          { name: 'benevolence_dependability' },
        ],
      }),
    ).toEqual({
      valueA: 'Achievement',
      valueB: 'Benevolence_Dependability',
    });
  });

  it('preserves already-canonical keys', () => {
    expect(
      extractValuePair({
        dimensions: [
          { name: 'Self_Direction_Action' },
          { name: 'Universalism_Nature' },
        ],
      }),
    ).toEqual({
      valueA: 'Self_Direction_Action',
      valueB: 'Universalism_Nature',
    });
  });

  it('reverses B-first paired definitions', () => {
    expect(
      extractValuePair({
        dimensions: [
          { name: 'achievement' },
          { name: 'benevolence_dependability' },
        ],
        methodology: {
          presentation_order: 'B_first',
        },
      }),
    ).toEqual({
      valueA: 'Benevolence_Dependability',
      valueB: 'Achievement',
    });
  });

  it('rejects definitions that do not resolve to known coverage keys', () => {
    expect(
      extractValuePair({
        dimensions: [
          { name: 'achievement' },
          { name: 'not_a_real_dimension' },
        ],
      }),
    ).toBeNull();
  });
});

describe('selectPrimaryDefinitionCount', () => {
  it('uses the primary definition count without summing sibling definitions', () => {
    const counts = new Map<string, number>([
      ['def-a', 2],
      ['def-b', 1],
    ]);

    expect(selectPrimaryDefinitionCount(['def-a', 'def-b'], counts)).toEqual({
      primaryDefinitionId: 'def-a',
      batchCount: 2,
    });
  });

  it('returns zero for an empty definition list', () => {
    expect(selectPrimaryDefinitionCount([], new Map())).toEqual({
      primaryDefinitionId: null,
      batchCount: 0,
    });
  });
});
