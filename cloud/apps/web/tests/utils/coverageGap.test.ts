import { describe, expect, it } from 'vitest';
import { computeLaggingDirection, formatPairLabel } from '../../src/utils/coverageGap';

function makeCell(overrides: Partial<Parameters<typeof computeLaggingDirection>[0]> = {}) {
  return {
    valueA: 'Achievement',
    valueB: 'Power_Dominance',
    definitionId: 'fallback-def',
    directionalCoverage: [],
    ...overrides,
  };
}

describe('formatPairLabel', () => {
  it('uses the value labels when available', () => {
    expect(formatPairLabel('Achievement', 'Power_Dominance')).toBe('Achievement vs Power');
  });
});

describe('computeLaggingDirection', () => {
  it('returns the smaller filled-slot side as lagging', () => {
    expect(
      computeLaggingDirection(makeCell({
        directionalCoverage: [
          { direction: 'Achievement', completeBatches: 2, filledSlots: 1, definitionIds: ['def-a'] },
          { direction: 'Power_Dominance', completeBatches: 2, filledSlots: 3, definitionIds: ['def-b'] },
        ],
      })),
    ).toEqual({ direction: 'Achievement', definitionId: 'def-a' });
  });

  it('uses completeBatches as the tiebreak when filled slots match', () => {
    expect(
      computeLaggingDirection(makeCell({
        directionalCoverage: [
          { direction: 'Achievement', completeBatches: 1, filledSlots: 3, definitionIds: ['def-a'] },
          { direction: 'Power_Dominance', completeBatches: 2, filledSlots: 3, definitionIds: ['def-b'] },
        ],
      })),
    ).toEqual({ direction: 'Achievement', definitionId: 'def-a' });
  });

  it('returns null when both directions are equal and non-zero', () => {
    expect(
      computeLaggingDirection(makeCell({
        directionalCoverage: [
          { direction: 'Achievement', completeBatches: 2, filledSlots: 4, definitionIds: ['def-a'] },
          { direction: 'Power_Dominance', completeBatches: 2, filledSlots: 4, definitionIds: ['def-b'] },
        ],
      })),
    ).toBeNull();
  });

  it('treats the missing side as lagging when only one direction has data', () => {
    expect(
      computeLaggingDirection(makeCell({
        directionalCoverage: [
          { direction: 'Achievement', completeBatches: 3, filledSlots: 6, definitionIds: ['def-a'] },
        ],
      })),
    ).toEqual({ direction: 'Power_Dominance', definitionId: 'fallback-def' });
  });

  it('uses the first directional definition ID for multi-definition cells', () => {
    expect(
      computeLaggingDirection(makeCell({
        directionalCoverage: [
          { direction: 'Achievement', completeBatches: 1, filledSlots: 1, definitionIds: ['def-a', 'def-z'] },
          { direction: 'Power_Dominance', completeBatches: 3, filledSlots: 4, definitionIds: ['def-b'] },
        ],
      })),
    ).toEqual({ direction: 'Achievement', definitionId: 'def-a' });
  });
});
