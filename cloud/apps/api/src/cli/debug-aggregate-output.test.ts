import { describe, expect, it } from 'vitest';
import { parseAggregateOutput } from './debug-aggregate-output.js';

describe('debug-aggregate-output parseAggregateOutput', () => {
  it('returns null for non-objects', () => {
    expect(parseAggregateOutput(null)).toBeNull();
    expect(parseAggregateOutput('nope')).toBeNull();
  });

  it('extracts scenarioDimensions when present', () => {
    const output = {
      visualizationData: {
        scenarioDimensions: {
          scenario_1: { a: 1, b: 'x' },
        },
      },
    };
    expect(parseAggregateOutput(output)).toEqual({
      visualizationData: {
        scenarioDimensions: {
          scenario_1: { a: 1, b: 'x' },
        },
      },
    });
  });
});
