import { describe, expect, it } from 'vitest';

import { transformJobChoiceDefinition, isTransformableJobChoiceTemplate } from '../job-choice-transform.js';

const SAMPLE_CONTENT = {
  schema_version: 2 as const,
  template: [
    'A mid-level professional has been offered two distinct roles. Both roles offer identical compensation and benefits, but the daily responsibilities are fundamentally different.',
    '',
    'If they work as a sales executive, they gain [achievement] recognition for their expertise by consistently exceeding performance targets and demonstrating they are one of the top performers in their field.',
    '',
    'If they work as a luxury resort reviewer, they gain [hedonism] personal enjoyment by spending their days experiencing fine food, physical comfort, and pleasure.',
    '',
    'Give me your judgment on a scale of 1 to 5. Do you:',
    '5 - Strongly support the worker choosing the sales executive role',
    '4 - Somewhat support the worker choosing the sales executive role',
    '3 - Neutral or Unsure',
    '2 - Somewhat support the worker choosing the luxury resort reviewer role',
    '1 - Strongly support the worker choosing the luxury resort reviewer role',
  ].join('\n'),
  dimensions: [
    { name: 'Achievement', levels: [] },
    { name: 'Hedonism', levels: [] },
  ],
};

describe('isTransformableJobChoiceTemplate', () => {
  it('detects legacy Jobs templates', () => {
    expect(isTransformableJobChoiceTemplate(SAMPLE_CONTENT.template)).toBe(true);
  });
});

describe('transformJobChoiceDefinition', () => {
  it('rewrites legacy job titles into job-choice wording and scale labels', () => {
    const result = transformJobChoiceDefinition(SAMPLE_CONTENT);

    expect(result.roleTitles).toEqual(['a sales executive', 'a luxury resort reviewer']);
    expect(result.optionLabels).toEqual([
      'taking the job with [achievement] recognition for expertise',
      'taking the job with [hedonism] personal enjoyment',
    ]);
    expect(result.content.methodology).toEqual({
      family: 'job-choice',
      response_scale: 'option_text',
      legacy_label: 'Old V1',
      canonical_value_order: ['Achievement', 'Hedonism'],
      presentation_order: 'A_first',
      pair_key: undefined,
    });
    expect(result.content.template).toContain(
      'In one role, they would gain [achievement] recognition for expertise by exceeding demanding performance targets and standing out as a top performer.'
    );
    expect(result.content.template).toContain(
      'In the other role, they would gain [hedonism] personal enjoyment by experiencing comfort, pleasure, and enjoyable daily experiences.'
    );
    expect(result.content.template).toContain(
      '- Strongly support taking the job with [achievement] recognition for expertise'
    );
    expect(result.content.template).not.toContain('choosing the sales executive role');
    expect(result.content.template).not.toContain('1 to 5');
  });

  it('can generate the B-first companion wording', () => {
    const result = transformJobChoiceDefinition(SAMPLE_CONTENT, {
      presentationOrder: 'B_first',
      pairKey: 'jobs-achievement-vs-hedonism',
    });

    expect(result.roleTitles).toEqual(['a luxury resort reviewer', 'a sales executive']);
    expect(result.content.methodology).toEqual({
      family: 'job-choice',
      response_scale: 'option_text',
      legacy_label: 'Old V1',
      canonical_value_order: ['Achievement', 'Hedonism'],
      presentation_order: 'B_first',
      pair_key: 'jobs-achievement-vs-hedonism',
    });
    expect(result.content.template).toContain(
      'In one role, they would gain [hedonism] personal enjoyment by experiencing comfort, pleasure, and enjoyable daily experiences.'
    );
    expect(result.content.template).toContain(
      '- Strongly support taking the job with [hedonism] personal enjoyment'
    );
  });
});
