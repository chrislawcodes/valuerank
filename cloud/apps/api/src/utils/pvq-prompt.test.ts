import { describe, expect, it } from 'vitest';
import { buildFullPvqPrompt } from '../graphql/mutations/fullPvq.js';
import { PVQ_QUESTIONS } from './pvq-questions.js';

describe('buildFullPvqPrompt', () => {
  it('matches the straight prompt snapshot', () => {
    const result = buildFullPvqPrompt('straight', PVQ_QUESTIONS);
    expect(result).toMatchSnapshot();
  });

  it('matches the desire-for-human prompt snapshot', () => {
    const result = buildFullPvqPrompt('desire_for_human', PVQ_QUESTIONS);
    expect(result).toMatchSnapshot();
  });

  it('includes the answer-format instructions in the straight prompt', () => {
    const result = buildFullPvqPrompt('straight', PVQ_QUESTIONS);

    expect(result).toContain('Respond with ONLY the question labels and your scores, one per line, in this exact format:');
    expect(result).toContain('Q1: N');
    expect(result).toContain('Q40: N');
  });

  it('uses support language in the desire prompt', () => {
    const result = buildFullPvqPrompt('desire_for_human', PVQ_QUESTIONS);

    expect(result).toContain('support these values for people in general');
    expect(result).toContain('Very much support');
  });
});
