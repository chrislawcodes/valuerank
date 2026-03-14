import { describe, expect, it } from 'vitest';

import {
  transformJobChoiceDefinition,
  isTransformableJobChoiceTemplate,
} from '../job-choice-transform.js';

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
  it('produces components with value_first and value_second', () => {
    const result = transformJobChoiceDefinition(SAMPLE_CONTENT);

    expect(result.content.components).toMatchObject({
      value_first: {
        token: 'achievement',
        body: 'recognition of their expertise because of how it relates to success through strong performance',
      },
      value_second: {
        token: 'hedonism',
        body: 'enjoyment in their daily experience because of how it relates to pleasure and comfort in everyday work',
      },
    });
  });

  it('assembles the template from components using offers...because wording', () => {
    const result = transformJobChoiceDefinition(SAMPLE_CONTENT);

    expect(result.content.template).toContain(
      'In one role, this job offers [achievement] recognition of their expertise because of how it relates to success through strong performance.',
    );
    expect(result.content.template).toContain(
      'In the other role, this job offers [hedonism] enjoyment in their daily experience because of how it relates to pleasure and comfort in everyday work.',
    );
    expect(result.content.template).toContain(
      '- Strongly support taking the job with [achievement] recognition of their expertise'
    );
    expect(result.content.template).not.toContain('they would gain');
    expect(result.content.template).not.toContain('1 to 5');
    
    // Validate role titles
    expect(result.roleTitles).toEqual(['a sales executive', 'a luxury resort reviewer']);
  });

  it('produces correct option labels', () => {
    const result = transformJobChoiceDefinition(SAMPLE_CONTENT);

    expect(result.optionLabels).toEqual([
      'taking the job with [achievement] recognition of their expertise',
      'taking the job with [hedonism] enjoyment in their daily experience',
    ]);
  });

  it('preserves methodology metadata and includes default pair_key', () => {
    const result = transformJobChoiceDefinition(SAMPLE_CONTENT);

    expect(result.content.methodology).toEqual({
      family: 'job-choice',
      response_scale: 'option_text',
      legacy_label: 'Old V1',
      canonical_value_order: ['Achievement', 'Hedonism'],
      presentation_order: 'A_first',
      pair_key: undefined,
    });
  });

  it('swaps value_first and value_second and applies pair_key for B_first', () => {
    const result = transformJobChoiceDefinition(SAMPLE_CONTENT, {
      presentationOrder: 'B_first',
      pairKey: 'jobs-achievement-vs-hedonism',
    });

    expect(result.content.components?.value_first.token).toBe('hedonism');
    expect(result.content.components?.value_second.token).toBe('achievement');
    expect(result.content.template).toContain('In one role, this job offers [hedonism]');
    expect(result.roleTitles).toEqual(['a luxury resort reviewer', 'a sales executive']);
    
    expect(result.content.methodology).toEqual({
      family: 'job-choice',
      response_scale: 'option_text',
      legacy_label: 'Old V1',
      canonical_value_order: ['Achievement', 'Hedonism'],
      presentation_order: 'B_first',
      pair_key: 'jobs-achievement-vs-hedonism',
    });
  });

  it('throws for a token not in the VALUE_STATEMENTS map', () => {
    const bad = {
      ...SAMPLE_CONTENT,
      template: SAMPLE_CONTENT.template.replace('[achievement]', '[unknown_value]'),
    };
    expect(() => transformJobChoiceDefinition(bad)).toThrow(
      'No Job Choice value statement is defined for token: unknown_value',
    );
  });

  it('preserves the intro paragraph in the assembled template', () => {
    const result = transformJobChoiceDefinition(SAMPLE_CONTENT);
    expect(result.content.template).toContain(
      'A mid-level professional has been offered two distinct roles.',
    );
  });
});
