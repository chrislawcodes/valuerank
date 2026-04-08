import { describe, expect, it } from 'vitest';
import { assembleTemplate } from '../src/assemble-template.js';

const CONTEXT = 'A mid-level professional has been offered two distinct roles.';

// Bodies without [level] — the canonical format going forward.
// [level] lives in sentencePrefix, not in value statement bodies.
const COMPONENTS = {
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

describe('assembleTemplate', () => {
  // --- Default prefix (includes [level]) ---

  it('produces the correct sentence structure with default prefix', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS);
    // Default prefix is "One job offers [level]" — without levelWords, [level] stays
    expect(result).toContain('One job offers [level] recognition of their expertise');
    expect(result).toContain('One job offers [level] enjoyment in their daily experience');
  });

  it('substitutes [level] in prefix when levelWords provided', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS, {
      first: 'moderate',
      second: 'substantial',
    });
    expect(result).toContain('One job offers moderate recognition of their expertise');
    expect(result).toContain('One job offers substantial enjoyment in their daily experience');
    expect(result).not.toContain('[level]');
  });

  it('scale labels are stable regardless of level word', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS, {
      first: 'negligible',
      second: 'full',
    });
    expect(result).toContain(
      '- Strongly support taking the job with recognition of their expertise',
    );
    expect(result).toContain(
      '- Strongly support taking the job with enjoyment in their daily experience',
    );
    // Level words appear in narrative sentences but NOT in scale labels
    expect(result).not.toContain('taking the job with negligible');
    expect(result).not.toContain('taking the job with full');
  });

  it('includes the context text at the top', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS);
    expect(result.startsWith(CONTEXT)).toBe(true);
  });

  // --- Custom prefix (domain-specific) ---

  it('uses custom sentencePrefix with [level] substitution', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS, {
      first: 'full',
      second: 'negligible',
    }, {
      sentencePrefix: 'One approach provides [level]',
      labelPrefix: 'choosing the approach relating to',
    });
    expect(result).toContain('One approach provides full recognition of their expertise');
    expect(result).toContain('One approach provides negligible enjoyment in their daily experience');
    expect(result).toContain(
      '- Strongly support choosing the approach relating to recognition of their expertise',
    );
    expect(result).not.toContain('[level]');
  });

  it('handles prefix without [level] (backward compat)', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS, {
      first: 'full',
      second: 'negligible',
    }, {
      sentencePrefix: 'One job offers',
    });
    // No [level] in prefix means level words don't appear — prefix is used as-is
    expect(result).toContain('One job offers recognition of their expertise');
    expect(result).toContain('One job offers enjoyment in their daily experience');
  });

  // --- Backward compatibility: bodies with [level] (legacy data) ---

  it('labelFromBody defensively strips [level] from legacy bodies', () => {
    const legacyComponents = {
      context_id: 'ctx-1',
      value_first: {
        token: 'achievement',
        body: '[level] recognition of their expertise because of how it relates to success',
      },
      value_second: {
        token: 'hedonism',
        body: '[level] enjoyment because of how it relates to pleasure',
      },
    };
    const result = assembleTemplate(CONTEXT, legacyComponents);
    // Scale labels should NOT contain [level]
    expect(result).toContain(
      '- Strongly support taking the job with recognition of their expertise',
    );
    expect(result).not.toContain('taking the job with [level]');
  });
});
