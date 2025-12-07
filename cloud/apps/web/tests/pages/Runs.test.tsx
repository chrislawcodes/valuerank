import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Runs } from '../../src/pages/Runs';

describe('Runs Page', () => {
  it('should render runs heading', () => {
    render(<Runs />);
    expect(screen.getByRole('heading', { name: /runs/i })).toBeInTheDocument();
  });

  it('should render placeholder message', () => {
    render(<Runs />);
    expect(screen.getByText(/evaluation runs will be displayed here/i)).toBeInTheDocument();
  });
});
