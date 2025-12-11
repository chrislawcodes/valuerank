/**
 * CostBreakdown Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CostBreakdown, formatCost } from '../../../src/components/runs/CostBreakdown';
import type { CostEstimate, ModelCostEstimate } from '../../../src/api/operations/costs';

// Helper to create mock model cost estimate
function createModelCost(overrides: Partial<ModelCostEstimate> = {}): ModelCostEstimate {
  return {
    modelId: 'openai:gpt-4o',
    displayName: 'GPT-4o',
    inputTokens: 1000,
    outputTokens: 500,
    inputCost: 0.01,
    outputCost: 0.02,
    totalCost: 0.03,
    avgInputPerProbe: 500,
    avgOutputPerProbe: 250,
    sampleCount: 10,
    isUsingFallback: false,
    ...overrides,
  };
}

// Helper to create mock cost estimate
function createCostEstimate(overrides: Partial<CostEstimate> = {}): CostEstimate {
  return {
    total: 0.15,
    scenarioCount: 10,
    basedOnSampleCount: 100,
    perModel: [createModelCost()],
    isUsingFallback: false,
    fallbackReason: null,
    ...overrides,
  };
}

describe('CostBreakdown', () => {
  describe('loading state', () => {
    it('renders loading indicator', () => {
      render(<CostBreakdown costEstimate={null} loading />);
      expect(screen.getByText('Calculating cost estimate...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('renders error message', () => {
      const error = new Error('Failed to fetch');
      render(<CostBreakdown costEstimate={null} error={error} />);
      expect(screen.getByText('Failed to estimate cost: Failed to fetch')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders info message when no cost estimate', () => {
      render(<CostBreakdown costEstimate={null} />);
      expect(screen.getByText('Select models to see cost estimate')).toBeInTheDocument();
    });
  });

  describe('compact mode', () => {
    it('shows only total in compact mode', () => {
      const estimate = createCostEstimate({ total: 1.25 });
      render(<CostBreakdown costEstimate={estimate} compact />);
      expect(screen.getByText('$1.25')).toBeInTheDocument();
      expect(screen.getByText('Estimated cost:')).toBeInTheDocument();
    });

    it('shows fallback indicator in compact mode', () => {
      const estimate = createCostEstimate({ isUsingFallback: true, fallbackReason: 'No historical data' });
      render(<CostBreakdown costEstimate={estimate} compact />);
      // Should render fallback warning icon
      expect(screen.getByTitle('No historical data')).toBeInTheDocument();
    });

    it('uses default fallback reason when none provided', () => {
      const estimate = createCostEstimate({ isUsingFallback: true, fallbackReason: null });
      render(<CostBreakdown costEstimate={estimate} compact />);
      expect(screen.getByTitle('Using estimated token counts')).toBeInTheDocument();
    });
  });

  describe('full breakdown', () => {
    it('renders total cost', () => {
      const estimate = createCostEstimate({ total: 2.50 });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.getByText('$2.50')).toBeInTheDocument();
    });

    it('renders scenario and model count', () => {
      const estimate = createCostEstimate({
        scenarioCount: 10,
        perModel: [createModelCost(), createModelCost({ modelId: 'anthropic:claude-3', displayName: 'Claude 3' })],
      });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.getByText(/10 scenarios x 2 models/)).toBeInTheDocument();
    });

    it('uses singular form for 1 scenario', () => {
      const estimate = createCostEstimate({ scenarioCount: 1 });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.getByText(/1 scenario x/)).toBeInTheDocument();
    });

    it('uses singular form for 1 model', () => {
      const estimate = createCostEstimate({ perModel: [createModelCost()] });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.getByText(/x 1 model$/)).toBeInTheDocument();
    });

    it('shows fallback warning when using fallback', () => {
      const estimate = createCostEstimate({
        isUsingFallback: true,
        fallbackReason: 'No historical data available for new models',
      });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.getByText('No historical data available for new models')).toBeInTheDocument();
    });

    it('does not show fallback warning when not using fallback', () => {
      const estimate = createCostEstimate({ isUsingFallback: false });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.queryByText(/historical data/i)).not.toBeInTheDocument();
    });

    it('renders model breakdown section', () => {
      const estimate = createCostEstimate();
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.getByText('Cost by Model')).toBeInTheDocument();
    });

    it('renders model name and cost', () => {
      const estimate = createCostEstimate({
        perModel: [createModelCost({ displayName: 'GPT-4o', totalCost: 0.15 })],
      });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
      // Total cost appears multiple times (in header and model row), use getAllByText
      const costElements = screen.getAllByText('$0.150');
      expect(costElements.length).toBeGreaterThan(0);
    });

    it('shows fallback badge on model using fallback', () => {
      const estimate = createCostEstimate({
        perModel: [createModelCost({ isUsingFallback: true })],
      });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.getByText('Est.')).toBeInTheDocument();
    });

    it('shows expanded details for 3 or fewer models', () => {
      const estimate = createCostEstimate({
        perModel: [createModelCost({ inputTokens: 2000, outputTokens: 1000 })],
      });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.getByText('Input tokens:')).toBeInTheDocument();
      expect(screen.getByText('Output tokens:')).toBeInTheDocument();
    });

    it('shows sample count for non-fallback models', () => {
      const estimate = createCostEstimate({
        perModel: [createModelCost({ sampleCount: 50, isUsingFallback: false })],
      });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.getByText('Based on samples:')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('hides sample count for fallback models', () => {
      const estimate = createCostEstimate({
        perModel: [createModelCost({ isUsingFallback: true })],
      });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.queryByText('Based on samples:')).not.toBeInTheDocument();
    });

    it('shows estimate quality indicator', () => {
      const estimate = createCostEstimate({ basedOnSampleCount: 150 });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.getByText(/Estimate based on 150 historical probes/)).toBeInTheDocument();
    });

    it('uses singular form for 1 probe', () => {
      const estimate = createCostEstimate({ basedOnSampleCount: 1 });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.getByText(/Estimate based on 1 historical probe\./)).toBeInTheDocument();
    });

    it('does not show estimate quality when no samples', () => {
      const estimate = createCostEstimate({ basedOnSampleCount: 0 });
      render(<CostBreakdown costEstimate={estimate} />);
      expect(screen.queryByText(/Estimate based on/)).not.toBeInTheDocument();
    });
  });
});

describe('formatCost', () => {
  it('uses 4 decimals for sub-cent amounts', () => {
    expect(formatCost(0.0012)).toBe('$0.0012');
    expect(formatCost(0.001)).toBe('$0.0010');
    expect(formatCost(0.0099)).toBe('$0.0099');
  });

  it('uses 3 decimals for amounts under $1', () => {
    expect(formatCost(0.01)).toBe('$0.010');
    expect(formatCost(0.123)).toBe('$0.123');
    expect(formatCost(0.999)).toBe('$0.999');
  });

  it('uses 2 decimals for amounts $1 and above', () => {
    expect(formatCost(1.00)).toBe('$1.00');
    expect(formatCost(10.5)).toBe('$10.50');
    expect(formatCost(100.456)).toBe('$100.46');
  });
});

describe('formatTokenCount helper (via component)', () => {
  it('formats millions', () => {
    const estimate = createCostEstimate({
      perModel: [createModelCost({ inputTokens: 1500000 })],
    });
    render(<CostBreakdown costEstimate={estimate} />);
    expect(screen.getByText('1.5M')).toBeInTheDocument();
  });

  it('formats thousands', () => {
    const estimate = createCostEstimate({
      perModel: [createModelCost({ inputTokens: 25000 })],
    });
    render(<CostBreakdown costEstimate={estimate} />);
    expect(screen.getByText('25.0K')).toBeInTheDocument();
  });

  it('formats small numbers with commas', () => {
    const estimate = createCostEstimate({
      perModel: [createModelCost({ inputTokens: 999 })],
    });
    render(<CostBreakdown costEstimate={estimate} />);
    expect(screen.getByText('999')).toBeInTheDocument();
  });
});
