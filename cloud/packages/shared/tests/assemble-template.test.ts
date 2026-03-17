import { describe, expect, it } from 'vitest';
import { assembleTemplate } from '../src/assemble-template.js';

const CONTEXT = 'A mid-level professional has been offered two distinct roles.';

// Bodies without [level] — for backward-compat tests (old-style calls)
const COMPONENTS_NO_LEVEL = {
  context_id: 'ctx-1',
  value_first: {
    token: 'achievement',
    body: 'recognition of their expertise because of how it relates to success through strong performance',
  },
  value_second: {
    token: 'hedonism',
    body: 'enjoyment in their daily experience because of how it relates to pleasure and comfort in everyday work',
  },
};

// Bodies with [level] — matches current seed-value-statements.ts format
const COMPONENTS_WITH_LEVEL = {
  context_id: 'ctx-1',
  value_first: {
    token: 'achievement',
    body: '[level] recognition of their expertise because of how it relates to success through strong performance',
  },
  value_second: {
    token: 'hedonism',
    body: '[level] enjoyment in their daily experience because of how it relates to pleasure and comfort in everyday work',
  },
};

describe('assembleTemplate', () => {
  // --- Backward-compatible (no [level] in bodies) ---

  it('produces the correct sentence structure', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS_NO_LEVEL);
    expect(result).toContain('One job offers recognition of their expertise');
    expect(result).toContain('One job offers enjoyment in their daily experience');
    expect(result).not.toContain('[achievement]');
    expect(result).not.toContain('[hedonism]');
  });

  it('includes scale labels derived from value bodies without token brackets', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS_NO_LEVEL);
    expect(result).toContain(
      '- Strongly support taking the job with recognition of their expertise',
    );
    expect(result).toContain(
      '- Strongly support taking the job with enjoyment in their daily experience',
    );
    // Token names must not appear in the scale labels
    expect(result).not.toContain('- Strongly support taking the job with [achievement]');
    expect(result).not.toContain('- Strongly support taking the job with [hedonism]');
  });

  it('includes the context text at the top', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS_NO_LEVEL);
    expect(result.startsWith(CONTEXT)).toBe(true);
  });

  // --- Level substitution (current format with [level] in bodies) ---

  it('substitutes [level] word in narrative when levelWords provided', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS_WITH_LEVEL, {
      first: 'moderate',
      second: 'substantial',
    });
    // Narrative uses the substituted word
    expect(result).toContain('moderate recognition of their expertise');
    expect(result).toContain('substantial enjoyment in their daily experience');
    expect(result).not.toContain('[achievement]');
    expect(result).not.toContain('[hedonism]');
    // [level] token should not appear in output
    expect(result).not.toContain('[level]');
  });

  it('scale labels are stable regardless of level word — [level] is stripped from labels', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS_WITH_LEVEL, {
      first: 'negligible',
      second: 'full',
    });
    // Scale labels must not include the level word or [level]
    expect(result).toContain(
      '- Strongly support taking the job with recognition of their expertise',
    );
    expect(result).toContain(
      '- Strongly support taking the job with enjoyment in their daily experience',
    );
    // Level words appear in narrative sentences but must NOT appear in scale labels
    expect(result).not.toContain('taking the job with negligible');
    expect(result).not.toContain('taking the job with full');
    expect(result).not.toContain('[level]');
  });

  it('leaves [level] in narrative when levelWords not provided (base template mode)', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS_WITH_LEVEL);
    // [level] remains in narrative — base template used for storage
    expect(result).toContain('One job offers [level] recognition of their expertise');
    expect(result).not.toContain('[achievement]');
    // Scale labels still have [level] stripped
    expect(result).toContain(
      '- Strongly support taking the job with recognition of their expertise',
    );
  });
});
