import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the plain model groups heading without numbering', () => {
    render(<ModelGroupsSection clusterAnalysis={skippedClusterAnalysis} />);

    expect(screen.getByRole('heading', { name: 'Model Groups' })).toBeInTheDocument();
    expect(screen.getByText(/cluster analysis not available/i)).toBeInTheDocument();
    expect(screen.queryByText(/^1\./i)).not.toBeInTheDocument();
  });

  it('offers a bar view and keeps the legend focused on model names', () => {
    render(<ModelGroupsSection clusterAnalysis={populatedClusterAnalysis} />);

    expect(screen.getByRole('button', { name: 'Bar' })).toBeInTheDocument();
    expect(screen.getByText('-2.50')).toBeInTheDocument();
    expect(screen.getByText('+2.50')).toBeInTheDocument();
    expect(screen.getByText(/Models: Model A/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Bar' }));

    expect(screen.getByText(/Models: Model A/i)).toBeInTheDocument();
    expect(screen.getByText(/Models: Model B/i)).toBeInTheDocument();
  });

  it('shows a value tooltip with color rows and logit values on bar hover', () => {
    vi.useFakeTimers();

    const { container } = render(<ModelGroupsSection clusterAnalysis={populatedClusterAnalysis} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bar' }));

    const targetBar = container.querySelector('[data-value-key="Achievement"][data-cluster-id="cluster-1"]');
    expect(targetBar).not.toBeNull();

    fireEvent.mouseEnter(targetBar as Element);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Achievement');
    expect(tooltip).toHaveTextContent('+1.60');
    expect(tooltip).toHaveTextContent('+0.60');
    expect(tooltip.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);

    fireEvent.mouseLeave(targetBar as Element);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows the Schwartz category ring in radar view', () => {
    render(<ModelGroupsSection clusterAnalysis={populatedClusterAnalysis} />);

    fireEvent.click(screen.getByRole('button', { name: 'Radar' }));

    expect(screen.getByRole('img', { name: /cluster radar chart ordered by favorability with schwartz category ring/i })).toBeInTheDocument();
    expect(screen.getByText('Self-Transcendence')).toBeInTheDocument();
    expect(screen.getByText('Conservation')).toBeInTheDocument();
    expect(screen.getByText('Self-Enhancement')).toBeInTheDocument();
    expect(screen.getByText('Openness to Change')).toBeInTheDocument();
  });
});
