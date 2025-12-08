/**
 * SystemHealth Component Tests
 *
 * Tests for the combined system health panel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemHealth } from '../../../src/components/settings/SystemHealth';
import type { SystemHealth as SystemHealthType } from '../../../src/api/operations/health';

// Mock the useSystemHealth hook
vi.mock('../../../src/hooks/useSystemHealth', () => ({
  useSystemHealth: vi.fn(),
}));

import { useSystemHealth } from '../../../src/hooks/useSystemHealth';

function createMockSystemHealth(overrides: Partial<SystemHealthType> = {}): SystemHealthType {
  return {
    providers: {
      providers: [
        { id: 'openai', name: 'OpenAI', configured: true, connected: true, error: null, lastChecked: '2024-01-15T10:00:00Z' },
        { id: 'anthropic', name: 'Anthropic', configured: true, connected: true, error: null, lastChecked: '2024-01-15T10:00:00Z' },
      ],
      checkedAt: '2024-01-15T10:00:00Z',
    },
    queue: {
      isHealthy: true,
      isRunning: true,
      isPaused: false,
      activeJobs: 2,
      pendingJobs: 5,
      completedLast24h: 100,
      failedLast24h: 3,
      successRate: 0.97,
      jobTypes: [],
      error: null,
      checkedAt: '2024-01-15T10:00:00Z',
    },
    worker: {
      isHealthy: true,
      pythonVersion: '3.11.5',
      packages: { requests: '2.31.0' },
      apiKeys: { openai: true, anthropic: true },
      warnings: [],
      error: null,
      checkedAt: '2024-01-15T10:00:00Z',
    },
    ...overrides,
  };
}

describe('SystemHealth', () => {
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state when fetching initial data', () => {
    vi.mocked(useSystemHealth).mockReturnValue({
      health: null,
      loading: true,
      error: null,
      refetch: mockRefetch,
    });

    render(<SystemHealth />);

    expect(screen.getByText('System Health')).toBeInTheDocument();
    expect(screen.getByText('Checking system health...')).toBeInTheDocument();
  });

  it('renders error state when fetch fails', () => {
    vi.mocked(useSystemHealth).mockReturnValue({
      health: null,
      loading: false,
      error: new Error('Network error'),
      refetch: mockRefetch,
    });

    render(<SystemHealth />);

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('renders all health sections when data is available', () => {
    vi.mocked(useSystemHealth).mockReturnValue({
      health: createMockSystemHealth(),
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<SystemHealth />);

    // Check that main sections are rendered
    expect(screen.getByText('System Health')).toBeInTheDocument();
    expect(screen.getByText('LLM Providers')).toBeInTheDocument();
    expect(screen.getByText('Job Queue')).toBeInTheDocument();
    expect(screen.getByText('Python Workers')).toBeInTheDocument();
  });

  it('displays provider status correctly', () => {
    vi.mocked(useSystemHealth).mockReturnValue({
      health: createMockSystemHealth(),
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<SystemHealth />);

    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('2/2 connected')).toBeInTheDocument();
  });

  it('displays queue status correctly', () => {
    vi.mocked(useSystemHealth).mockReturnValue({
      health: createMockSystemHealth(),
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<SystemHealth />);

    expect(screen.getByText('2')).toBeInTheDocument(); // activeJobs
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument(); // completedLast24h
  });

  it('displays worker status correctly', () => {
    vi.mocked(useSystemHealth).mockReturnValue({
      health: createMockSystemHealth(),
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<SystemHealth />);

    expect(screen.getByText('3.11.5')).toBeInTheDocument(); // Python version
    expect(screen.getByText('openai, anthropic')).toBeInTheDocument(); // Configured providers
  });

  it('calls refetch when Refresh button is clicked', async () => {
    const user = userEvent.setup();

    vi.mocked(useSystemHealth).mockReturnValue({
      health: createMockSystemHealth(),
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<SystemHealth />);

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshButton);

    expect(mockRefetch).toHaveBeenCalledWith(true);
  });

  it('disables Refresh button while loading', () => {
    vi.mocked(useSystemHealth).mockReturnValue({
      health: createMockSystemHealth(),
      loading: true,
      error: null,
      refetch: mockRefetch,
    });

    render(<SystemHealth />);

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    expect(refreshButton).toBeDisabled();
  });

  it('shows worker warnings when present', () => {
    const healthWithWarnings = createMockSystemHealth();
    healthWithWarnings.worker.warnings = ['Python 3.12 recommended'];

    vi.mocked(useSystemHealth).mockReturnValue({
      health: healthWithWarnings,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<SystemHealth />);

    expect(screen.getByText('Python 3.12 recommended')).toBeInTheDocument();
  });

  it('shows worker error when present', () => {
    const healthWithError = createMockSystemHealth();
    healthWithError.worker.isHealthy = false;
    healthWithError.worker.error = 'Failed to spawn Python';

    vi.mocked(useSystemHealth).mockReturnValue({
      health: healthWithError,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<SystemHealth />);

    expect(screen.getByText('Failed to spawn Python')).toBeInTheDocument();
  });

  it('returns null when no health data and not loading/errored', () => {
    vi.mocked(useSystemHealth).mockReturnValue({
      health: null,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    const { container } = render(<SystemHealth />);

    expect(container.firstChild).toBeNull();
  });
});
