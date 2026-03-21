/**
 * ExecutionProgress Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExecutionProgress } from '../../../src/components/runs/ExecutionProgress';
import type { ExecutionMetrics, RunProgress, ProviderExecutionMetrics } from '../../../src/api/operations/runs';

function makeProvider(overrides: Partial<ProviderExecutionMetrics> = {}): ProviderExecutionMetrics {
  return {
    provider: 'openai',
    activeJobs: 0,
    queuedJobs: 0,
    maxParallel: 5,
    requestsPerMinute: 100,
    recentCompletions: [],
    activeModelIds: [],
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<ExecutionMetrics> = {}): ExecutionMetrics {
  return {
    totalActive: 0,
    totalQueued: 0,
    totalRetries: 0,
    estimatedSecondsRemaining: null,
    providers: [],
    ...overrides,
  };
}

const defaultProps = {
  runStatus: 'RUNNING' as const,
  runProgress: null,
  summarizeProgress: null,
  analysisStatus: null,
};

describe('ExecutionProgress', () => {
  it('returns null when no active providers', () => {
    const { container } = render(
      <ExecutionProgress metrics={makeMetrics()} {...defaultProps} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when a provider has active jobs', () => {
    const metrics = makeMetrics({
      totalActive: 1,
      providers: [makeProvider({ activeJobs: 1 })],
    });
    render(<ExecutionProgress metrics={metrics} {...defaultProps} />);
    expect(screen.getByText('PROBE')).toBeInTheDocument();
  });

  it('renders known provider names', () => {
    const providers = ['anthropic', 'openai', 'google', 'deepseek', 'xai', 'mistral'];
    const expectedNames = ['Anthropic', 'OpenAI', 'Google', 'DeepSeek', 'xAI', 'Mistral'];

    for (let i = 0; i < providers.length; i++) {
      const { unmount } = render(
        <ExecutionProgress
          metrics={makeMetrics({ providers: [makeProvider({ provider: providers[i], activeJobs: 1 })] })}
          {...defaultProps}
        />,
      );
      expect(screen.getByText(expectedNames[i]!)).toBeInTheDocument();
      unmount();
    }
  });

  it('renders unknown provider names as-is', () => {
    render(
      <ExecutionProgress
        metrics={makeMetrics({ providers: [makeProvider({ provider: 'novel-provider', activeJobs: 1 })] })}
        {...defaultProps}
      />,
    );
    expect(screen.getByText('novel-provider')).toBeInTheDocument();
  });

  it('shows slot count in provider footer', () => {
    render(
      <ExecutionProgress
        metrics={makeMetrics({ providers: [makeProvider({ activeJobs: 3, maxParallel: 5 })] })}
        {...defaultProps}
      />,
    );
    expect(screen.getByText('3/5 slots')).toBeInTheDocument();
  });

  it('shows queued count when jobs are queued', () => {
    render(
      <ExecutionProgress
        metrics={makeMetrics({
          totalQueued: 7,
          providers: [makeProvider({ activeJobs: 1, queuedJobs: 7 })],
        })}
        {...defaultProps}
      />,
    );
    expect(screen.getByText('7 queued')).toBeInTheDocument();
  });

  it('shows trials pending dispatch in header when queued', () => {
    render(
      <ExecutionProgress
        metrics={makeMetrics({ totalQueued: 12, providers: [makeProvider({ activeJobs: 1 })] })}
        {...defaultProps}
      />,
    );
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('trials pending dispatch')).toBeInTheDocument();
  });

  it('shows 0 retries badge when no retries', () => {
    render(
      <ExecutionProgress
        metrics={makeMetrics({ totalRetries: 0, providers: [makeProvider({ activeJobs: 1 })] })}
        {...defaultProps}
      />,
    );
    expect(screen.getByText('0 retries')).toBeInTheDocument();
  });

  it('shows retry count badge when retries > 0', () => {
    render(
      <ExecutionProgress
        metrics={makeMetrics({ totalRetries: 3, providers: [makeProvider({ activeJobs: 1 })] })}
        runProgress={{ total: 100, completed: 50, failed: 0, percentComplete: 50 }}
        runStatus="RUNNING"
        summarizeProgress={null}
        analysisStatus={null}
      />,
    );
    expect(screen.getByText('3 retries')).toBeInTheDocument();
  });

  it('shows per-model rows when byModel data is provided', () => {
    const runProgress: RunProgress = {
      total: 10,
      completed: 3,
      failed: 0,
      percentComplete: 30,
      byModel: [{ modelId: 'gpt-4o', completed: 3, failed: 0 }],
    };
    render(
      <ExecutionProgress
        metrics={makeMetrics({
          providers: [makeProvider({
            activeJobs: 1,
            activeModelIds: ['gpt-4o'],
          })],
        })}
        runStatus="RUNNING"
        runProgress={runProgress}
        summarizeProgress={null}
        analysisStatus={null}
      />,
    );
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('3 done')).toBeInTheDocument();
  });

  it('shows stage pills with Probe active during RUNNING', () => {
    render(
      <ExecutionProgress
        metrics={makeMetrics({ providers: [makeProvider({ activeJobs: 1 })] })}
        runStatus="RUNNING"
        runProgress={null}
        summarizeProgress={null}
        analysisStatus={null}
      />,
    );
    expect(screen.getByText('Probe')).toBeInTheDocument();
    expect(screen.getAllByText('Summarize').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Analyse').length).toBeGreaterThan(0);
  });

  it('shows Summarize stage active during SUMMARIZING status', () => {
    render(
      <ExecutionProgress
        metrics={makeMetrics({ providers: [makeProvider({ activeJobs: 1 })] })}
        runStatus="SUMMARIZING"
        runProgress={null}
        summarizeProgress={{ total: 20, completed: 5, failed: 0, percentComplete: 25 }}
        analysisStatus={null}
      />,
    );
    expect(screen.getAllByText('Summarize').length).toBeGreaterThan(0);
  });

  it('shows Summarize progress bar when summarizeProgress provided', () => {
    render(
      <ExecutionProgress
        metrics={makeMetrics({ providers: [makeProvider({ activeJobs: 1 })] })}
        runStatus="SUMMARIZING"
        runProgress={null}
        summarizeProgress={{ total: 20, completed: 10, failed: 0, percentComplete: 50 }}
        analysisStatus={null}
      />,
    );
    expect(screen.getByText('10 / 20')).toBeInTheDocument();
  });

  it('shows Starts after Probe hint when summarize not started', () => {
    render(
      <ExecutionProgress
        metrics={makeMetrics({ providers: [makeProvider({ activeJobs: 1 })] })}
        {...defaultProps}
      />,
    );
    expect(screen.getByText('Starts after Probe')).toBeInTheDocument();
  });

  it('filters providers with no activity and no model rows', () => {
    const metrics = makeMetrics({
      providers: [
        makeProvider({ provider: 'openai', activeJobs: 0, queuedJobs: 0 }),
        makeProvider({ provider: 'anthropic', activeJobs: 2 }),
      ],
    });
    render(<ExecutionProgress metrics={metrics} {...defaultProps} />);
    expect(screen.queryByText('OpenAI')).not.toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
  });
});
