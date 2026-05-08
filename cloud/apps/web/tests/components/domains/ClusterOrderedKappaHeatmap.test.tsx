import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClusterOrderedKappaHeatmap, type KappaPairInput } from '../../../src/components/domains/ClusterOrderedKappaHeatmap';

// Minimal 3-model test data
const leafOrder = ['m1', 'm2', 'm3'];
const modelLabels: Record<string, string> = {
  m1: 'Alpha',
  m2: 'Beta',
  m3: 'Gamma',
};
const clusterIdByModelId: Record<string, string> = {
  m1: 'cluster-1',
  m2: 'cluster-1',
  m3: 'cluster-2',
};
const kappaPairs: KappaPairInput[] = [
  { modelAId: 'm1', modelBId: 'm2', kappa: 0.8 },
  { modelAId: 'm1', modelBId: 'm3', kappa: 0.1 },
  { modelAId: 'm2', modelBId: 'm3', kappa: 0.15 },
];

describe('ClusterOrderedKappaHeatmap', () => {
  it('renders an SVG with the expected aria label', () => {
    render(
      <ClusterOrderedKappaHeatmap
        leafOrder={leafOrder}
        modelLabels={modelLabels}
        kappaPairs={kappaPairs}
        clusterIdByModelId={clusterIdByModelId}
      />,
    );
    expect(screen.getByRole('img', { name: /kappa heatmap/i })).toBeInTheDocument();
  });

  it('renders a label for each model', () => {
    render(
      <ClusterOrderedKappaHeatmap
        leafOrder={leafOrder}
        modelLabels={modelLabels}
        kappaPairs={kappaPairs}
        clusterIdByModelId={clusterIdByModelId}
      />,
    );
    // Each model has a row label and a column label → 2 appearances each
    for (const label of Object.values(modelLabels)) {
      const elements = screen.getAllByText(label);
      expect(elements.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('renders N×N grid cells (rects)', () => {
    const n = leafOrder.length;
    const { container } = render(
      <ClusterOrderedKappaHeatmap
        leafOrder={leafOrder}
        modelLabels={modelLabels}
        kappaPairs={kappaPairs}
        clusterIdByModelId={clusterIdByModelId}
      />,
    );
    // All cell rects are inside a <g> transform; cluster boundary rects are separate
    // We count only the inner grid rects: exactly N*N of them
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // Spot-check: there are at least n*n rects inside the grid group
    const allRects = container.querySelectorAll('rect');
    // n*n cell rects + boundary rects (one per cluster block)
    const minExpected = n * n;
    expect(allRects.length).toBeGreaterThanOrEqual(minExpected);
  });

  it('renders cluster boundary boxes (teal outline rects)', () => {
    const { container } = render(
      <ClusterOrderedKappaHeatmap
        leafOrder={leafOrder}
        modelLabels={modelLabels}
        kappaPairs={kappaPairs}
        clusterIdByModelId={clusterIdByModelId}
      />,
    );
    // Boundary rects have stroke="#0d9488" (teal-600) and fill="none"
    const boundaryRects = container.querySelectorAll('rect[fill="none"]');
    // 2 cluster blocks → 2 boundary rects
    expect(boundaryRects.length).toBe(2);
  });

  it('renders a fallback when leafOrder is empty', () => {
    render(
      <ClusterOrderedKappaHeatmap
        leafOrder={[]}
        modelLabels={{}}
        kappaPairs={[]}
        clusterIdByModelId={{}}
      />,
    );
    expect(screen.getByText(/no kappa data/i)).toBeInTheDocument();
  });
});
