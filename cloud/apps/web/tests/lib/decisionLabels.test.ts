import { describe, expect, it } from 'vitest';
import {
  deriveDecisionDimensionLabels,
  deriveScenarioAttributesFromDefinition,
  getDominantScenarioAttributes,
  getDecisionSideNames,
  mapDecisionSidesToScenarioAttributes,
  resolveScenarioAttributes,
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

  it('uses the dominant scenario attribute set when mixed keys exist', () => {
    const attributes = getDominantScenarioAttributes({
      s1: { Benevolence_Dependability: '1', Societal_Security: '1' },
      s2: { Benevolence_Dependability: '2', Societal_Security: '2' },
      s3: { Benevolence_Dependability: '3', Self_Direction_Action: '3' },
    });

    expect(attributes).toEqual(['Benevolence_Dependability', 'Societal_Security']);
  });

  it('returns empty list when scenario dimensions are missing', () => {
    const attributes = getDominantScenarioAttributes(undefined);
    expect(attributes).toEqual([]);
  });

  it('derives expected scenario attributes from definition content', () => {
    const attributes = deriveScenarioAttributesFromDefinition({
      dimensions: [
        { name: 'Benevolence_Dependability', levels: [] },
        { name: 'Societal_Security', levels: [] },
        { name: 'Decision', levels: [] },
      ],
    });

    expect(attributes).toEqual(['Benevolence_Dependability', 'Societal_Security']);
  });

  it('prefers vignette attributes when resolving scenario attributes', () => {
    const attributes = resolveScenarioAttributes(
      {
        s1: { Benevolence_Dependability: '1', Self_Direction_Action: '1' },
        s2: { Benevolence_Dependability: '2', Self_Direction_Action: '2' },
        s3: { Benevolence_Dependability: '3', Societal_Security: '3' },
        s4: { Benevolence_Dependability: '4', Societal_Security: '4' },
      },
      ['Benevolence_Dependability', 'Societal_Security']
    );

    expect(attributes).toEqual(['Benevolence_Dependability', 'Societal_Security']);
  });

  it('falls back to dominant attributes when preferred list is empty', () => {
    const attributes = resolveScenarioAttributes(
      {
        s1: { Benevolence_Dependability: '1', Societal_Security: '1' },
        s2: { Benevolence_Dependability: '2', Societal_Security: '2' },
      },
      []
    );

    expect(attributes).toEqual(['Benevolence_Dependability', 'Societal_Security']);
  });

  it('keeps vignette attributes as source-of-truth even when absent in scenario keys', () => {
    const attributes = resolveScenarioAttributes(
      {
        s1: { Benevolence_Dependability: '1', Societal_Security: '1' },
        s2: { Benevolence_Dependability: '2', Societal_Security: '2' },
      },
      ['Self_Direction_Action', 'Achievement']
    );

    expect(attributes).toEqual(['Self_Direction_Action', 'Achievement']);
  });

  it('keeps vignette pair even when one side differs from scenario keys', () => {
    const attributes = resolveScenarioAttributes(
      {
        s1: { Benevolence_Dependability: '1', Societal_Security: '1' },
        s2: { Benevolence_Dependability: '2', Societal_Security: '2' },
      },
      ['Benevolence_Dependability', 'Self_Direction_Action']
    );

    expect(attributes).toEqual(['Benevolence_Dependability', 'Self_Direction_Action']);
  });

  it('uses signatures with analysis scores when model matrix is provided', () => {
    const attributes = resolveScenarioAttributes(
      {
        s1: { Benevolence_Dependability: '1', Societal_Security: '1' },
        s2: { Benevolence_Dependability: '2', Societal_Security: '2' },
        s3: { Benevolence_Dependability: '3', Self_Direction_Action: '3' },
      },
      ['Benevolence_Dependability', 'Societal_Security'],
      {
        modelA: {
          s1: 4,
          s2: 3,
        },
      }
    );

    expect(attributes).toEqual(['Benevolence_Dependability', 'Societal_Security']);
  });

  it('uses vignette attributes directly when model matrix is missing (backward compatible)', () => {
    const attributes = resolveScenarioAttributes(
      {
        s1: { Benevolence_Dependability: '1', Societal_Security: '1' },
        s2: { Benevolence_Dependability: '2', Societal_Security: '2' },
      },
      ['Self_Direction_Action', 'Achievement']
    );

    expect(attributes).toEqual(['Self_Direction_Action', 'Achievement']);
  });

  it('treats only finite numeric values as scored scenarios', () => {
    const attributes = resolveScenarioAttributes(
      {
        s1: { Benevolence_Dependability: '1', Societal_Security: '1' },
        s2: { Benevolence_Dependability: '2', Self_Direction_Action: '2' },
      },
      [],
      {
        modelA: {
          s1: Number.NaN,
          s2: 0,
        },
      }
    );

    expect(attributes).toEqual(['Benevolence_Dependability', 'Self_Direction_Action']);
  });
});
