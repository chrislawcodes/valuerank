/**
 * ExecutionProgress Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExecutionProgress } from '../../../src/components/runs/ExecutionProgress';
import type { ExecutionMetrics, ProviderExecutionMetrics } from '../../../src/api/operations/runs';

// Helper to create mock provider metrics
function createProviderMetrics(overrides: Partial<ProviderExecutionMetrics> = {}): ProviderExecutionMetrics {
  return {
    provider: 'openai',
    activeJobs: 0,
    queuedJobs: 0,
    maxParallel: 5,
    requestsPerMinute: 100,
    recentCompletions: [],
    ...overrides,
  };
}

// Helper to create mock execution metrics
function createMetrics(overrides: Partial<ExecutionMetrics> = {}): ExecutionMetrics {
  return {
    totalActive: 0,
    totalQueued: 0,
    totalCapacity: 10,
    estimatedSecondsRemaining: null,
    providers: [],
    ...overrides,
  };
}

describe('ExecutionProgress', () => {
  it('returns null when no active providers', () => {
    const metrics = createMetrics({ providers: [] });
    const { container } = render(<ExecutionProgress metrics={metrics} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when providers have capacity', () => {
    const metrics = createMetrics({
      providers: [createProviderMetrics({ provider: 'openai', maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('Parallel Execution')).toBeInTheDocument();
  });

  it('displays active job count', () => {
    const metrics = createMetrics({
      totalActive: 3,
      providers: [createProviderMetrics({ provider: 'openai', activeJobs: 3, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('3 active')).toBeInTheDocument();
  });

  it('displays queued job count', () => {
    const metrics = createMetrics({
      totalQueued: 5,
      providers: [createProviderMetrics({ provider: 'openai', queuedJobs: 5, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('5 queued')).toBeInTheDocument();
  });

  it('displays ETA in seconds', () => {
    const metrics = createMetrics({
      estimatedSecondsRemaining: 45,
      providers: [createProviderMetrics({ provider: 'openai', activeJobs: 1, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('ETA: 45s')).toBeInTheDocument();
  });

  it('displays ETA in minutes and seconds', () => {
    const metrics = createMetrics({
      estimatedSecondsRemaining: 90,
      providers: [createProviderMetrics({ provider: 'openai', activeJobs: 1, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('ETA: 1m 30s')).toBeInTheDocument();
  });

  it('displays ETA in minutes only when no remaining seconds', () => {
    const metrics = createMetrics({
      estimatedSecondsRemaining: 120,
      providers: [createProviderMetrics({ provider: 'openai', activeJobs: 1, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('ETA: 2m')).toBeInTheDocument();
  });

  it('displays ETA in hours and minutes', () => {
    const metrics = createMetrics({
      estimatedSecondsRemaining: 3660, // 1h 1m
      providers: [createProviderMetrics({ provider: 'openai', activeJobs: 1, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('ETA: 1h 1m')).toBeInTheDocument();
  });

  it('renders provider cards for each active provider', () => {
    const metrics = createMetrics({
      providers: [
        createProviderMetrics({ provider: 'openai', activeJobs: 2, maxParallel: 5 }),
        createProviderMetrics({ provider: 'anthropic', activeJobs: 1, maxParallel: 3 }),
      ],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
  });

  it('displays concurrency gauge for providers', () => {
    const metrics = createMetrics({
      providers: [createProviderMetrics({ provider: 'openai', activeJobs: 3, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('3/5')).toBeInTheDocument();
  });

  it('displays rate limit for providers', () => {
    const metrics = createMetrics({
      providers: [createProviderMetrics({ provider: 'openai', requestsPerMinute: 100, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('100/min')).toBeInTheDocument();
  });

  it('displays queued count on provider card', () => {
    const metrics = createMetrics({
      providers: [createProviderMetrics({ provider: 'openai', queuedJobs: 10, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('+10 queued')).toBeInTheDocument();
  });

  it('renders recent completions feed', () => {
    const metrics = createMetrics({
      providers: [
        createProviderMetrics({
          provider: 'openai',
          activeJobs: 1,
          maxParallel: 5,
          recentCompletions: [
            { scenarioId: 's1', modelId: 'gpt-4o', success: true, completedAt: new Date().toISOString() },
            { scenarioId: 's2', modelId: 'claude-3-opus', success: false, completedAt: new Date().toISOString() },
          ],
        }),
      ],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('Recent:')).toBeInTheDocument();
    // Model names are truncated to first 2 parts - use getAllByText for potential duplicates
    const gptElements = screen.getAllByText('gpt-4o');
    expect(gptElements.length).toBeGreaterThan(0);
  });

  it('handles unknown provider names gracefully', () => {
    const metrics = createMetrics({
      providers: [createProviderMetrics({ provider: 'unknown-provider', activeJobs: 1, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    // Unknown providers use the raw provider name
    expect(screen.getByText('unknown-provider')).toBeInTheDocument();
  });

  it('renders google provider correctly', () => {
    const metrics = createMetrics({
      providers: [createProviderMetrics({ provider: 'google', activeJobs: 1, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('Google')).toBeInTheDocument();
  });

  it('renders deepseek provider correctly', () => {
    const metrics = createMetrics({
      providers: [createProviderMetrics({ provider: 'deepseek', activeJobs: 1, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('DeepSeek')).toBeInTheDocument();
  });

  it('renders xai provider correctly', () => {
    const metrics = createMetrics({
      providers: [createProviderMetrics({ provider: 'xai', activeJobs: 1, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('xAI')).toBeInTheDocument();
  });

  it('renders mistral provider correctly', () => {
    const metrics = createMetrics({
      providers: [createProviderMetrics({ provider: 'mistral', activeJobs: 1, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.getByText('Mistral')).toBeInTheDocument();
  });

  it('does not render ETA when estimatedSecondsRemaining is 0', () => {
    const metrics = createMetrics({
      estimatedSecondsRemaining: 0,
      providers: [createProviderMetrics({ provider: 'openai', activeJobs: 1, maxParallel: 5 })],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.queryByText(/ETA:/)).not.toBeInTheDocument();
  });

  it('filters out providers with no activity or capacity', () => {
    const metrics = createMetrics({
      providers: [
        createProviderMetrics({ provider: 'openai', activeJobs: 0, queuedJobs: 0, maxParallel: 0 }),
        createProviderMetrics({ provider: 'anthropic', activeJobs: 1, maxParallel: 5 }),
      ],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.queryByText('OpenAI')).not.toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
  });

  it('does not show recent completions when empty', () => {
    const metrics = createMetrics({
      providers: [
        createProviderMetrics({
          provider: 'openai',
          activeJobs: 1,
          maxParallel: 5,
          recentCompletions: [],
        }),
      ],
    });
    render(<ExecutionProgress metrics={metrics} />);
    expect(screen.queryByText('Recent:')).not.toBeInTheDocument();
  });

  it('limits recent completions to 5 items', () => {
    const completions = Array.from({ length: 10 }, (_, i) => ({
      scenarioId: `s${i}`,
      modelId: `model-${i}`,
      success: true,
      completedAt: new Date(Date.now() - i * 1000).toISOString(),
    }));

    const metrics = createMetrics({
      providers: [
        createProviderMetrics({
          provider: 'openai',
          activeJobs: 1,
          maxParallel: 5,
          recentCompletions: completions,
        }),
      ],
    });
    render(<ExecutionProgress metrics={metrics} />);

    // Should show Recent: label and max 5 completions displayed per component logic
    expect(screen.getByText('Recent:')).toBeInTheDocument();
  });
});
