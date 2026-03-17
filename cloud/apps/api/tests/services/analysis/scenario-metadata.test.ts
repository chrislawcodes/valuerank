import { describe, expect, it } from 'vitest';
import {
  buildScenarioAnalysisDimensionRecord,
  normalizeScenarioAnalysisMetadata,
} from '../../../src/services/analysis/scenario-metadata.js';

describe('normalizeScenarioAnalysisMetadata', () => {
  it('normalizes string-valued legacy dimensions', () => {
    const result = normalizeScenarioAnalysisMetadata({
      dimensions: {
        power: '2',
        conformity: '1',
      },
    });

    expect(result).toEqual({
      groupingDimensions: {
        power: '2',
        conformity: '1',
      },
      numericDimensions: {
        power: 2,
        conformity: 1,
      },
      displayDimensions: {
        power: '2',
        conformity: '1',
      },
      sourceFormat: 'dimensions',
    });

    expect(buildScenarioAnalysisDimensionRecord(result)).toEqual({
      conformity: 1,
      power: 2,
    });
  });

  it('normalizes dimension_values without requiring numeric mappings', () => {
    const result = normalizeScenarioAnalysisMetadata({
      dimension_values: {
        autonomy: 'very high',
        risk: 'low',
      },
    });

    expect(result).toEqual({
      groupingDimensions: {
        autonomy: 'very high',
        risk: 'low',
      },
      numericDimensions: {},
      displayDimensions: {
        autonomy: 'very high',
        risk: 'low',
      },
      sourceFormat: 'dimension_values',
    });

    expect(buildScenarioAnalysisDimensionRecord(result)).toEqual({
      autonomy: 'very high',
      risk: 'low',
    });
  });

  it('merges equivalent mixed metadata deterministically', () => {
    const result = normalizeScenarioAnalysisMetadata({
      dimensions: {
        autonomy: 2,
      },
      dimension_values: {
        autonomy: '2',
        risk: 'low',
      },
    });

    expect(result).toEqual({
      groupingDimensions: {
        autonomy: '2',
        risk: 'low',
      },
      numericDimensions: {
        autonomy: 2,
      },
      displayDimensions: {
        autonomy: '2',
        risk: 'low',
      },
      sourceFormat: 'mixed',
    });
  });

  it('returns unavailable for conflicting mixed metadata', () => {
    expect(normalizeScenarioAnalysisMetadata({
      dimensions: {
        autonomy: 2,
      },
      dimension_values: {
        autonomy: 'very high',
      },
    })).toBeNull();
  });
});
