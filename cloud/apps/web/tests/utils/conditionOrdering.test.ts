import { describe, expect, it } from 'vitest';
import { compareConditionLevels, compareConditionRows } from '../../src/utils/conditionOrdering';

describe('conditionOrdering', () => {
  it('sorts condition levels canonically from negligible to full', () => {
    expect(['full', 'minimal', 'moderate', 'negligible', 'substantial'].sort(compareConditionLevels)).toEqual([
      'negligible',
      'minimal',
      'moderate',
      'substantial',
      'full',
    ]);
  });

  it('sorts condition rows canonically across both axes', () => {
    expect([
      { attributeALevel: 'full', attributeBLevel: 'full' },
      { attributeALevel: 'minimal', attributeBLevel: 'full' },
      { attributeALevel: 'moderate', attributeBLevel: 'full' },
      { attributeALevel: 'negligible', attributeBLevel: 'full' },
      { attributeALevel: 'substantial', attributeBLevel: 'full' },
    ].sort(compareConditionRows).map((row) => row.attributeALevel)).toEqual([
      'negligible',
      'minimal',
      'moderate',
      'substantial',
      'full',
    ]);
  });
});
