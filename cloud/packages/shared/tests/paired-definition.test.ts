import { describe, expect, it } from 'vitest';
import {
  getPairedFamilyConfig,
  normalizePairedDefinitionContent,
} from '../src/paired-definition.js';

const FAMILY_NAMES = [
  'job-choice',
  'software-approach-choice',
  'library-books-genre-choice',
  'national-priorities',
  'neighborhood-choice',
] as const;

const BASE_CONTENT = {
  schema_version: 1,
  dimensions: [],
  components: {
    context_id: null,
    value_first: {
      token: 'self_direction_action',
      body: '[level] freedom in how they work because of how it relates to independent choice in goals and actions',
    },
    value_second: {
      token: 'power_dominance',
      body: '[level] authority over others because of how it relates to control over people and the decisions that affect them',
    },
  },
  methodology: {
    family: 'job-choice',
  },
} as const;

describe('paired-definition', () => {
  it('exposes family config for library title-choice', () => {
    const config = getPairedFamilyConfig('library-books-genre-choice');

    expect(config).toEqual(
      expect.objectContaining({
        sentencePrefix: 'One title offers readers [level] insight about',
        labelPrefix: 'the title that offers readers insight about',
      }),
    );
  });

  it.each(FAMILY_NAMES)('normalizes %s with its own wording', (family) => {
    const config = getPairedFamilyConfig(family);
    expect(config).toBeDefined();

    const firstBody = config!.bodyLookup(BASE_CONTENT.components.value_first.token);
    const secondBody = config!.bodyLookup(BASE_CONTENT.components.value_second.token);

    expect(firstBody).toBeDefined();
    expect(secondBody).toBeDefined();

    const contentWithFamilyPrefix = {
      ...BASE_CONTENT,
      template: [
        'A person is choosing between two values.',
        '',
        `${config!.sentencePrefix} ${BASE_CONTENT.components.value_first.body}.`,
        '',
        `${config!.sentencePrefix} ${BASE_CONTENT.components.value_second.body}.`,
      ].join('\n'),
    };

    const content = normalizePairedDefinitionContent({
      ...contentWithFamilyPrefix,
      methodology: {
        family,
      },
    });

    expect(content.template).toContain(config!.sentencePrefix);
    expect(content.template).toContain(firstBody!);
    expect(content.template).toContain(secondBody!);
    expect(content.components?.value_first.body).toBe(firstBody);
    expect(content.components?.value_second.body).toBe(secondBody);

    if (family !== 'job-choice') {
      expect(content.template).not.toContain('freedom in how they work');
    }
  });

  it('normalizes paired content with family-specific wording', () => {
    const content = normalizePairedDefinitionContent({
      schema_version: 1,
      template: [
        'A librarian is choosing between two titles.',
        '',
        'One title offers readers [level] insight about freedom in how they work because of how it relates to independent choice in goals and actions.',
        '',
        'One title offers readers [level] insight about authority over others because of how it relates to control over people and the decisions that affect them.',
      ].join('\n'),
      dimensions: [],
      components: {
        context_id: null,
        value_first: {
          token: 'self_direction_action',
          body: '[level] freedom in how they work because of how it relates to independent choice in goals and actions',
        },
        value_second: {
          token: 'power_dominance',
          body: '[level] authority over others because of how it relates to control over people and the decisions that affect them',
        },
      },
      methodology: {
        family: 'library-books-genre-choice',
      },
    });

    expect(content.template).toContain('One title offers readers');
    expect(content.template).toContain('living life on their own terms');
    expect(content.template).toContain('how power over others is gained and exercised');
    expect(content.components?.value_first.body).toBe(
      'living life on their own terms because of how it relates to independent choice in goals and actions',
    );
    expect(content.components?.value_second.body).toBe(
      'how power over others is gained and exercised because of how it relates to control over people and the decisions that affect them',
    );
  });
});
