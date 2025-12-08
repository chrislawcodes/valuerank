/**
 * RunFilters Component Tests
 *
 * Tests for the run filters component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunFilters } from '../../../src/components/runs/RunFilters';

describe('RunFilters', () => {
  it('renders status filter dropdown', () => {
    render(<RunFilters status="" onStatusChange={() => {}} />);

    expect(screen.getByLabelText('Status:')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows all status options', () => {
    render(<RunFilters status="" onStatusChange={() => {}} />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('');

    // Check all options exist (8 options: All + 7 statuses including SUMMARIZING)
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(8);
    expect(options[0]).toHaveTextContent('All Statuses');
    expect(options[1]).toHaveTextContent('Running');
    expect(options[2]).toHaveTextContent('Pending');
    expect(options[3]).toHaveTextContent('Paused');
    expect(options[4]).toHaveTextContent('Summarizing');
    expect(options[5]).toHaveTextContent('Completed');
    expect(options[6]).toHaveTextContent('Failed');
    expect(options[7]).toHaveTextContent('Cancelled');
  });

  it('calls onStatusChange when selection changes', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(<RunFilters status="" onStatusChange={onStatusChange} />);

    await user.selectOptions(screen.getByRole('combobox'), 'RUNNING');

    expect(onStatusChange).toHaveBeenCalledWith('RUNNING');
  });

  it('reflects current status value', () => {
    render(<RunFilters status="COMPLETED" onStatusChange={() => {}} />);

    expect(screen.getByRole('combobox')).toHaveValue('COMPLETED');
  });

  it('allows clearing filter back to all', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(<RunFilters status="COMPLETED" onStatusChange={onStatusChange} />);

    await user.selectOptions(screen.getByRole('combobox'), '');

    expect(onStatusChange).toHaveBeenCalledWith('');
  });
});
