import { describe, it, expect } from 'vitest';
import {
  extractScaleLine,
  replaceScaleLine,
  deriveScaleFlippedContent,
  derivePresentationFlippedContent,
} from '../backfill-2x2-order-effect-pairs.js';

const MOCK_SOURCE_PROMPT = `Scenario: A vs B.
1 = Attribute A is prioritized
2 = Slightly A
3 = Neutral
4 = Slightly B
5 = Attribute B is prioritized`;

const MOCK_FLIPPED_PROMPT = `Scenario: B vs A.
1 = Attribute B is prioritized
2 = Slightly B
3 = Neutral
4 = Slightly A
5 = Attribute A is prioritized`;

describe('extractScaleLine', () => {
  it('extracts "1 = X" correctly', () => {
    expect(extractScaleLine(MOCK_SOURCE_PROMPT, 1)).toBe('1 = Attribute A is prioritized');
  });
  it('extracts "5 = Y" correctly', () => {
    expect(extractScaleLine(MOCK_SOURCE_PROMPT, 5)).toBe('5 = Attribute B is prioritized');
  });
  it('returns null when not found', () => {
    expect(extractScaleLine('no numbers', 1)).toBeNull();
  });
});

describe('replaceScaleLine', () => {
  it('replaces "1 = X" without touching "5 = Y"', () => {
    const result = replaceScaleLine(MOCK_SOURCE_PROMPT, 1, '1 = NEW');
    expect(result).toContain('1 = NEW');
    expect(result).not.toContain('1 = Attribute A');
    expect(result).toContain('5 = Attribute B is prioritized');
  });
});

describe('deriveScaleFlippedContent', () => {
  it('uses source narrative, injects flipped scale lines', () => {
    const source = { prompt: MOCK_SOURCE_PROMPT, dimension_values: { x: 'A' } };
    const result = deriveScaleFlippedContent(source, '1 = Attribute B is prioritized', '5 = Attribute A is prioritized');
    expect(result.prompt).toContain('Scenario: A vs B');
    expect(result.prompt).toContain('1 = Attribute B is prioritized');
    expect(result.prompt).toContain('5 = Attribute A is prioritized');
    expect(result.dimension_values.x).toBe('A');
  });
});

describe('derivePresentationFlippedContent', () => {
  it('uses flipped narrative, injects source scale lines', () => {
    const flipped = { prompt: MOCK_FLIPPED_PROMPT, dimension_values: { x: 'B' } };
    const result = derivePresentationFlippedContent(flipped, '1 = Attribute A is prioritized', '5 = Attribute B is prioritized');
    expect(result.prompt).toContain('Scenario: B vs A');
    expect(result.prompt).toContain('1 = Attribute A is prioritized');
    expect(result.prompt).toContain('5 = Attribute B is prioritized');
    expect(result.dimension_values.x).toBe('B');
  });
});
