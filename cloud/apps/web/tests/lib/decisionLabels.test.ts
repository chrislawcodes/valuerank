import { describe, expect, it } from 'vitest';
import {
  deriveDecisionDimensionLabels,
  getDecisionSideNames,
} from '../../src/utils/decisionLabels';

describe('decisionLabels', () => {
  it('derives score labels from explicit decision dimension when present', () => {
    const labels = deriveDecisionDimensionLabels({
      dimensions: [
        {
          name: 'Decision',
          levels: [
            { score: 1, label: 'Strongly Support B' },
            { score: 2, label: 'Somewhat Support B' },
            { score: 3, label: 'Neutral' },
            { score: 4, label: 'Somewhat Support A' },
            { score: 5, label: 'Strongly Support A' },
          ],
        },
      ],
    });

    expect(labels?.['1']).toBe('Strongly Support B');
    expect(labels?.['5']).toBe('Strongly Support A');
  });

  it('maps two-attribute definitions to score direction used in probe prompts', () => {
    const labels = deriveDecisionDimensionLabels({
      dimensions: [
        { name: 'Self_Direction_Action', levels: [] },
        { name: 'Achievement', levels: [] },
      ],
    });

    expect(labels).toEqual({
      '1': 'Strongly Support Achievement',
      '2': 'Somewhat Support Achievement',
      '3': 'Neutral',
      '4': 'Somewhat Support Self_Direction_Action',
      '5': 'Strongly Support Self_Direction_Action',
    });
  });

  it('computes side names from score-1 and score-5 labels', () => {
    const names = getDecisionSideNames({
      '1': 'Strongly Support Achievement',
      '5': 'Strongly Support Self_Direction_Action',
    });

    expect(names.aName).toBe('Achievement');
    expect(names.bName).toBe('Self_Direction_Action');
  });
});
