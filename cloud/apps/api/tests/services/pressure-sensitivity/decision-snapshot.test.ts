import { describe, expect, it } from 'vitest';
import type { DefinitionContent } from '@valuerank/db';
import { resolveTranscriptDecisionModel } from '../../../src/graphql/queries/domain/decision-model.js';
import { buildPressureSensitivityDecisionSnapshot } from '../../../src/services/pressure-sensitivity/decision-snapshot.js';

const content: DefinitionContent = {
  schema_version: 1,
  template: [
    'Which job would you choose?',
    '- Strongly support taking the job with recognition of their expertise',
    '- Somewhat support taking the job with enjoyment in their daily experience',
  ].join('\n'),
  dimensions: [
    {
      name: 'achievement',
      levels: [
        { score: 1, label: 'low achievement' },
        { score: 5, label: 'high achievement' },
      ],
    },
    {
      name: 'hedonism',
      levels: [
        { score: 1, label: 'low hedonism' },
        { score: 5, label: 'high hedonism' },
      ],
    },
  ],
  components: {
    context_id: null,
    value_first: {
      token: 'achievement',
      body: 'recognition of their expertise',
    },
    value_second: {
      token: 'hedonism',
      body: 'enjoyment in their daily experience',
    },
  },
};

describe('buildPressureSensitivityDecisionSnapshot', () => {
  it('preserves enough resolved Definition data to recover decisions', () => {
    const snapshot = buildPressureSensitivityDecisionSnapshot(content);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.dimensions).toHaveLength(2);
    expect(snapshot?.components?.value_first.body).toBe('recognition of their expertise');

    const result = resolveTranscriptDecisionModel({
      decisionMetadata: {
        parseClass: 'exact',
        parsePath: 'text_label_leading',
        parserVersion: 'job-choice-v2',
        matchedLabel: 'Strongly support taking the job with recognition of their expertise',
        responseExcerpt: 'Strongly support taking the job with recognition of their expertise',
      },
      definitionSnapshot: snapshot,
      orientationFlipped: false,
    });

    expect(result.canonical.favoredValueKey).toBe('Achievement');
    expect(result.canonical.direction).toBe('favor_first');
    expect(result.canonical.strength).toBe('strong');
  });
});
