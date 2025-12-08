import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Experiments } from '../../src/pages/Experiments';

describe('Experiments Page', () => {
  it('should render experiments heading', () => {
    render(<Experiments />);
    expect(screen.getByRole('heading', { name: /experiments/i })).toBeInTheDocument();
  });

  it('should render placeholder message', () => {
    render(<Experiments />);
    expect(screen.getByText(/experiments will be displayed here/i)).toBeInTheDocument();
  });
});
