import { describe, expect, it } from 'vitest';
import { computePooledWinRate, computeStabilityScore } from '../../../src/graphql/queries/models-analysis-math.js';
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

describe('models-analysis math', () => {
  it('weights pooled win rate by vignette count instead of treating each domain equally', () => {
    const pooled = computePooledWinRate([
      { winRate: 40, evidenceWeight: 1 },
      { winRate: 80, evidenceWeight: 3 },
    ]);

    expect(pooled).toBe(70);
  });

  it('returns null when no eligible vignette-weighted contributions are available', () => {
    expect(computePooledWinRate([
      { winRate: 40, evidenceWeight: 0 },
      { winRate: 80, evidenceWeight: -1 },
    ])).toBeNull();
  });

  it('keeps stability as an unweighted MAD across contributing domains', () => {
    expect(computeStabilityScore([
      { winRate: 40 },
      { winRate: 80 },
    ])).toBe(60);
  });
});
