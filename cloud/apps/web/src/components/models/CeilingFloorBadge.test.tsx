import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CeilingFloorBadge } from './CeilingFloorBadge';

describe('CeilingFloorBadge', () => {
  it('renders a ceiling badge', () => {
    render(<CeilingFloorBadge flag="ceiling" />);

    const badge = screen.getByText('ceiling');
    expect(badge.className).toContain('bg-amber-100');
    expect(badge.className).toContain('text-amber-800');
  });

  it('renders a floor badge', () => {
    render(<CeilingFloorBadge flag="floor" />);

    const badge = screen.getByText('floor');
    expect(badge.className).toContain('bg-amber-100');
    expect(badge.className).toContain('text-amber-800');
  });

  it('renders nothing when the flag is null', () => {
    render(<CeilingFloorBadge flag={null} />);

    expect(screen.queryByText('ceiling')).toBeNull();
    expect(screen.queryByText('floor')).toBeNull();
  });
});
