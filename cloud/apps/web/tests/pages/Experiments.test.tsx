import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Survey } from '../../src/pages/Survey';

vi.mock('urql', () => ({
  gql: (value: TemplateStringsArray) => value[0] ?? '',
  useQuery: () => [{ data: { surveys: [] }, fetching: false, error: null }, vi.fn()],
  useMutation: () => [null, vi.fn(async () => ({ data: {}, error: null }))],
}));

vi.mock('../../src/hooks/useAvailableModels', () => ({
  useAvailableModels: () => ({ models: [], loading: false, error: null }),
}));

vi.mock('../../src/hooks/useCostEstimate', () => ({
  useCostEstimate: () => ({ costEstimate: null, loading: false, error: null }),
}));

vi.mock('../../src/hooks/useRunMutations', () => ({
  useRunMutations: () => ({ startRun: vi.fn(), loading: false, error: null }),
}));

describe('Survey Page', () => {
  it('should render survey heading', () => {
    render(
      <MemoryRouter>
        <Survey />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /^survey$/i, level: 1 })).toBeInTheDocument();
  });

  it('should render empty state message', () => {
    render(
      <MemoryRouter>
        <Survey />
      </MemoryRouter>
    );
    expect(screen.getByText(/no surveys yet/i)).toBeInTheDocument();
  });
});
