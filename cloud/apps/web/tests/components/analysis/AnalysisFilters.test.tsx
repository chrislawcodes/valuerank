/**
 * AnalysisFilters Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalysisFilters, filterByModels } from '../../../src/components/analysis/AnalysisFilters';
import type { FilterState } from '../../../src/components/analysis/AnalysisFilters';

describe('AnalysisFilters', () => {
  const defaultProps = {
    availableModels: ['gpt-4', 'claude-3', 'gemini'],
    availableValues: ['Physical_Safety', 'Compassion', 'Fair_Process'],
    filters: { selectedModels: [], selectedValue: null } as FilterState,
    onFilterChange: vi.fn(),
  };

  it('renders model filter buttons', () => {
    render(<AnalysisFilters {...defaultProps} />);

    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('claude-3')).toBeInTheDocument();
    expect(screen.getByText('gemini')).toBeInTheDocument();
  });

  it('renders value filter dropdown', () => {
    render(<AnalysisFilters {...defaultProps} />);

    expect(screen.getByLabelText('Value:')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All values' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Physical Safety' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Compassion' })).toBeInTheDocument();
  });

  it('calls onFilterChange when model is clicked', () => {
    const onFilterChange = vi.fn();
    render(<AnalysisFilters {...defaultProps} onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByText('gpt-4'));

    expect(onFilterChange).toHaveBeenCalledWith({
      selectedModels: ['gpt-4'],
      selectedValue: null,
    });
  });

  it('removes model from filter when clicked again', () => {
    const onFilterChange = vi.fn();
    render(
      <AnalysisFilters
        {...defaultProps}
        filters={{ selectedModels: ['gpt-4'], selectedValue: null }}
        onFilterChange={onFilterChange}
      />
    );

    fireEvent.click(screen.getByText('gpt-4'));

    expect(onFilterChange).toHaveBeenCalledWith({
      selectedModels: [],
      selectedValue: null,
    });
  });

  it('calls onFilterChange when value is selected', () => {
    const onFilterChange = vi.fn();
    render(<AnalysisFilters {...defaultProps} onFilterChange={onFilterChange} />);

    fireEvent.change(screen.getByLabelText('Value:'), {
      target: { value: 'Physical_Safety' },
    });

    expect(onFilterChange).toHaveBeenCalledWith({
      selectedModels: [],
      selectedValue: 'Physical_Safety',
    });
  });

  it('clears value filter when "All values" is selected', () => {
    const onFilterChange = vi.fn();
    render(
      <AnalysisFilters
        {...defaultProps}
        filters={{ selectedModels: [], selectedValue: 'Physical_Safety' }}
        onFilterChange={onFilterChange}
      />
    );

    fireEvent.change(screen.getByLabelText('Value:'), {
      target: { value: '' },
    });

    expect(onFilterChange).toHaveBeenCalledWith({
      selectedModels: [],
      selectedValue: null,
    });
  });

  it('shows clear filters button when filters are active', () => {
    render(
      <AnalysisFilters
        {...defaultProps}
        filters={{ selectedModels: ['gpt-4'], selectedValue: null }}
      />
    );

    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('hides clear filters button when no filters are active', () => {
    render(<AnalysisFilters {...defaultProps} />);

    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  it('clears all filters when clear button is clicked', () => {
    const onFilterChange = vi.fn();
    render(
      <AnalysisFilters
        {...defaultProps}
        filters={{ selectedModels: ['gpt-4', 'claude-3'], selectedValue: 'Physical_Safety' }}
        onFilterChange={onFilterChange}
      />
    );

    fireEvent.click(screen.getByText('Clear filters'));

    expect(onFilterChange).toHaveBeenCalledWith({
      selectedModels: [],
      selectedValue: null,
    });
  });

  it('shows active filter summary', () => {
    render(
      <AnalysisFilters
        {...defaultProps}
        filters={{ selectedModels: ['gpt-4', 'claude-3'], selectedValue: 'Physical_Safety' }}
      />
    );

    expect(screen.getByText('2 models')).toBeInTheDocument();
    // "Physical Safety" appears in both dropdown and summary, use getAllByText
    expect(screen.getAllByText('Physical Safety').length).toBeGreaterThan(0);
  });

  it('truncates long model names', () => {
    render(
      <AnalysisFilters
        {...defaultProps}
        availableModels={['very-long-model-name-that-exceeds-limit']}
      />
    );

    expect(screen.getByText('very-long-mo...')).toBeInTheDocument();
  });

  it('hides value filter when no values available', () => {
    render(<AnalysisFilters {...defaultProps} availableValues={[]} />);

    expect(screen.queryByLabelText('Value:')).not.toBeInTheDocument();
  });
});

describe('filterByModels', () => {
  it('returns all data when no models selected', () => {
    const data = { 'gpt-4': { a: 1 }, 'claude-3': { b: 2 } };
    const result = filterByModels(data, []);

    expect(result).toEqual(data);
  });

  it('filters to selected models', () => {
    const data = { 'gpt-4': { a: 1 }, 'claude-3': { b: 2 }, gemini: { c: 3 } };
    const result = filterByModels(data, ['gpt-4', 'gemini']);

    expect(result).toEqual({ 'gpt-4': { a: 1 }, gemini: { c: 3 } });
  });

  it('handles non-existent model in filter', () => {
    const data = { 'gpt-4': { a: 1 } };
    const result = filterByModels(data, ['gpt-4', 'non-existent']);

    expect(result).toEqual({ 'gpt-4': { a: 1 } });
  });
});
