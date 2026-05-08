import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClusterDendrogram, type DendrogramMerge } from '../../../src/components/domains/ClusterDendrogram';

// Minimal test data: 4 models with 3 merges
const leafOrder = ['m1', 'm2', 'm3', 'm4'];
const modelLabels: Record<string, string> = {
  m1: 'Model 1',
  m2: 'Model 2',
  m3: 'Model 3',
  m4: 'Model 4',
};
const clusterIdByModelId: Record<string, string> = {
  m1: 'cluster-1',
  m2: 'cluster-1',
  m3: 'cluster-2',
  m4: 'cluster-2',
};
const merges: DendrogramMerge[] = [
  { leftMemberIds: ['m1'], rightMemberIds: ['m2'], height: 0.1 },
  { leftMemberIds: ['m3'], rightMemberIds: ['m4'], height: 0.15 },
  { leftMemberIds: ['m1', 'm2'], rightMemberIds: ['m3', 'm4'], height: 0.5 },
];

describe('ClusterDendrogram', () => {
  it('renders an SVG with the expected aria label', () => {
    render(
      <ClusterDendrogram
        merges={merges}
        leafOrder={leafOrder}
        modelLabels={modelLabels}
        clusterIdByModelId={clusterIdByModelId}
      />,
    );
    expect(screen.getByRole('img', { name: /cluster dendrogram/i })).toBeInTheDocument();
  });

  it('renders a leaf label for each model', () => {
    render(
      <ClusterDendrogram
        merges={merges}
        leafOrder={leafOrder}
        modelLabels={modelLabels}
        clusterIdByModelId={clusterIdByModelId}
      />,
    );
    for (const label of Object.values(modelLabels)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders N-1 internal node connectors (polylines)', () => {
    const { container } = render(
      <ClusterDendrogram
        merges={merges}
        leafOrder={leafOrder}
        modelLabels={modelLabels}
        clusterIdByModelId={clusterIdByModelId}
      />,
    );
    // Each merge produces 1 polyline (left child) + 1 line (right child descent)
    const polylines = container.querySelectorAll('polyline');
    // N-1 = 3 merges → 3 polylines (one per merge for the left child connector)
    expect(polylines.length).toBe(merges.length);
  });

  it('renders a fallback when merges is empty', () => {
    render(
      <ClusterDendrogram
        merges={[]}
        leafOrder={leafOrder}
        modelLabels={modelLabels}
        clusterIdByModelId={clusterIdByModelId}
      />,
    );
    expect(screen.getByText(/no dendrogram data/i)).toBeInTheDocument();
  });

  it('renders a cut line when cutLineHeight is provided', () => {
    const { container } = render(
      <ClusterDendrogram
        merges={merges}
        leafOrder={leafOrder}
        modelLabels={modelLabels}
        clusterIdByModelId={clusterIdByModelId}
        cutLineHeight={0.3}
      />,
    );
    // Cut line is a dashed line with stroke-dasharray
    const dashedLines = container.querySelectorAll('line[stroke-dasharray]');
    expect(dashedLines.length).toBeGreaterThanOrEqual(1);
  });
});
