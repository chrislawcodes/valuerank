import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelGroupsSection } from '../../src/components/domains/ModelGroupsSection';
import type { ClusterAnalysis } from '../../src/api/operations/domainAnalysis';

const skippedClusterAnalysis: ClusterAnalysis = {
  skipped: true,
  skipReason: 'Not enough models',
  defaultPair: null,
  clusters: [],
  faultLinesByPair: {},
};

describe('ModelGroupsSection', () => {
  it('renders the plain model groups heading without numbering', () => {
    render(<ModelGroupsSection clusterAnalysis={skippedClusterAnalysis} />);

    expect(screen.getByRole('heading', { name: 'Model Groups' })).toBeInTheDocument();
    expect(screen.getByText(/cluster analysis not available/i)).toBeInTheDocument();
    expect(screen.queryByText(/^1\./i)).not.toBeInTheDocument();
  });
});
