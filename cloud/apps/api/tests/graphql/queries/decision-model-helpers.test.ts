import { describe, expect, it } from 'vitest';
import { resolveValueKeyFromText, isCachedWinnerFirstDecision } from '../../../src/graphql/queries/domain/decision-model-helpers.js';

/**
 * Regression tests for {@link resolveValueKeyFromText}.
 *
 * Mirrors the Python `extract_text_label_decision_relaxed` behavior in
 * workers/summarize_text.py — both should tolerate level preset words
 * ("negligible", "minimal", "moderate", "substantial", "full") that some
 * models echo back into level-agnostic scale labels.
 */

const NATIONAL_PRIORITIES_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'freedom in how they live because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'stimulation',
    body: 'variety and excitement in their daily lives because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'security_personal',
    body: 'personal security in everyday life because of how it relates to stability, safety, and predictability',
  },
];

const NATIONAL_PRIORITIES_LABEL_PREFIX = 'the program that provides citizens with';

describe('resolveValueKeyFromText — level-word tolerance', () => {
  it('exact match on canonical label still works', () => {
    const result = resolveValueKeyFromText(
      'Strongly support the program that provides citizens with freedom in how they live',
      NATIONAL_PRIORITIES_VALUE_STATEMENTS,
      NATIONAL_PRIORITIES_LABEL_PREFIX,
    );
    expect(result).toBe('Self_Direction_Action');
  });

  it('strips level word "full" injected by model into the scale label', () => {
    // Reproduces a real Grok 4.1 fast-reasoning failure on the
    // national-priorities domain.
    const result = resolveValueKeyFromText(
      'Strongly support the program that provides citizens with full freedom in how they live',
      NATIONAL_PRIORITIES_VALUE_STATEMENTS,
      NATIONAL_PRIORITIES_LABEL_PREFIX,
    );
    expect(result).toBe('Self_Direction_Action');
  });

  it('strips level word "negligible" injected by model into the scale label', () => {
    const result = resolveValueKeyFromText(
      'Somewhat support the program that provides citizens with negligible variety and excitement in their daily lives',
      NATIONAL_PRIORITIES_VALUE_STATEMENTS,
      NATIONAL_PRIORITIES_LABEL_PREFIX,
    );
    expect(result).toBe('Stimulation');
  });

  it('strips level word "substantial" injected by model into the scale label', () => {
    const result = resolveValueKeyFromText(
      'Strongly support the program that provides citizens with substantial personal security in everyday life',
      NATIONAL_PRIORITIES_VALUE_STATEMENTS,
      NATIONAL_PRIORITIES_LABEL_PREFIX,
    );
    expect(result).toBe('Security_Personal');
  });

  it('returns null when no value statement matches', () => {
    const result = resolveValueKeyFromText(
      'I have no opinion about this question',
      NATIONAL_PRIORITIES_VALUE_STATEMENTS,
      NATIONAL_PRIORITIES_LABEL_PREFIX,
    );
    expect(result).toBeNull();
  });

  it('returns null when valueStatements is empty', () => {
    const result = resolveValueKeyFromText(
      'Strongly support the program that provides citizens with freedom in how they live',
      [],
      NATIONAL_PRIORITIES_LABEL_PREFIX,
    );
    expect(result).toBeNull();
  });
});

