import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ArchiveHome } from '../../src/pages/ArchiveHome';

describe('ArchiveHome', () => {
  it('renders links to survey compatibility surfaces', () => {
    render(
      <MemoryRouter>
        <ArchiveHome />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /^archive$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /legacy survey work/i })).toHaveAttribute('href', '/archive/surveys');
    expect(screen.getByRole('link', { name: /legacy survey results/i })).toHaveAttribute('href', '/archive/survey-results');
  });
});
