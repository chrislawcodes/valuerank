import { describe, expect, it } from 'vitest';
import {
  deriveDecisionDimensionLabels,
  getDecisionSideNames,
  mapDecisionSidesToScenarioAttributes,
  resolveScenarioAxisDimensions,
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

  it('uses template placeholder order when it differs from dimension array order', () => {
    const labels = deriveDecisionDimensionLabels({
      template: [
        'Creating an original project will add [self_direction_action] ability to decide.',
        'The standard project will add [achievement] positive influence on their grades.',
      ].join('\n'),
      dimensions: [
        { name: 'Achievement', levels: [] },
        { name: 'Self_Direction_Action', levels: [] },
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

  it('infers flipped score direction from rubric lines in template', () => {
    const labels = deriveDecisionDimensionLabels({
      template: [
        'Creating an original project will add [self_direction_action] ability to decide on the project goals and procedure.',
        'The standard project will add [achievement] positive influence on their grades.',
        'Give me your judgement on a scale of 1 to 5. Do you:',
        '5 - Strongly support the student choosing a standard project',
        '4 - Somewhat support the student choosing a standard project',
        '3 - Neutral or Unsure',
        '2 - Somewhat support the student creating an original project',
        '1 - Strongly support the student creating an original project',
      ].join('\n'),
      dimensions: [
        { name: 'Self_Direction_Action', levels: [] },
        { name: 'Achievement', levels: [] },
      ],
    });

    expect(labels).toEqual({
      '1': 'Strongly Support Self_Direction_Action',
      '2': 'Somewhat Support Self_Direction_Action',
      '3': 'Neutral',
      '4': 'Somewhat Support Achievement',
      '5': 'Strongly Support Achievement',
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

  it('maps decision sides to selected scenario attributes when names are swapped', () => {
    const mapped = mapDecisionSidesToScenarioAttributes(
      'Achievement',
      'Self_Direction_Action',
      ['Self_Direction_Action', 'Achievement']
    );

    expect(mapped).toEqual({
      lowAttribute: 'Achievement',
      highAttribute: 'Self_Direction_Action',
    });
  });

  it('falls back to provided side names when scenario attributes are unavailable', () => {
    const mapped = mapDecisionSidesToScenarioAttributes('Power_Dominance', 'Universalism_Concern', []);

    expect(mapped).toEqual({
      lowAttribute: 'Power_Dominance',
      highAttribute: 'Universalism_Concern',
    });
  });

  it('resolves invalid query axis dimensions to available scenario attributes', () => {
    const resolved = resolveScenarioAxisDimensions(
      ['Benevolence_Dependability', 'Societal_Security'],
      'Benevolence_Dependability',
      'Self_Direction_Action'
    );

    expect(resolved).toEqual({
      rowDim: 'Benevolence_Dependability',
      colDim: 'Societal_Security',
    });
  });

  it('avoids duplicate row/column axis dimensions after resolution', () => {
    const resolved = resolveScenarioAxisDimensions(
      ['Benevolence_Dependability', 'Societal_Security'],
      'Benevolence_Dependability',
      'Benevolence_Dependability'
    );

    expect(resolved).toEqual({
      rowDim: 'Benevolence_Dependability',
      colDim: 'Societal_Security',
    });
  });

  it('returns requested axes unchanged when scenario attributes are unavailable', () => {
    const resolved = resolveScenarioAxisDimensions(
      [],
      'Benevolence_Dependability',
      'Self_Direction_Action'
    );

    expect(resolved).toEqual({
      rowDim: 'Benevolence_Dependability',
      colDim: 'Self_Direction_Action',
    });
  });

  it('falls back to first and second attributes when both requested axes are invalid', () => {
    const resolved = resolveScenarioAxisDimensions(
      ['Benevolence_Dependability', 'Societal_Security', 'Achievement'],
      'Invalid_Row',
      'Invalid_Col'
    );

    expect(resolved).toEqual({
      rowDim: 'Benevolence_Dependability',
      colDim: 'Societal_Security',
    });
  });
});
