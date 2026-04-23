import { describe, expect, it } from 'vitest';
import { selectModelsAnalysisSnapshots } from '../../../src/graphql/queries/models-analysis-snapshot-selection.js';

type Snapshot = {
  id: string;
  assumptionKey: string;
  configSignature: string;
};

function snapshot(id: string, assumptionKey: string, configSignature: string): Snapshot {
  return { id, assumptionKey, configSignature };
}

describe('selectModelsAnalysisSnapshots', () => {
  it('prefers the latest default-temperature snapshot over a newer t=0 snapshot', () => {
    const selected = selectModelsAnalysisSnapshots([
      snapshot('new-t0', 'domain-analysis:job-choice', 'vnewt0'),
      snapshot('older-default', 'domain-analysis:job-choice', 'vnewtd'),
    ], null);

    expect(selected).toEqual([
      snapshot('older-default', 'domain-analysis:job-choice', 'vnewtd'),
    ]);
  });

  it('keeps the latest snapshot when a concrete signature was requested', () => {
    const selected = selectModelsAnalysisSnapshots([
      snapshot('new-default', 'domain-analysis:job-choice', 'vnewtd'),
      snapshot('older-default', 'domain-analysis:job-choice', 'vnewtd'),
    ], 'vnewtd');

    expect(selected).toEqual([
      snapshot('new-default', 'domain-analysis:job-choice', 'vnewtd'),
    ]);
  });

  it('does not treat the all-domains aggregate snapshot as a report column', () => {
    const selected = selectModelsAnalysisSnapshots([
      snapshot('all-domains', 'domain-analysis:all-domains', 'vnewt0'),
      snapshot('job-choice', 'domain-analysis:job-choice', 'vnewt0'),
    ], null);

    expect(selected).toEqual([
      snapshot('job-choice', 'domain-analysis:job-choice', 'vnewt0'),
    ]);
  });
});
