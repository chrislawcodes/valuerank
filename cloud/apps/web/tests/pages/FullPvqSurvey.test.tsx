import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FullPvqSurvey } from '../../src/pages/FullPvqSurvey';

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: (...args: unknown[]) => mockUseMutation(...args),
  };
});

vi.mock('../../src/hooks/useAvailableModels', () => ({
  useAvailableModels: () => ({ models: [], loading: false }),
}));

vi.mock('../../src/components/runs/ModelSelector', () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}));

function noopMutation() {
  return [{ fetching: false }, vi.fn()];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseMutation.mockReturnValue(noopMutation());
});

describe('FullPvqSurvey', () => {
  it('renders loading state', () => {
    mockUseQuery.mockReturnValue([{ data: undefined, fetching: true, error: undefined }, vi.fn()]);
    render(
      <MemoryRouter>
        <FullPvqSurvey />
      </MemoryRouter>
    );
    expect(screen.getByText(/loading full pvq surveys/i)).toBeInTheDocument();
  });

  it('renders empty state when no surveys', () => {
    mockUseQuery.mockReturnValue([
      { data: { fullPvqSurveys: [] }, fetching: false, error: undefined },
      vi.fn(),
    ]);
    render(
      <MemoryRouter>
        <FullPvqSurvey />
      </MemoryRouter>
    );
    expect(screen.getByText(/no full pvq surveys yet/i)).toBeInTheDocument();
  });

  it('renders survey list when surveys exist', () => {
    mockUseQuery.mockReturnValue([
      {
        data: {
          fullPvqSurveys: [
            {
              id: 'survey-1',
              name: 'My Test Survey',
              straightTrialCount: 10,
              desireTrialCount: 5,
              createdAt: '2026-01-01T00:00:00.000Z',
              analysisPlan: null,
            },
          ],
        },
        fetching: false,
        error: undefined,
      },
      vi.fn(),
    ]);
    render(
      <MemoryRouter>
        <FullPvqSurvey />
      </MemoryRouter>
    );
    expect(screen.getByText('My Test Survey')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders page heading and create button', () => {
    mockUseQuery.mockReturnValue([
      { data: { fullPvqSurveys: [] }, fetching: false, error: undefined },
      vi.fn(),
    ]);
    render(
      <MemoryRouter>
        <FullPvqSurvey />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /^full pvq surveys$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create full pvq survey/i })).toBeInTheDocument();
  });

  it('renders error message on query failure', () => {
    mockUseQuery.mockReturnValue([
      { data: undefined, fetching: false, error: { message: 'network error' } },
      vi.fn(),
    ]);
    render(
      <MemoryRouter>
        <FullPvqSurvey />
      </MemoryRouter>
    );
    expect(screen.getByText(/failed to load full pvq surveys/i)).toBeInTheDocument();
  });
});
