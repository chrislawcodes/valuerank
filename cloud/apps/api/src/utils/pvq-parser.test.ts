import { describe, expect, it } from 'vitest';
import { parseFullPvqScores } from './pvq-parser.js';

function makeContent(response: string): unknown {
  return { turns: [{ targetResponse: response }] };
}

function cleanResponse(): string {
  return Array.from({ length: 40 }, (_, index) => `Q${index + 1}: ${(index % 6) + 1}`).join('\n');
}

describe('parseFullPvqScores', () => {
  it('extracts a clean 40-question response', () => {
    const result = parseFullPvqScores(makeContent(cleanResponse()));

    expect(result.refused).toBe(false);
    expect(result.parseWarnings).toEqual([]);
    for (let questionNumber = 1; questionNumber <= 40; questionNumber += 1) {
      expect(result.scores[`q${questionNumber}`]).not.toBeNull();
    }
  });

  it('refuses when a question is missing', () => {
    const response = cleanResponse()
      .split('\n')
      .filter((line) => line !== 'Q5: 5')
      .join('\n');
    const result = parseFullPvqScores(makeContent(response));

    expect(result.refused).toBe(true);
    expect(result.scores.q5).toBeNull();
  });

  it('refuses on non-numeric scores', () => {
    const response = cleanResponse().replace('Q3: 3', 'Q3: abc');
    const result = parseFullPvqScores(makeContent(response));

    expect(result.refused).toBe(true);
    expect(result.scores.q3).toBeNull();
  });

  it('refuses on out-of-range, negative, and float values', () => {
    expect(parseFullPvqScores(makeContent(cleanResponse().replace('Q1: 1', 'Q1: 7'))).refused).toBe(true);
    expect(parseFullPvqScores(makeContent(cleanResponse().replace('Q1: 1', 'Q1: 0'))).refused).toBe(true);
    expect(parseFullPvqScores(makeContent(cleanResponse().replace('Q1: 1', 'Q1: -2'))).refused).toBe(true);
    expect(parseFullPvqScores(makeContent(cleanResponse().replace('Q1: 1', 'Q1: 5.0'))).refused).toBe(true);
  });

  it('uses the last duplicate value and records a warning', () => {
    const response = [
      'Q1: 1',
      'Q2: 2',
      'Q3: 3',
      'Q4: 4',
      'Q5: 5',
      'Q6: 6',
      'Q7: 1',
      'Q8: 2',
      'Q8: 6',
      ...Array.from({ length: 32 }, (_, index) => `Q${index + 9}: 4`),
    ].join('\n');

    const result = parseFullPvqScores(makeContent(response));

    expect(result.refused).toBe(false);
    expect(result.scores.q8).toBe(6);
    expect(result.parseWarnings).toContain('Duplicate Q8 detected — used last occurrence');
  });

  it('parses lowercase labels and extra whitespace', () => {
    const response = Array.from({ length: 40 }, (_, index) => `q${index + 1}:  5`).join('\n');
    const result = parseFullPvqScores(makeContent(response));

    expect(result.refused).toBe(false);
    expect(result.scores.q1).toBe(5);
    expect(result.scores.q40).toBe(5);
  });

  it('parses through preamble and postamble text', () => {
    const response = [
      'Preamble text',
      cleanResponse(),
      'Postamble text',
    ].join('\n');
    const result = parseFullPvqScores(makeContent(response));

    expect(result.refused).toBe(false);
    expect(result.scores.q1).toBe(1);
    expect(result.scores.q40).toBe(4);
  });

  it('refuses on null or malformed content', () => {
    const nullResult = parseFullPvqScores(null);
    const badResult = parseFullPvqScores({ turns: [] });

    expect(nullResult.refused).toBe(true);
    expect(nullResult.parseWarnings[0]).toBe('Could not extract response text from transcript content');
    expect(badResult.refused).toBe(true);
    expect(badResult.parseWarnings[0]).toBe('Could not extract response text from transcript content');
  });
});