describe('resolveValueKeyFromText — possessive pronoun tolerance', () => {
  // software-approach-choice labels use second-person possessives ("your team")
  // but models frequently answer in first person ("my team") or with an
  // article ("the team"). Relaxed filler-word stripping on both sides of the
  // match recovers these.
  const SOFTWARE_APPROACH_VALUE_STATEMENTS = [
    {
      token: 'conformity_interpersonal',
      body: 'harmony with your team and the company because of how it relates to maintaining smooth interactions with teammates and stakeholders',
    },
    {
      token: 'benevolence_dependability',
      body: 'trust from your team because of how it relates to being someone others can rely on to carry through on commitments',
    },
    {
      token: 'achievement',
      body: 'recognition of your expertise because of how it relates to demonstrating success through strong performance',
    },
  ];

  const SOFTWARE_APPROACH_LABEL_PREFIX = 'choosing the approach relating to';

  it('recovers your → my swap (most common failure)', () => {
    const result = resolveValueKeyFromText(
      'Strongly support choosing the approach relating to harmony with my team and the company',
      SOFTWARE_APPROACH_VALUE_STATEMENTS,
      SOFTWARE_APPROACH_LABEL_PREFIX,
    );
    expect(result).toBe('Conformity_Interpersonal');
  });

  it('recovers your → the swap', () => {
    const result = resolveValueKeyFromText(
      'Strongly support choosing the approach relating to trust from the team',
      SOFTWARE_APPROACH_VALUE_STATEMENTS,
      SOFTWARE_APPROACH_LABEL_PREFIX,
    );
    expect(result).toBe('Benevolence_Dependability');
  });

  it('recovers swap combined with a level word in the text', () => {
    const result = resolveValueKeyFromText(
      'Strongly support choosing the approach relating to substantial recognition of my expertise',
      SOFTWARE_APPROACH_VALUE_STATEMENTS,
      SOFTWARE_APPROACH_LABEL_PREFIX,
    );
    expect(result).toBe('Achievement');
  });

  it('still returns null when no value statement is referenced', () => {
    const result = resolveValueKeyFromText(
      'I prefer the approach that maximizes personal autonomy',
      SOFTWARE_APPROACH_VALUE_STATEMENTS,
      SOFTWARE_APPROACH_LABEL_PREFIX,
    );
    expect(result).toBeNull();
  });
});

describe('isCachedWinnerFirstDecision — cacheVersion 2 only', () => {
  // The remove-decisionCode migration migrated every v1 row to v2; the
  // tolerance bridge has been removed and the validator now rejects v1.

  it('rejects cacheVersion 1 + resolved strong (legacy shape no longer accepted)', () => {
    const result = isCachedWinnerFirstDecision({
      cacheVersion: 1,
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Self_Direction_Action',
    });
    expect(result).toBe(false);
  });

  it('accepts cacheVersion 2 + resolved strong', () => {
    const result = isCachedWinnerFirstDecision({
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Self_Direction_Action',
    });
    expect(result).toBe(true);
  });

  it('accepts cacheVersion 2 + refusal (the new semantic state)', () => {
    const result = isCachedWinnerFirstDecision({
      cacheVersion: 2,
      decisionState: 'refusal',
      strength: 'unknown',
      favoredValueKey: null,
    });
    expect(result).toBe(true);
  });

  it('rejects cacheVersion 1 + refusal (legacy shape no longer accepted)', () => {
    const result = isCachedWinnerFirstDecision({
      cacheVersion: 1,
      decisionState: 'refusal',
      strength: 'unknown',
      favoredValueKey: null,
    });
    expect(result).toBe(false);
  });

  it('rejects cacheVersion 3 (future version protection)', () => {
    const result = isCachedWinnerFirstDecision({
      cacheVersion: 3,
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: 'Self_Direction_Action',
    });
    expect(result).toBe(false);
  });

  it('rejects invalid decisionState even on cacheVersion 2', () => {
    const result = isCachedWinnerFirstDecision({
      cacheVersion: 2,
      decisionState: 'bogus',
      strength: 'unknown',
      favoredValueKey: null,
    });
    expect(result).toBe(false);
  });

  it('rejects refusal with a non-null favoredValueKey', () => {
    const result = isCachedWinnerFirstDecision({
      cacheVersion: 2,
      decisionState: 'refusal',
      strength: 'unknown',
      favoredValueKey: 'Self_Direction_Action',
    });
    expect(result).toBe(false);
  });

  it('rejects refusal with strength other than unknown', () => {
    const result = isCachedWinnerFirstDecision({
      cacheVersion: 2,
      decisionState: 'refusal',
      strength: 'strong',
      favoredValueKey: null,
    });
    expect(result).toBe(false);
  });

  it('rejects resolved with null favoredValueKey (existing invariant preserved)', () => {
    const result = isCachedWinnerFirstDecision({
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: null,
    });
    expect(result).toBe(false);
  });
});
