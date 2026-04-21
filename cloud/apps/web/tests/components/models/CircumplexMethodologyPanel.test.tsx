import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CircumplexMethodologyPanel } from '../../../src/components/models/CircumplexMethodologyPanel';

describe('CircumplexMethodologyPanel', () => {
  it('shows tooltip help for both open and closed options', async () => {
    const user = userEvent.setup();

    render(<CircumplexMethodologyPanel open={false} onToggleOpen={() => {}} />);

    await act(async () => {
      await user.hover(screen.getByRole('button', { name: /methodology display options/i }));
    });

    expect(await screen.findByText(/closed:/i)).toBeInTheDocument();
    expect(screen.getByText(/open:/i)).toBeInTheDocument();
  });

  it('changes methodology mode through the dropdown', async () => {
    const user = userEvent.setup();
    const handleToggleOpen = vi.fn();

    render(<CircumplexMethodologyPanel open={false} onToggleOpen={handleToggleOpen} />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /closed/i }));
    });
    await act(async () => {
      await user.click(screen.getByRole('option', { name: 'Open' }));
    });

    expect(handleToggleOpen).toHaveBeenCalledWith(true);
  });

  it('renders the methodology text inline when open', () => {
    render(<CircumplexMethodologyPanel open={true} onToggleOpen={() => {}} />);

    expect(screen.getByText(/a value profile is the row of win rates/i)).toBeInTheDocument();
    expect(screen.getByText(/structural similarity/i)).toBeInTheDocument();
  });
});
