/**
 * ContestedScenariosList Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContestedScenariosList } from '../../../src/components/analysis/ContestedScenariosList';
import type { ContestedScenario } from '../../../src/api/operations/analysis';

function createMockScenarios(count: number = 5): ContestedScenario[] {
  return Array.from({ length: count }, (_, i) => ({
    scenarioId: `scenario-${i + 1}`,
    scenarioName: `Test Scenario ${i + 1}`,
    variance: 0.5 - i * 0.05,
    modelScores: {
      'gpt-4': 0.8 - i * 0.1,
      'claude-3': 0.6 - i * 0.05,
      gemini: 0.4 + i * 0.05,
    },
  }));
}

describe('ContestedScenariosList', () => {
  it('renders scenarios with variance', () => {
    const scenarios = createMockScenarios(3);
    render(<ContestedScenariosList scenarios={scenarios} />);

    expect(screen.getByText('Test Scenario 1')).toBeInTheDocument();
    expect(screen.getByText('Test Scenario 2')).toBeInTheDocument();
    expect(screen.getByText('Test Scenario 3')).toBeInTheDocument();
  });

  it('shows empty state when no scenarios', () => {
    render(<ContestedScenariosList scenarios={[]} />);

    expect(screen.getByText('No Contested Scenarios')).toBeInTheDocument();
    expect(
      screen.getByText(/All scenarios showed consistent responses/)
    ).toBeInTheDocument();
  });

  it('displays model scores for each scenario', () => {
    const scenarios = createMockScenarios(1);
    render(<ContestedScenariosList scenarios={scenarios} />);

    // Scores should be displayed as percentages
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('shows variance values', () => {
    const scenarios: ContestedScenario[] = [
      {
        scenarioId: 's1',
        scenarioName: 'High Variance Scenario',
        variance: 0.456,
        modelScores: { 'gpt-4': 0.9, 'claude-3': 0.3 },
      },
    ];
    render(<ContestedScenariosList scenarios={scenarios} />);

    expect(screen.getByText('0.456')).toBeInTheDocument();
  });

  it('limits displayed scenarios by default', () => {
    const scenarios = createMockScenarios(10);
    render(<ContestedScenariosList scenarios={scenarios} defaultLimit={5} />);

    expect(screen.getByText('Test Scenario 1')).toBeInTheDocument();
    expect(screen.getByText('Test Scenario 5')).toBeInTheDocument();
    expect(screen.queryByText('Test Scenario 6')).not.toBeInTheDocument();
  });

  it('allows changing limit', () => {
    const scenarios = createMockScenarios(10);
    render(<ContestedScenariosList scenarios={scenarios} defaultLimit={5} />);

    fireEvent.change(screen.getByLabelText('Show:'), { target: { value: '10' } });

    expect(screen.getByText('Test Scenario 10')).toBeInTheDocument();
  });

  it('shows "show more" link when more scenarios available', () => {
    const scenarios = createMockScenarios(10);
    render(<ContestedScenariosList scenarios={scenarios} defaultLimit={5} />);

    expect(screen.getByText('5 more scenarios not shown.')).toBeInTheDocument();
    expect(screen.getByText('Show more')).toBeInTheDocument();
  });

  it('calls onScenarioClick when scenario is clicked', () => {
    const scenarios = createMockScenarios(1);
    const onScenarioClick = vi.fn();
    render(
      <ContestedScenariosList
        scenarios={scenarios}
        onScenarioClick={onScenarioClick}
      />
    );

    fireEvent.click(screen.getByText('Test Scenario 1'));

    expect(onScenarioClick).toHaveBeenCalledWith('scenario-1');
  });

  it('shows rank numbers', () => {
    const scenarios = createMockScenarios(3);
    render(<ContestedScenariosList scenarios={scenarios} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows legend for score colors', () => {
    const scenarios = createMockScenarios(1);
    render(<ContestedScenariosList scenarios={scenarios} />);

    expect(screen.getByText('High (80%+)')).toBeInTheDocument();
    expect(screen.getByText('Medium (40-60%)')).toBeInTheDocument();
    expect(screen.getByText('Low (<20%)')).toBeInTheDocument();
  });

  it('truncates long scenario names', () => {
    const longName = 'This is a very long scenario name that should be truncated because it exceeds fifty characters';
    const scenarios: ContestedScenario[] = [
      {
        scenarioId: 's1',
        scenarioName: longName,
        variance: 0.5,
        modelScores: { 'gpt-4': 0.5 },
      },
    ];
    render(<ContestedScenariosList scenarios={scenarios} />);

    // The truncated name (first 47 chars + '...')
    const truncated = `${longName.slice(0, 47)}...`;
    expect(screen.getByText(truncated)).toBeInTheDocument();
  });

  it('shows count summary', () => {
    const scenarios = createMockScenarios(7);
    render(<ContestedScenariosList scenarios={scenarios} defaultLimit={5} />);

    expect(screen.getByText(/Showing top 5 of 7 scenarios/)).toBeInTheDocument();
  });

  it('sets role="button" for clickable scenarios', () => {
    const scenarios = createMockScenarios(1);
    const onScenarioClick = vi.fn();
    render(
      <ContestedScenariosList
        scenarios={scenarios}
        onScenarioClick={onScenarioClick}
      />
    );

    const scenario = screen.getByText('Test Scenario 1').closest('[role="button"]');
    expect(scenario).toBeInTheDocument();
    expect(scenario).toHaveAttribute('tabindex', '0');
  });
});
