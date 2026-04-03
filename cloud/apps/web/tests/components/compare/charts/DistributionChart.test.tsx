import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  OverlayChart,
  OverlayTooltip,
  SideBySideChart,
  type DecisionData,
  type RunDecisionDistribution,
} from '../../../../src/components/compare/charts/DistributionChart';
import {
  buildDecisionDistributionBuckets,
  getDecisionDistributionChartAriaLabel,
} from '../../../../src/utils/decisionDistributionDisplay';

function createBuckets() {
  return buildDecisionDistributionBuckets({
    '1': 'Strongly support the other value',
    '2': 'Somewhat support the other value',
    '3': 'Neutral',
    '4': 'Somewhat support this value',
    '5': 'Strongly support this value',
  });
}

function createDistributions(): RunDecisionDistribution[] {
  return [
    {
      runId: 'run-1',
      runName: 'Run A',
      counts: {
        opponentStrongly: 2,
        opponentSomewhat: 3,
        neutral: 5,
        somewhat: 1,
        strongly: 0,
      },
    },
    {
      runId: 'run-2',
      runName: 'Run B',
      counts: {
        opponentStrongly: 1,
        opponentSomewhat: 2,
        neutral: 4,
        somewhat: 3,
        strongly: 2,
      },
    },
  ];
}

function createChartData(): DecisionData[] {
  return [
    { decision: 'opponentStrongly', rawCounts: { 'run-1': 2, 'run-2': 1 }, 'run-1': 2, 'run-2': 1 },
    { decision: 'opponentSomewhat', rawCounts: { 'run-1': 3, 'run-2': 2 }, 'run-1': 3, 'run-2': 2 },
    { decision: 'neutral', rawCounts: { 'run-1': 5, 'run-2': 4 }, 'run-1': 5, 'run-2': 4 },
    { decision: 'somewhat', rawCounts: { 'run-1': 1, 'run-2': 3 }, 'run-1': 1, 'run-2': 3 },
    { decision: 'strongly', rawCounts: { 'run-1': 0, 'run-2': 2 }, 'run-1': 0, 'run-2': 2 },
  ];
}

describe('DistributionChart', () => {
  it('uses canonical bucket labels in the overlay tooltip', () => {
    const buckets = createBuckets();

    render(
      <OverlayTooltip
        active
        label={'opponentStrongly'}
        payload={[{ dataKey: 'run-1', value: 2, color: '#14b8a6', payload: { rawCounts: { 'run-1': 10 } } }]}
        runNames={new Map([['run-1', 'Run A']])}
        buckets={buckets}
      />,
    );

    expect(screen.getByText('Decision bucket: Strongly support the other value')).toBeInTheDocument();
    expect(screen.queryByText(/Decision bucket: 1/i)).not.toBeInTheDocument();
    expect(screen.getByText('2% (10)')).toBeInTheDocument();
  });

  it('exposes the canonical bucket ordering on the overlay chart', () => {
    const buckets = createBuckets();
    const distributions = createDistributions();
    const runColors = new Map([
      ['run-1', '#14b8a6'],
      ['run-2', '#f97316'],
    ]);

    render(
      <OverlayChart
        distributions={distributions}
        chartData={createChartData()}
        runColors={runColors}
        buckets={buckets}
      />,
    );

    expect(screen.getByLabelText(getDecisionDistributionChartAriaLabel(buckets))).toBeInTheDocument();
  });

  it('exposes the canonical bucket ordering on the side-by-side chart', () => {
    const buckets = createBuckets();
    const distributions = createDistributions();
    const runColors = new Map([
      ['run-1', '#14b8a6'],
      ['run-2', '#f97316'],
    ]);

    render(
      <SideBySideChart
        distributions={distributions}
        runColors={runColors}
        buckets={buckets}
      />,
    );

    expect(screen.getByLabelText(getDecisionDistributionChartAriaLabel(buckets))).toBeInTheDocument();
    expect(screen.queryByText(/n=/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mean=/i)).not.toBeInTheDocument();
  });
});
