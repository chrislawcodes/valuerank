import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FullPvqResults } from '../../src/pages/FullPvqResults';

const mockUseQuery = vi.fn();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const emptySurveyResponse = { data: { fullPvqSurvey: null }, fetching: false, error: undefined };
const emptyResultsResponse = {
  data: { fullPvqResults: { models: [], categories: [] } },
  fetching: false,
  error: undefined,
};

describe('FullPvqResults', () => {
  it('renders loading state', () => {
    mockUseQuery.mockReturnValue([{ data: undefined, fetching: true, error: undefined }]);
    render(
      <MemoryRouter initialEntries={['/?surveyId=survey-1&framing=straight']}>
        <FullPvqResults />
      </MemoryRouter>
    );
    expect(screen.getByText(/loading full pvq results/i)).toBeInTheDocument();
  });

  it('renders empty state when no models have results', () => {
    mockUseQuery
      .mockReturnValueOnce([emptySurveyResponse])
      .mockReturnValueOnce([emptyResultsResponse]);
    render(
      <MemoryRouter initialEntries={['/?surveyId=survey-1&framing=straight']}>
        <FullPvqResults />
      </MemoryRouter>
    );
    expect(screen.getByText(/no completed trials for this survey/i)).toBeInTheDocument();
  });

  it('renders results table when models have scores', () => {
    const surveyResponse = {
      data: { fullPvqSurvey: { id: 'survey-1', name: 'Alpha Survey', analysisPlan: null } },
      fetching: false,
      error: undefined,
    };
    const resultsResponse = {
      data: {
        fullPvqResults: {
          models: [{ modelId: 'model-a', displayName: 'Model A' }],
          categories: [
            {
              name: 'Self-Direction',
              scores: [{ modelId: 'model-a', mean: 4.5, trialCount: 3, refusedCount: 0 }],
            },
          ],
        },
      },
      fetching: false,
      error: undefined,
    };
    mockUseQuery
      .mockReturnValueOnce([surveyResponse])
      .mockReturnValueOnce([resultsResponse]);
    render(
      <MemoryRouter initialEntries={['/?surveyId=survey-1&framing=straight']}>
        <FullPvqResults />
      </MemoryRouter>
    );
    expect(screen.getByText('Self-Direction')).toBeInTheDocument();
    expect(screen.getByText('Model A')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
  });

  it('renders framing toggle buttons', () => {
    mockUseQuery
      .mockReturnValueOnce([emptySurveyResponse])
      .mockReturnValueOnce([emptyResultsResponse]);
    render(
      <MemoryRouter initialEntries={['/?surveyId=survey-1&framing=straight']}>
        <FullPvqResults />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /straight/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /desire for human/i })).toBeInTheDocument();
  });

  it('renders error when survey query fails', () => {
    mockUseQuery
      .mockReturnValueOnce([{ data: undefined, fetching: false, error: { message: 'server error' } }])
      .mockReturnValueOnce([emptyResultsResponse]);
    render(
      <MemoryRouter initialEntries={['/?surveyId=survey-1&framing=straight']}>
        <FullPvqResults />
      </MemoryRouter>
    );
    expect(screen.getByText(/failed to load full pvq results/i)).toBeInTheDocument();
  });
});
