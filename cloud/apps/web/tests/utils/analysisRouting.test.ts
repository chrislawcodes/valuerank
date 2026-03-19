import { describe, expect, it } from 'vitest';
import {
  buildAnalysisConditionDetailPath,
  buildAnalysisTranscriptsPath,
  buildConditionKey,
  parseConditionKey,
} from '../../src/utils/analysisRouting';

describe('analysisRouting', () => {
  it('preserves extra search params when building transcript paths', () => {
    const result = buildAnalysisTranscriptsPath(
      '/analysis',
      'run-1',
      new URLSearchParams('tab=overview'),
      new URLSearchParams('mode=paired'),
    );

    expect(result).toBe('/analysis/run-1/transcripts?tab=overview&mode=paired');
  });

  it('omits the query string when no params are provided', () => {
    const result = buildAnalysisTranscriptsPath('/analysis', 'run-1', new URLSearchParams());

    expect(result).toBe('/analysis/run-1/transcripts');
  });

  it('lets extra search params overwrite base params when keys collide', () => {
    const result = buildAnalysisTranscriptsPath(
      '/analysis',
      'run-1',
      new URLSearchParams('model=model-a&tab=overview'),
      new URLSearchParams('model=model-b'),
    );

    expect(result).toBe('/analysis/run-1/transcripts?model=model-b&tab=overview');
  });

  it('builds a condition detail path while preserving extra search params', () => {
    const result = buildAnalysisConditionDetailPath(
      '/analysis',
      'run-1',
      buildConditionKey('High', 'Low'),
      new URLSearchParams('rowDim=Freedom&colDim=Harmony&modelId=model-a'),
      new URLSearchParams('mode=paired'),
    );

    expect(result).toBe(
      '/analysis/run-1/conditions/High%7C%7CLow?rowDim=Freedom&colDim=Harmony&modelId=model-a&mode=paired'
    );
  });

  it('round-trips encoded condition keys', () => {
    const key = buildConditionKey('High', 'Low');

    expect(parseConditionKey(key)).toEqual({ row: 'High', col: 'Low' });
  });
});
