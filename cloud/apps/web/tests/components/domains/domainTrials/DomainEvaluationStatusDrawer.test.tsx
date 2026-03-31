import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DomainEvaluationStatusDrawer } from '../../../../src/components/domains/domainTrials/DomainEvaluationStatusDrawer';

const useRunMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/hooks/useRun', () => ({
  useRun: (...args: unknown[]) => useRunMock(...args),
}));

vi.mock('../../../../src/components/runs/RunProgress', () => ({
  RunProgress: () => <div>Run progress mock</div>,
}));

function makeRun() {
  return {
    id: 'run-1',
    definitionId: 'def-1',
    experimentId: null,
    status: 'RUNNING',
    config: { models: ['model-1'], samplePercentage: 100 },
    runProgress: { total: 25, completed: 10, failed: 0, percentComplete: 40 },
    summarizeProgress: null,
    executionMetrics: null,
    startedAt: '2026-03-15T12:01:00.000Z',
    completedAt: null,
    createdAt: '2026-03-15T12:00:00.000Z',
    updatedAt: '2026-03-15T12:03:00.000Z',
    lastAccessedAt: null,
    transcripts: [
      {
        id: 't-1',
        runId: 'run-1',
        scenarioId: 'scenario-1',
        modelId: 'model-1',
        modelVersion: null,
        content: {},
        decisionCode: null,
        turnCount: 2,
        tokenCount: 120,
        durationMs: 2500,
        estimatedCost: null,
        createdAt: '2026-03-15T12:03:00.000Z',
        lastAccessedAt: null,
      },
    ],
    transcriptCount: 1,
    recentTasks: [
      {
        scenarioId: 'scenario-1',
        modelId: 'model-1',
        status: 'RUNNING',
        error: null,
        completedAt: null,
      },
    ],
    definition: {
      id: 'def-1',
      name: 'Jobs A',
    },
    runCategory: 'PRODUCTION',
    analysisStatus: 'computing',
    stalledModels: ['model-1'],
  };
}

describe('DomainEvaluationStatusDrawer', () => {
  beforeEach(() => {
    useRunMock.mockReset();
  });

  it('shows loading and error fallback states', () => {
    useRunMock.mockReturnValueOnce({ run: null, loading: true, error: null, refetch: vi.fn() });
    const { rerender } = render(
      <MemoryRouter>
        <DomainEvaluationStatusDrawer runId="run-1" open={true} onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Loading run details...')).toBeInTheDocument();

    useRunMock.mockReturnValueOnce({ run: null, loading: false, error: new Error('Boom'), refetch: vi.fn() });
    rerender(
      <MemoryRouter>
        <DomainEvaluationStatusDrawer runId="run-1" open={true} onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('shows run details and model stall context', () => {
    useRunMock.mockReturnValue({
      run: makeRun(),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DomainEvaluationStatusDrawer runId="run-1" open={true} onClose={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Jobs A')).toBeInTheDocument();
    expect(screen.getByText('Model stall detected')).toBeInTheDocument();
    expect(screen.getByText('Recent task log')).toBeInTheDocument();
    expect(screen.getByText('Recent transcripts')).toBeInTheDocument();
    expect(screen.getByText('Open run diagnostics')).toBeInTheDocument();
  });
});
