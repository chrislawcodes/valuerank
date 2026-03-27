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
      counts: { 1: 2, 2: 3, 3: 5, 4: 1, 5: 0 },
      total: 11,
      mean: 2.91,
    },
    {
      runId: 'run-2',
      runName: 'Run B',
      counts: { 1: 1, 2: 2, 3: 4, 4: 3, 5: 2 },
      total: 12,
      mean: 3.42,
    },
  ];
}

function createChartData(): DecisionData[] {
  return [
    { decision: 1, 'run-1': 2, 'run-2': 1 },
    { decision: 2, 'run-1': 3, 'run-2': 2 },
    { decision: 3, 'run-1': 5, 'run-2': 4 },
    { decision: 4, 'run-1': 1, 'run-2': 3 },
    { decision: 5, 'run-1': 0, 'run-2': 2 },
  ];
}

describe('DistributionChart', () => {
  it('uses canonical bucket labels in the overlay tooltip', () => {
    const buckets = createBuckets();

    render(
      <OverlayTooltip
        active
        label={1}
        payload={[{ dataKey: 'run-1', value: 2, color: '#14b8a6' }]}
        runNames={new Map([['run-1', 'Run A']])}
        buckets={buckets}
      />,
    );

    expect(screen.getByText('Decision bucket: Strongly support the other value')).toBeInTheDocument();
    expect(screen.queryByText(/Decision 1/i)).not.toBeInTheDocument();
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
  });
});
