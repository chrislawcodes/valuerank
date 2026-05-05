import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ModelGroupsSection } from '../../src/components/domains/ModelGroupsSection';
import type { ClusterAnalysis } from '../../src/api/operations/domainAnalysis';
import { DOMAIN_ANALYSIS_MODELS } from '../../src/data/domainAnalysisData';

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

const populatedModels = DOMAIN_ANALYSIS_MODELS.slice(0, 2);

describe('ModelGroupsSection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the plain model groups heading without numbering', () => {
    render(<ModelGroupsSection clusterAnalysisByMethod={{ 'log-odds-euclidean-upgma': skippedClusterAnalysis }} models={populatedModels} />);

    expect(screen.getByRole('heading', { name: 'Model Groups' })).toBeInTheDocument();
    expect(screen.getByText(/cluster analysis not available/i)).toBeInTheDocument();
    expect(screen.queryByText(/^1\./i)).not.toBeInTheDocument();
  });

  it('offers group and individual views without heatmap', () => {
    render(<ModelGroupsSection clusterAnalysisByMethod={{ 'log-odds-euclidean-upgma': populatedClusterAnalysis }} models={populatedModels} />);

    expect(screen.getByRole('button', { name: 'Groups' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Individual' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Heatmap' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Individual' }));

    expect(screen.getByRole('button', { name: 'Claude Sonnet 4.5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DeepSeek Chat' })).toBeInTheDocument();
  });

  it('lights up the selected legend item and fades the others', () => {
    const { container } = render(<ModelGroupsSection clusterAnalysisByMethod={{ 'log-odds-euclidean-upgma': populatedClusterAnalysis }} models={populatedModels} />);

    const legendButton = screen.getByRole('button', { name: 'Model A' });
    fireEvent.click(legendButton);

    const activeDot = container.querySelector('[data-value-key="Achievement"][data-cluster-id="cluster-1"]');
    const inactiveDot = container.querySelector('[data-value-key="Achievement"][data-cluster-id="cluster-2"]');
    expect(activeDot).not.toBeNull();
    expect(inactiveDot).not.toBeNull();
    expect(activeDot).toHaveStyle({ opacity: '1' });
    expect(inactiveDot).toHaveStyle({ opacity: '0.2' });
  });

  it('allows multi-select in individual mode', () => {
    const { container } = render(<ModelGroupsSection clusterAnalysisByMethod={{ 'log-odds-euclidean-upgma': populatedClusterAnalysis }} models={populatedModels} />);

    fireEvent.click(screen.getByRole('button', { name: 'Individual' }));

    const firstModel = populatedModels[0];
    const secondModel = populatedModels[1];
    expect(firstModel).toBeDefined();
    expect(secondModel).toBeDefined();

    const firstButton = screen.getByRole('button', { name: firstModel?.label ?? '' });
    const secondButton = screen.getByRole('button', { name: secondModel?.label ?? '' });

    fireEvent.click(firstButton);
    fireEvent.click(secondButton);

    expect(firstButton).toHaveAttribute('aria-pressed', 'true');
    expect(secondButton).toHaveAttribute('aria-pressed', 'true');

    const firstDot = container.querySelector(`[data-value-key="Achievement"][data-cluster-id="${firstModel?.model}"]`);
    const secondDot = container.querySelector(`[data-value-key="Achievement"][data-cluster-id="${secondModel?.model}"]`);
    expect(firstDot).not.toBeNull();
    expect(secondDot).not.toBeNull();
    expect(firstDot as Element).toHaveStyle({ opacity: '1' });
    expect(secondDot as Element).toHaveStyle({ opacity: '1' });
  });

  it('shows a value tooltip with color rows and logit values on bar hover', () => {
    vi.useFakeTimers();

    const { container } = render(<ModelGroupsSection clusterAnalysisByMethod={{ 'log-odds-euclidean-upgma': populatedClusterAnalysis }} models={populatedModels} />);

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
    render(<ModelGroupsSection clusterAnalysisByMethod={{ 'log-odds-euclidean-upgma': populatedClusterAnalysis }} models={populatedModels} />);

    fireEvent.click(screen.getByRole('button', { name: 'Radar' }));

    expect(screen.getByRole('img', { name: /cluster radar chart ordered by favorability with schwartz category ring/i })).toBeInTheDocument();
    expect(screen.getByText('Self-Transcendence')).toBeInTheDocument();
    expect(screen.getByText('Conservation')).toBeInTheDocument();
    expect(screen.getByText('Self-Enhancement')).toBeInTheDocument();
    expect(screen.getByText('Openness to Change')).toBeInTheDocument();
    expect(screen.getByText('Universalism')).toHaveAttribute('text-anchor', 'start');
    expect(screen.queryByText(/Cluster:/i)).not.toBeInTheDocument();
  });
});
