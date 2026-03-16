import { describe, expect, it } from 'vitest';
import { assembleTemplate } from '../assemble-template.js';

const CONTEXT = 'A mid-level professional has been offered two distinct roles.';

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
  it('produces the correct sentence structure', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS);
    expect(result).toContain('In one role, this job offers recognition of their expertise');
    expect(result).toContain('In the other role, this job offers enjoyment in their daily experience');
    expect(result).not.toContain('[achievement]');
    expect(result).not.toContain('[hedonism]');
  });

  it('includes scale labels derived from value bodies without token brackets', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS);
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
    const result = assembleTemplate(CONTEXT, COMPONENTS);
    expect(result.startsWith(CONTEXT)).toBe(true);
  });
});
