import { describe, expect, it } from 'vitest';
import { buildAnalysisTranscriptsPath } from '../../src/utils/analysisRouting';

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
});
