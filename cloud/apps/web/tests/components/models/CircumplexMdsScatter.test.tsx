import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CircumplexResult } from '../../../src/api/operations/circumplex';
import { CircumplexMdsScatter } from '../../../src/components/models/CircumplexMdsScatter';
import type { ValueKey } from '../../../src/data/domainAnalysisData';

function buildResult(modelId: string, modelLabel: string, shift: number): CircumplexResult {
  const valueOrder: ValueKey[] = [
    'Self_Direction_Action',
    'Universalism_Nature',
    'Benevolence_Dependability',
  ];

  return {
    modelId,
    modelLabel,
    providerName: 'openai',
    signature: 'vnewtd',
    valueOrder,
    profileCorrelationMatrix: [],
    pairTrialCounts: [],
    excludedValues: [],
    spearmanRho: 0.72,
    spearmanP: 0.01,
    verdictBand: 'clear',
    mds2d: [
      { valueKey: 'Self_Direction_Action', x: 0 + shift, y: 0.9, theoreticalAngleDeg: 90 },
      { valueKey: 'Universalism_Nature', x: 0.75 + shift, y: -0.1, theoreticalAngleDeg: 18 },
      { valueKey: 'Benevolence_Dependability', x: -0.6 + shift, y: -0.5, theoreticalAngleDeg: -54 },
    ],
    mdsStress: 0.12,
    mdsWarning: null,
    trialsPerValue: [],
  } as unknown as CircumplexResult;
}

describe('CircumplexMdsScatter', () => {
  it('renders the theoretical circle and overlays multiple selected models', () => {
    render(
      <CircumplexMdsScatter
        results={[
          buildResult('model-a', 'Model A', 0),
          buildResult('model-b', 'Model B', 0.12),
        ]}
      />,
    );

    expect(screen.getByTestId('circumplex-overlay-chart')).toBeInTheDocument();
    expect(screen.getByText('Classical MDS overlay')).toBeInTheDocument();
    expect(screen.getByText('Model A')).toBeInTheDocument();
    expect(screen.getByText('Model B')).toBeInTheDocument();
    expect(screen.getByText('Self-Direction')).toBeInTheDocument();
    expect(screen.getByText('Universalism')).toBeInTheDocument();
  });
});
