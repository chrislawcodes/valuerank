import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ModelGroupsSection } from '../../src/components/domains/ModelGroupsSection';
import type { ClusterAnalysis, DomainCluster } from '../../src/api/operations/domainAnalysis';
import type { PairwiseKappaMap } from '../../src/components/domains/clusterVisualizationUtils';
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
const agreementModels = DOMAIN_ANALYSIS_MODELS.slice(0, 5);

function buildClusterAnalysis(clusters: DomainCluster[]): ClusterAnalysis {
  return {
    skipped: false,
    skipReason: null,
    defaultPair: null,
    clusters,
    faultLinesByPair: {},
  };
}

function createCluster(
  id: string,
  members: Array<{ model: string; label: string }>,
  centroid: Record<string, number>,
): DomainCluster {
  return {
    id,
    name: '',
    definingValues: [],
    centroid,
    members: members.map((member) => ({
      model: member.model,
      label: member.label,
      silhouetteScore: 0.5,
      isOutlier: false,
      nearestClusterIds: null,
      distancesToNearestClusters: null,
    })),
  };
}

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

function buildPairwiseKappaObjectMap(entries: Array<[string, string, number]>): PairwiseKappaMap {
  const map: PairwiseKappaMap = new Map();

  for (const [leftModelId, rightModelId, kappa] of entries) {
    const entry = {
      kappa,
      confidenceLow: null,
      confidenceHigh: null,
      confidenceIsSymmetric: true,
    };
    if (!map.has(leftModelId)) map.set(leftModelId, new Map());
    if (!map.has(rightModelId)) map.set(rightModelId, new Map());
    map.get(leftModelId)!.set(rightModelId, entry);
    map.get(rightModelId)!.set(leftModelId, entry);
  }

  return map;
}

const agreementClusterAnalysis = buildClusterAnalysis([
  createCluster(
    'cluster-1',
    agreementModels.slice(0, 3).map((model) => ({ model: model.model, label: model.label })),
    { Achievement: 1.6, Benevolence: -0.1, Universalism_Nature: 0.7 },
  ),
  createCluster(
    'cluster-2',
    agreementModels.slice(3, 5).map((model) => ({ model: model.model, label: model.label })),
    { Achievement: 0.6, Benevolence: 1.2, Universalism_Nature: -0.4 },
  ),
]);

const supersetClusterAnalysis = buildClusterAnalysis([
  createCluster(
    'cluster-superset',
    agreementModels.slice(0, 3).map((model) => ({ model: model.model, label: model.label })),
    { Achievement: 0.8, Benevolence: 0.2, Universalism_Nature: 0.4 },
  ),
]);

const noSharedScenarioClusterAnalysis = buildClusterAnalysis([
  createCluster(
    'cluster-no-shared',
    agreementModels.slice(0, 3).map((model) => ({ model: model.model, label: model.label })),
    { Achievement: 0.9, Benevolence: 0.4, Universalism_Nature: 0.2 },
  ),
]);

