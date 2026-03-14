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
    expect(result).toContain('In one role, this job offers [achievement]');
    expect(result).toContain('In the other role, this job offers [hedonism]');
  });

  it('includes scale labels derived from value bodies', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS);
    expect(result).toContain(
      '- Strongly support taking the job with [achievement] recognition of their expertise',
    );
    expect(result).toContain(
      '- Strongly support taking the job with [hedonism] enjoyment in their daily experience',
    );
  });

  it('includes the context text at the top', () => {
    const result = assembleTemplate(CONTEXT, COMPONENTS);
    expect(result.startsWith(CONTEXT)).toBe(true);
  });
});
