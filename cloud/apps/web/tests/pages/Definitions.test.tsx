import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Definitions } from '../../src/pages/Definitions';

describe('Definitions Page', () => {
  it('should render definitions heading', () => {
    render(<Definitions />);
    expect(screen.getByRole('heading', { name: /definitions/i })).toBeInTheDocument();
  });

  it('should render placeholder message', () => {
    render(<Definitions />);
    expect(screen.getByText(/scenario definitions will be displayed here/i)).toBeInTheDocument();
  });
});
