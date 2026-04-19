import { describe, expect, it } from 'vitest';
import { resolveValueKeyFromText } from '../../../src/graphql/queries/domain/decision-model-helpers.js';

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
