import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from '../../src/pages/Dashboard';

describe('Dashboard Page', () => {
  it('should render dashboard heading', () => {
    render(<Dashboard />);
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('should render welcome message', () => {
    render(<Dashboard />);
    expect(screen.getByText(/welcome to valuerank/i)).toBeInTheDocument();
  });
});
