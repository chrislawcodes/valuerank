import { describe, expect, it } from 'vitest';
import { countAnalyzedTranscripts, getCacheStatusCopy } from '../../src/utils/domainAnalysisUtils';

describe('domainAnalysisUtils', () => {
  const models = [
    {
      model: 'model-a',
      values: [{ totalComparisons: 100000 }],
    },
    {
      model: 'model-b',
      values: [{ totalComparisons: 100000 }],
    },
  ];

  it('counts only the selected models when a selection is provided', () => {
    expect(countAnalyzedTranscripts(models, ['model-a'])).toBe(50000);
  });

  it('treats an empty selection as no models selected', () => {
    expect(countAnalyzedTranscripts(models, [])).toBe(0);
  });

  it('formats transcript counts with commas in cache status copy', () => {
    const copy = getCacheStatusCopy('FRESH', '2026-05-05T12:00:00.000Z', 100000);

    expect(copy?.detail).toContain('100,000 transcripts analyzed.');
  });
});
