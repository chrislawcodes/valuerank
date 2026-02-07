import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Definitions } from '../../src/pages/Definitions';

// Mock the useDefinitions hook
vi.mock('../../src/hooks/useDefinitions', () => ({
  useDefinitions: () => ({
    definitions: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

function renderDefinitionsPage() {
  return render(
    <BrowserRouter>
      <Definitions />
    </BrowserRouter>
  );
}

describe('Definitions Page', () => {
  it('should render vignettes heading', () => {
    renderDefinitionsPage();
    expect(
      screen.getByRole('heading', { name: /vignettes/i, level: 1 })
    ).toBeInTheDocument();
  });

  it('should render empty state when no vignettes', () => {
    renderDefinitionsPage();
    expect(screen.getByText('No vignettes yet')).toBeInTheDocument();
  });

  it('should render create button in empty state', () => {
    renderDefinitionsPage();
    expect(
      screen.getByRole('button', { name: /create vignette/i })
    ).toBeInTheDocument();
  });
});
