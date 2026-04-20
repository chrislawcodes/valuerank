import { describe, expect, it } from 'vitest';
import {
  resolveTranscriptDecisionModel,
  type DecisionPair,
} from '../../../src/graphql/queries/domain/decision-model.js';

/**
 * Regression tests for job-choice-v2 canonicalization via pairOverride without definitionSnapshot.
 *
 * Domain-analysis aggregation callers (value-detail, domain-analysis-aggregation) invoke
 * resolveTranscriptDecisionModel with pairOverride only — no definitionSnapshot — leaving
 * valueStatements undefined. Without a fallback, resolveValueKeyFromText returns null and
 * all job-choice-v2 transcripts are marked "Unknown".
 *
 * The fix falls back to JOB_CHOICE_VALUE_STATEMENTS for parserVersion === 'job-choice-v2',
 * ensuring all 10 Job Choice values resolve correctly.
 */

const allJobChoiceEntries: Array<{
  token: string;
  matchedLabel: string;
  pair: DecisionPair;
  expectedFavored: string;
}> = [
  {
    token: 'self_direction_action',
    matchedLabel: 'Somewhat support taking the job with freedom in how they work',
    pair: { valueA: 'Achievement', valueB: 'Self_Direction_Action' },
    expectedFavored: 'Self_Direction_Action',
  },
  {
    token: 'power_dominance',
    matchedLabel: 'Strongly support taking the job with authority over others',
    pair: { valueA: 'Power_Dominance', valueB: 'Universalism_Nature' },
    expectedFavored: 'Power_Dominance',
  },
  {
    token: 'security_personal',
    matchedLabel: 'Somewhat support taking the job with personal security in everyday life',
    pair: { valueA: 'Achievement', valueB: 'Security_Personal' },
    expectedFavored: 'Security_Personal',
  },
  {
    token: 'conformity_interpersonal',
    matchedLabel: 'Strongly support taking the job with harmony in their close relationships',
    pair: { valueA: 'Achievement', valueB: 'Conformity_Interpersonal' },
    expectedFavored: 'Conformity_Interpersonal',
  },
  {
    token: 'tradition',
    matchedLabel: 'Somewhat support taking the job with connection to their heritage',
    pair: { valueA: 'Achievement', valueB: 'Tradition' },
    expectedFavored: 'Tradition',
  },
  {
    token: 'stimulation',
    matchedLabel: 'Strongly support taking the job with variety and excitement in their daily work',
    pair: { valueA: 'Achievement', valueB: 'Stimulation' },
    expectedFavored: 'Stimulation',
  },
  {
    token: 'benevolence_dependability',
    matchedLabel: 'Somewhat support taking the job with trust from other people',
    pair: { valueA: 'Achievement', valueB: 'Benevolence_Dependability' },
    expectedFavored: 'Benevolence_Dependability',
  },
  {
    token: 'universalism_nature',
    matchedLabel: 'Somewhat support taking the job with connection to the natural world',
    pair: { valueA: 'Power_Dominance', valueB: 'Universalism_Nature' },
    expectedFavored: 'Universalism_Nature',
  },
  {
    token: 'achievement',
    matchedLabel: 'Strongly support taking the job with recognition of their expertise',
    pair: { valueA: 'Achievement', valueB: 'Benevolence_Dependability' },
    expectedFavored: 'Achievement',
  },
  {
    token: 'hedonism',
    matchedLabel: 'Somewhat support taking the job with enjoyment in their daily experience',
    pair: { valueA: 'Achievement', valueB: 'Hedonism' },
    expectedFavored: 'Hedonism',
  },
];

describe('job-choice-v2 resolves via pairOverride (no definitionSnapshot)', () => {
  it.each(allJobChoiceEntries)(
    'resolves $token via pairOverride without definitionSnapshot',
    ({ matchedLabel, pair, expectedFavored }) => {
      const result = resolveTranscriptDecisionModel({
        decisionMetadata: {
          parseClass: 'exact',
          parsePath: 'text_label_leading',
          parserVersion: 'job-choice-v2',
          matchedLabel,
          responseExcerpt: matchedLabel,
        },
        pairOverride: pair,
        orientationFlipped: false,
      });

      expect(result.canonical.favoredValueKey).toBe(expectedFavored);
      expect(result.canonical.direction).not.toBe('unknown');
      expect(result.canonical.source).toBe('deterministic');
    },
  );
});
