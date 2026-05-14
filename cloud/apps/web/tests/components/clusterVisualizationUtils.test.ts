import { describe, expect, it } from 'vitest';
import { meanInternalKappa } from '../../src/components/domains/clusterVisualizationUtils';
import type { PairwiseKappaMap } from '../../src/components/domains/clusterVisualizationUtils';

function buildPairwiseKappaMap(entries: Array<[string, string, number]>): PairwiseKappaMap {
  const map: PairwiseKappaMap = new Map();

  for (const [leftModelId, rightModelId, kappa] of entries) {
    if (!map.has(leftModelId)) map.set(leftModelId, new Map());
    if (!map.has(rightModelId)) map.set(rightModelId, new Map());
    map.get(leftModelId)!.set(rightModelId, kappa);
    map.get(rightModelId)!.set(leftModelId, kappa);
  }

  return map;
}

describe('meanInternalKappa', () => {
  it('computes the mean over all member pairs when every pair is present', () => {
    const result = meanInternalKappa(
      ['model-a', 'model-b', 'model-c'],
      new Set(['model-a', 'model-b', 'model-c']),
      buildPairwiseKappaMap([
        ['model-a', 'model-b', 0.2],
        ['model-a', 'model-c', 0.4],
        ['model-b', 'model-c', 0.6],
      ]),
    );

    expect(result.kind).toBe('value');
    if (result.kind === 'value') {
      expect(result.mean).toBeCloseTo(0.4, 10);
    }
  });

  it('returns singleton when the cluster has one member', () => {
    const result = meanInternalKappa(['model-a'], new Set(['model-a']), new Map());

    expect(result).toEqual({ kind: 'not-computable', reason: 'singleton' });
  });

  it('returns members-outside-selection when a member is missing from the visible set', () => {
    const result = meanInternalKappa(
      ['model-a', 'model-b'],
      new Set(['model-a']),
      buildPairwiseKappaMap([
        ['model-a', 'model-b', 0.5],
      ]),
    );

    expect(result).toEqual({ kind: 'not-computable', reason: 'members-outside-selection' });
  });

  it('returns no-shared-scenarios when any member pair has no computable kappa', () => {
    const result = meanInternalKappa(
      ['model-a', 'model-b', 'model-c'],
      new Set(['model-a', 'model-b', 'model-c']),
      buildPairwiseKappaMap([
        ['model-a', 'model-b', 0.2],
        ['model-a', 'model-c', 0.4],
      ]),
    );

    expect(result).toEqual({ kind: 'not-computable', reason: 'no-shared-scenarios' });
  });

  it('prefers singleton over members-outside-selection', () => {
    const result = meanInternalKappa(['model-a'], new Set(), new Map());

    expect(result).toEqual({ kind: 'not-computable', reason: 'singleton' });
  });

  it('prefers members-outside-selection over no-shared-scenarios', () => {
    const result = meanInternalKappa(
      ['model-a', 'model-b', 'model-c'],
      new Set(['model-a', 'model-b']),
      buildPairwiseKappaMap([
        ['model-a', 'model-b', 0.2],
        ['model-a', 'model-c', 0.4],
      ]),
    );

    expect(result).toEqual({ kind: 'not-computable', reason: 'members-outside-selection' });
  });
});
