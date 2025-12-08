/**
 * ExpandedScenarios Component Tests
 *
 * Tests for the scenario viewer with expand/collapse and regeneration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpandedScenarios } from '../../../src/components/definitions/ExpandedScenarios';
import type { Scenario } from '../../../src/api/operations/scenarios';
import type { ExpansionStatus } from '../../../src/api/operations/definitions';

// Mock the useExpandedScenarios hook
vi.mock('../../../src/hooks/useExpandedScenarios', () => ({
  useExpandedScenarios: vi.fn(),
}));

// Mock urql's useMutation and gql
vi.mock('urql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('urql')>();
  return {
    ...actual,
    useMutation: vi.fn(() => [{ fetching: false }, vi.fn()]),
  };
});

import { useExpandedScenarios } from '../../../src/hooks/useExpandedScenarios';
import { useMutation } from 'urql';

function createMockScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'scenario-1',
    definitionId: 'def-1',
    name: 'Test Scenario',
    content: {
      preamble: 'Test preamble',
      prompt: 'Test prompt',
      dimensions: { severity: 'high', domain: 'ethics' },
    },
    createdAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('ExpandedScenarios', () => {
  const mockRefetch = vi.fn();
  const mockExecuteMutation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockReturnValue([{ fetching: false }, mockExecuteMutation]);
  });

  it('renders collapsed by default', () => {
    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [],
      totalCount: 0,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ExpandedScenarios definitionId="def-1" />);

    expect(screen.getByText('Database Scenarios')).toBeInTheDocument();
    // Should not show scenarios list when collapsed
    expect(screen.queryByText('Loading scenarios...')).not.toBeInTheDocument();
  });

  it('shows scenario count badge when scenarios exist', () => {
    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [createMockScenario()],
      totalCount: 5,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ExpandedScenarios definitionId="def-1" />);

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows "Generating..." badge when expansion is pending', () => {
    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [],
      totalCount: 0,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    const expansionStatus: ExpansionStatus = { status: 'PENDING' };
    render(<ExpandedScenarios definitionId="def-1" expansionStatus={expansionStatus} />);

    expect(screen.getByText('Generating...')).toBeInTheDocument();
  });

  it('shows "Ready" badge when expansion is completed', () => {
    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [createMockScenario()],
      totalCount: 1,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    const expansionStatus: ExpansionStatus = { status: 'COMPLETED' };
    render(<ExpandedScenarios definitionId="def-1" expansionStatus={expansionStatus} />);

    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows "Failed" badge when expansion failed', () => {
    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [],
      totalCount: 0,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    const expansionStatus: ExpansionStatus = { status: 'FAILED', error: 'LLM rate limited' };
    render(<ExpandedScenarios definitionId="def-1" expansionStatus={expansionStatus} />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows "No scenarios" badge when count is 0 and no status', () => {
    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [],
      totalCount: 0,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ExpandedScenarios definitionId="def-1" />);

    expect(screen.getByText('No scenarios')).toBeInTheDocument();
  });

  it('expands and shows scenarios when header is clicked', async () => {
    const user = userEvent.setup();

    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [createMockScenario({ name: 'My Test Scenario' })],
      totalCount: 1,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ExpandedScenarios definitionId="def-1" />);

    // Click to expand
    await user.click(screen.getByText('Database Scenarios'));

    expect(screen.getByText('My Test Scenario')).toBeInTheDocument();
  });

  it('shows loading state when expanded and loading', async () => {
    const user = userEvent.setup();

    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [],
      totalCount: 0,
      loading: true,
      error: null,
      refetch: mockRefetch,
    });

    render(<ExpandedScenarios definitionId="def-1" />);

    // Click to expand
    await user.click(screen.getByText('Database Scenarios'));

    expect(screen.getByText('Loading scenarios...')).toBeInTheDocument();
  });

  it('shows error message when error occurs', async () => {
    const user = userEvent.setup();

    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [],
      totalCount: 0,
      loading: false,
      error: new Error('Network error'),
      refetch: mockRefetch,
    });

    render(<ExpandedScenarios definitionId="def-1" />);

    // Click to expand
    await user.click(screen.getByText('Database Scenarios'));

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows empty state when no scenarios', async () => {
    const user = userEvent.setup();

    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [],
      totalCount: 0,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ExpandedScenarios definitionId="def-1" />);

    // Click to expand
    await user.click(screen.getByText('Database Scenarios'));

    expect(screen.getByText(/No scenarios found/)).toBeInTheDocument();
  });

  it('shows scenario content when expanded', async () => {
    const user = userEvent.setup();

    const scenario = createMockScenario({
      content: {
        preamble: 'Custom preamble text',
        prompt: 'Custom prompt text',
        dimensions: { uniqueDimension: 'uniqueValue' },
      },
    });

    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [scenario],
      totalCount: 1,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ExpandedScenarios definitionId="def-1" />);

    // Expand the scenarios list
    await user.click(screen.getByText('Database Scenarios'));

    // Expand individual scenario
    await user.click(screen.getByText('Test Scenario'));

    expect(screen.getByText('Custom preamble text')).toBeInTheDocument();
    expect(screen.getByText('Custom prompt text')).toBeInTheDocument();
    // Dimension is displayed as "key: value" (may appear multiple times in header and body)
    expect(screen.getAllByText('uniqueDimension: uniqueValue').length).toBeGreaterThan(0);
  });

  it('shows followups when present', async () => {
    const user = userEvent.setup();

    const scenario = createMockScenario({
      content: {
        prompt: 'Main prompt',
        followups: [
          { label: 'First Followup', prompt: 'Follow up question 1' },
          { label: 'Second Followup', prompt: 'Follow up question 2' },
        ],
      },
    });

    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [scenario],
      totalCount: 1,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ExpandedScenarios definitionId="def-1" />);

    await user.click(screen.getByText('Database Scenarios'));
    await user.click(screen.getByText('Test Scenario'));

    expect(screen.getByText('Followups (2)')).toBeInTheDocument();
    expect(screen.getByText('First Followup')).toBeInTheDocument();
    expect(screen.getByText('Follow up question 1')).toBeInTheDocument();
    expect(screen.getByText('Second Followup')).toBeInTheDocument();
  });

  it('calls refetch when Refresh button is clicked', async () => {
    const user = userEvent.setup();

    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [createMockScenario()],
      totalCount: 1,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ExpandedScenarios definitionId="def-1" />);

    await user.click(screen.getByText('Database Scenarios'));

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshButton);

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('triggers regenerate mutation when Regenerate is clicked', async () => {
    const user = userEvent.setup();

    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [createMockScenario()],
      totalCount: 1,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    const onRegenerateTriggered = vi.fn();
    mockExecuteMutation.mockResolvedValue({ data: { regenerateScenarios: { queued: true } } });

    render(<ExpandedScenarios definitionId="def-1" onRegenerateTriggered={onRegenerateTriggered} />);

    await user.click(screen.getByText('Database Scenarios'));

    const regenerateButton = screen.getByRole('button', { name: /regenerate/i });
    await user.click(regenerateButton);

    expect(mockExecuteMutation).toHaveBeenCalledWith({ definitionId: 'def-1' });
  });

  it('shows count of total scenarios when more exist than displayed', async () => {
    const user = userEvent.setup();

    vi.mocked(useExpandedScenarios).mockReturnValue({
      scenarios: [createMockScenario()],
      totalCount: 100,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<ExpandedScenarios definitionId="def-1" />);

    await user.click(screen.getByText('Database Scenarios'));

    expect(screen.getByText('Showing 1 of 100 scenarios')).toBeInTheDocument();
  });
});
