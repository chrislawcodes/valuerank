import userEvent from '@testing-library/user-event';
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

const populatedClusterAnalysis: ClusterAnalysis = {
  skipped: false,
  skipReason: null,
  defaultPair: null,
  clusters: [
    {
      id: 'cluster-1',
      name: '',
      definingValues: [],
      centroid: {
        Achievement: 1.6,
        Benevolence: -0.1,
        Universalism_Nature: 0.7,
      },
      members: [
        {
          model: 'model-a',
          label: 'Model A',
          silhouetteScore: 0.52,
          isOutlier: false,
          nearestClusterIds: null,
          distancesToNearestClusters: null,
        },
      ],
    },
    {
      id: 'cluster-2',
      name: '',
      definingValues: [],
      centroid: {
        Achievement: 0.6,
        Benevolence: 1.2,
        Universalism_Nature: -0.4,
      },
      members: [
        {
          model: 'model-b',
          label: 'Model B',
          silhouetteScore: 0.41,
          isOutlier: false,
          nearestClusterIds: null,
          distancesToNearestClusters: null,
        },
      ],
    },
  ],
  faultLinesByPair: {},
};

describe('ModelGroupsSection', () => {
  it('renders the plain model groups heading without numbering', () => {
    render(<ModelGroupsSection clusterAnalysis={skippedClusterAnalysis} />);

    expect(screen.getByRole('heading', { name: 'Model Groups' })).toBeInTheDocument();
    expect(screen.getByText(/cluster analysis not available/i)).toBeInTheDocument();
    expect(screen.queryByText(/^1\./i)).not.toBeInTheDocument();
  });

  it('offers a bar view and keeps the legend focused on model names', async () => {
    const user = userEvent.setup();

    render(<ModelGroupsSection clusterAnalysis={populatedClusterAnalysis} />);

    expect(screen.getByRole('button', { name: 'Bar' })).toBeInTheDocument();
    expect(screen.getByText('-2.50')).toBeInTheDocument();
    expect(screen.getByText('+2.50')).toBeInTheDocument();
    expect(screen.getByText(/Models: Model A/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bar' }));

    expect(screen.getByText(/Models: Model A/i)).toBeInTheDocument();
    expect(screen.getByText(/Models: Model B/i)).toBeInTheDocument();
  });
});
