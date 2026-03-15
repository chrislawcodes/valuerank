import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Glossary } from '../../src/pages/Glossary';

describe('Glossary Page', () => {
  it('renders the canonical glossary overview and key sections', () => {
    render(<Glossary />);

    expect(screen.getByRole('heading', { name: 'Canonical Glossary' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Core Terms' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Execution Terms' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Analysis Terms' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Deprecated Or Internal Terms' })).toBeInTheDocument();
  });

  it('shows the legacy mapping table and deprecated replacements', () => {
    render(<Glossary />);

    expect(screen.getByText('Legacy mapping')).toBeInTheDocument();
    expect(screen.getAllByText('definition')[0]).toBeInTheDocument();
    expect(screen.getByText('Prefer vignette')).toBeInTheDocument();
    expect(screen.getByText('Preferred replacement')).toBeInTheDocument();
  });
});