describe('ModelGroupsSection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the plain model groups heading without numbering', () => {
    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': skippedClusterAnalysis,
          'log-odds-euclidean-ward': skippedClusterAnalysis,
        }}
        models={populatedModels}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Model Clusters' })).toBeInTheDocument();
    expect(screen.getByText(/cluster analysis not available/i)).toBeInTheDocument();
    expect(screen.queryByText(/^1\./i)).not.toBeInTheDocument();
  });

  it('offers group and individual views without heatmap', () => {
    const onClusteringMethodChange = vi.fn();

    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': populatedClusterAnalysis,
          'log-odds-euclidean-ward': populatedClusterAnalysis,
        }}
        models={populatedModels}
        onClusteringMethodChange={onClusteringMethodChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'Groups' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Individual' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Heatmap' })).not.toBeInTheDocument();
    expect(screen.queryByText('Linkage')).toBeNull();
    expect(screen.queryByText('Data')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ward' })).toHaveClass('bg-teal-600');
    expect(screen.getByRole('button', { name: 'UPGMA' })).not.toHaveClass('bg-teal-600');

    fireEvent.click(screen.getByRole('button', { name: 'UPGMA' }));
    expect(onClusteringMethodChange).toHaveBeenCalledWith('upgma');

    fireEvent.click(screen.getByRole('button', { name: 'Individual' }));

    expect(screen.getByRole('button', { name: 'Claude Sonnet 4.5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DeepSeek Chat' })).toBeInTheDocument();
  });

  it('lights up the selected legend item and fades the others', () => {
    const { container } = render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': populatedClusterAnalysis,
          'log-odds-euclidean-ward': populatedClusterAnalysis,
        }}
        models={populatedModels}
      />,
    );

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
    const { container } = render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': populatedClusterAnalysis,
          'log-odds-euclidean-ward': populatedClusterAnalysis,
        }}
        models={populatedModels}
      />,
    );

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

    const { container } = render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': populatedClusterAnalysis,
          'log-odds-euclidean-ward': populatedClusterAnalysis,
        }}
        models={populatedModels}
      />,
    );

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

  it('shows internal agreement values and warning styling for fully covered clusters', () => {
    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': agreementClusterAnalysis,
          'log-odds-euclidean-ward': agreementClusterAnalysis,
        }}
        models={agreementModels}
        pairwiseKappaMap={buildPairwiseKappaObjectMap([
          ['claude-sonnet-4-5', 'deepseek-chat', 0.2],
          ['claude-sonnet-4-5', 'deepseek-reasoner', 0.3],
          ['deepseek-chat', 'deepseek-reasoner', 0.4],
          ['gemini-2.5-flash', 'gemini-2.5-pro', 0.55],
        ])}
        agreementStatus="ready"
      />,
    );

    expect(screen.getByRole('button', {
      name: 'Claude Sonnet 4.5, DeepSeek Chat, DeepSeek Reasoner',
    })).toBeInTheDocument();

    const warningLine = screen.getByLabelText('Internal agreement: +0.30. Low agreement.');
    expect(warningLine).toHaveTextContent('Internal agreement: +0.30');
    expect(warningLine).toHaveClass('text-amber-700');

    const normalLine = screen.getByLabelText('Internal agreement: +0.55');
    expect(normalLine).toHaveTextContent('Internal agreement: +0.55');
    expect(normalLine).toHaveClass('text-gray-500');
  });

  it('shows a singleton placeholder with an explanatory tooltip', () => {
    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': populatedClusterAnalysis,
          'log-odds-euclidean-ward': populatedClusterAnalysis,
        }}
        models={populatedModels}
        pairwiseKappaMap={buildPairwiseKappaMap([
          ['model-a', 'model-b', 0.5],
        ])}
        agreementStatus="ready"
      />,
    );

    const singletonLine = screen.getAllByLabelText(/only one model — no pair to compare/i)[0];
    expect(singletonLine).toHaveTextContent('—');
    expect(singletonLine).toHaveClass('text-gray-500');
  });

  it('shows a placeholder when a cluster includes members outside the current selection', () => {
    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': supersetClusterAnalysis,
          'log-odds-euclidean-ward': supersetClusterAnalysis,
        }}
        models={agreementModels.slice(0, 2)}
        pairwiseKappaMap={buildPairwiseKappaMap([
          ['claude-sonnet-4-5', 'deepseek-chat', 0.2],
          ['claude-sonnet-4-5', 'deepseek-reasoner', 0.3],
          ['deepseek-chat', 'deepseek-reasoner', 0.4],
        ])}
        agreementStatus="ready"
      />,
    );

    const outsideSelectionLine = screen.getByLabelText(/outside the current view/i);
    expect(outsideSelectionLine).toHaveTextContent('—');
    expect(outsideSelectionLine).toHaveClass('text-gray-500');
  });

  it('shows a placeholder when member pairs have no shared scenarios', () => {
    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': noSharedScenarioClusterAnalysis,
          'log-odds-euclidean-ward': noSharedScenarioClusterAnalysis,
        }}
        models={agreementModels.slice(0, 3)}
        pairwiseKappaMap={buildPairwiseKappaMap([
          ['claude-sonnet-4-5', 'deepseek-chat', 0.2],
          ['claude-sonnet-4-5', 'deepseek-reasoner', 0.3],
        ])}
        agreementStatus="ready"
      />,
    );

    const noSharedLine = screen.getByLabelText(/share no scenarios/i);
    expect(noSharedLine).toHaveTextContent('—');
    expect(noSharedLine).toHaveClass('text-gray-500');
  });

  it('shows loading placeholder text while the agreement map is absent', () => {
    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': populatedClusterAnalysis,
          'log-odds-euclidean-ward': populatedClusterAnalysis,
        }}
        models={populatedModels}
        agreementStatus="loading"
      />,
    );

    const loadingLine = screen.getAllByLabelText(/agreement data is loading/i)[0];
    expect(loadingLine).toHaveTextContent('—');
    expect(loadingLine).toHaveClass('text-gray-500');
  });

  it('shows a needs-more-models placeholder while the agreement map is absent', () => {
    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': populatedClusterAnalysis,
          'log-odds-euclidean-ward': populatedClusterAnalysis,
        }}
        models={populatedModels}
        agreementStatus="needs-more-models"
      />,
    );

    const needsMoreModelsLine = screen.getAllByLabelText(/select at least two models to see internal agreement/i)[0];
    expect(needsMoreModelsLine).toHaveTextContent('—');
    expect(needsMoreModelsLine).toHaveClass('text-gray-500');
  });

  it('shows an unavailable placeholder while the agreement map is absent', () => {
    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': populatedClusterAnalysis,
          'log-odds-euclidean-ward': populatedClusterAnalysis,
        }}
        models={populatedModels}
        agreementStatus="unavailable"
      />,
    );

    const unavailableLine = screen.getAllByLabelText(/no agreement data for this view/i)[0];
    expect(unavailableLine).toHaveTextContent('—');
    expect(unavailableLine).toHaveClass('text-gray-500');
  });

  it('does not show the overlay in kappa-agreement mode', () => {
    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'kappa-agreement-euclidean-upgma': agreementClusterAnalysis,
          'kappa-agreement-euclidean-ward': agreementClusterAnalysis,
        }}
        kappaClusterAnalysis={agreementClusterAnalysis}
        models={agreementModels}
        dataSource="kappa-agreement"
        pairwiseKappaMap={buildPairwiseKappaMap([
          ['claude-sonnet-4-5', 'deepseek-chat', 0.2],
          ['claude-sonnet-4-5', 'deepseek-reasoner', 0.3],
          ['deepseek-chat', 'deepseek-reasoner', 0.4],
          ['gemini-2.5-flash', 'gemini-2.5-pro', 0.55],
        ])}
        agreementStatus="ready"
      />,
    );

    expect(screen.queryByLabelText(/internal agreement/i)).not.toBeInTheDocument();
  });

  it('does not show the overlay in individual mode', () => {
    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': agreementClusterAnalysis,
          'log-odds-euclidean-ward': agreementClusterAnalysis,
        }}
        models={agreementModels}
        pairwiseKappaMap={buildPairwiseKappaMap([
          ['claude-sonnet-4-5', 'deepseek-chat', 0.2],
          ['claude-sonnet-4-5', 'deepseek-reasoner', 0.3],
          ['deepseek-chat', 'deepseek-reasoner', 0.4],
          ['gemini-2.5-flash', 'gemini-2.5-pro', 0.55],
        ])}
        agreementStatus="ready"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Individual' }));

    expect(screen.queryByLabelText(/internal agreement/i)).not.toBeInTheDocument();
  });

  it('shows the internal agreement explanation in the help panel', () => {
    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': agreementClusterAnalysis,
          'log-odds-euclidean-ward': agreementClusterAnalysis,
        }}
        models={agreementModels}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show model groups explanation' }));

    expect(screen.getByText(/average Cohen's kappa across the pairs of models in the group/i)).toBeInTheDocument();
    expect(screen.getByText(/currently selected signature/i)).toBeInTheDocument();
    expect(screen.getByText(/below 0.4/i)).toBeInTheDocument();
  });

  it('shows the Schwartz category ring in radar view', () => {
    render(
      <ModelGroupsSection
        clusterAnalysisByMethod={{
          'log-odds-euclidean-upgma': populatedClusterAnalysis,
          'log-odds-euclidean-ward': populatedClusterAnalysis,
        }}
        models={populatedModels}
      />,
    );

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
