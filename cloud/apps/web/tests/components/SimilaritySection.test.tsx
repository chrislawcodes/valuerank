import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SimilaritySection } from '../../src/components/domains/SimilaritySection';
import { VALUES, type ModelEntry, type ValueKey } from '../../src/data/domainAnalysisData';
import type { ClusterAnalysis } from '../../src/api/operations/domainAnalysis';

const skippedClusterAnalysis: ClusterAnalysis = {
  skipped: true,
  skipReason: 'Not enough models',
  defaultPair: null,
  clusters: [],
  faultLinesByPair: {},
};

function buildModel(label: string, offset: number): ModelEntry {
  const values = Object.fromEntries(
    VALUES.map((value, index) => [value, offset + index]),
  ) as Record<ValueKey, number>;

  return {
    model: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    values,
  };
}

describe('SimilaritySection', () => {
  it('uses the visible similarities heading and a hidden matrix caption', () => {
    render(
      <SimilaritySection
        models={[buildModel('Model A', 0), buildModel('Model B', 1)]}
        clusterAnalysis={skippedClusterAnalysis}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Similarities and Differences' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /pairwise similarity matrix/i })).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: /pairwise similarity matrix/i })).toBeInTheDocument();
  });
});
