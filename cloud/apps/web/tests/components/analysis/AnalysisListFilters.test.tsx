/**
 * AnalysisListFilters Component Tests
 *
 * Tests for the analysis list filters component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisListFilters, type AnalysisFilterState } from '../../../src/components/analysis/AnalysisListFilters';

// Mock useTags hook
vi.mock('../../../src/hooks/useTags', () => ({
  useTags: () => ({
    tags: [
      { id: 'tag-1', name: 'Ethics' },
      { id: 'tag-2', name: 'Safety' },
      { id: 'tag-3', name: 'Research' },
    ],
    loading: false,
    error: null,
  }),
}));

const defaultFilters: AnalysisFilterState = {
  analysisStatus: '',
  tagIds: [],
  viewMode: 'folder',
};

describe('AnalysisListFilters', () => {
  const mockOnFiltersChange = vi.fn();

  beforeEach(() => {
    mockOnFiltersChange.mockClear();
  });

  describe('Status Filter', () => {
    it('renders status dropdown with all options', () => {
      render(<AnalysisListFilters filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />);

      const select = screen.getByLabelText('Status:');
      expect(select).toBeInTheDocument();

      const options = within(select).getAllByRole('option');
      expect(options).toHaveLength(3);
      expect(options[0]).toHaveTextContent('All Analysis');
      expect(options[1]).toHaveTextContent('Current');
      expect(options[2]).toHaveTextContent('Superseded');
    });

    it('calls onFiltersChange when status changes', async () => {
      const user = userEvent.setup();
      render(<AnalysisListFilters filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />);

      const select = screen.getByLabelText('Status:');
      await user.selectOptions(select, 'CURRENT');

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        analysisStatus: 'CURRENT',
      });
    });

    it('shows correct selected value', () => {
      const filters = { ...defaultFilters, analysisStatus: 'SUPERSEDED' as const };
      render(<AnalysisListFilters filters={filters} onFiltersChange={mockOnFiltersChange} />);

      const select = screen.getByLabelText('Status:');
      expect(select).toHaveValue('SUPERSEDED');
    });
  });

  describe('Tag Filter', () => {
    it('renders tag dropdown button', () => {
      render(<AnalysisListFilters filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />);

      expect(screen.getByRole('button', { name: /Tags/i })).toBeInTheDocument();
    });

    it('shows tag count badge when tags are selected', () => {
      const filters = { ...defaultFilters, tagIds: ['tag-1', 'tag-2'] };
      render(<AnalysisListFilters filters={filters} onFiltersChange={mockOnFiltersChange} />);

      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('opens dropdown when clicked', async () => {
      const user = userEvent.setup();
      render(<AnalysisListFilters filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />);

      await user.click(screen.getByRole('button', { name: /Tags/i }));

      expect(screen.getByText('Ethics')).toBeInTheDocument();
      expect(screen.getByText('Safety')).toBeInTheDocument();
      expect(screen.getByText('Research')).toBeInTheDocument();
    });

    it('toggles tag selection', async () => {
      const user = userEvent.setup();
      render(<AnalysisListFilters filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />);

      await user.click(screen.getByRole('button', { name: /Tags/i }));
      await user.click(screen.getByText('Ethics'));

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        tagIds: ['tag-1'],
      });
    });

    it('removes tag from selection when clicked again', async () => {
      const user = userEvent.setup();
      const filters = { ...defaultFilters, tagIds: ['tag-1'] };
      render(<AnalysisListFilters filters={filters} onFiltersChange={mockOnFiltersChange} />);

      // Find the Tags dropdown button specifically (not "Clear tags")
      const tagsButtons = screen.getAllByRole('button', { name: /Tags/i });
      const tagsDropdown = tagsButtons.find(btn => !btn.textContent?.includes('Clear'));
      await user.click(tagsDropdown!);

      // Click on "Ethics" in the dropdown (first one in the list, which is in the dropdown)
      const ethicsButtons = screen.getAllByText('Ethics');
      // The dropdown button is a full-width button, click the first match in dropdown
      await user.click(ethicsButtons[0]);

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        tagIds: [],
      });
    });

    it('shows checkmark for selected tags in dropdown', async () => {
      const user = userEvent.setup();
      const filters = { ...defaultFilters, tagIds: ['tag-1'] };
      render(<AnalysisListFilters filters={filters} onFiltersChange={mockOnFiltersChange} />);

      // Find the Tags dropdown button specifically (not "Clear tags")
      const tagsButtons = screen.getAllByRole('button', { name: /Tags/i });
      const tagsDropdown = tagsButtons.find(btn => !btn.textContent?.includes('Clear'));
      await user.click(tagsDropdown!);

      // The Ethics tag row in the dropdown should have a checkmark
      // Find all buttons with Ethics and get the one that's in the dropdown (has ✓)
      const ethicsButtons = screen.getAllByRole('button', { name: /Ethics/i });
      const dropdownButton = ethicsButtons.find(btn => btn.textContent?.includes('✓'));
      expect(dropdownButton).toBeInTheDocument();
    });

    it('displays selected tags as chips', () => {
      const filters = { ...defaultFilters, tagIds: ['tag-1', 'tag-2'] };
      render(<AnalysisListFilters filters={filters} onFiltersChange={mockOnFiltersChange} />);

      // Should show tag chips outside the dropdown
      const ethicsChips = screen.getAllByText('Ethics');
      const safetyChips = screen.getAllByText('Safety');
      expect(ethicsChips.length).toBeGreaterThanOrEqual(1);
      expect(safetyChips.length).toBeGreaterThanOrEqual(1);
    });

    it('removes tag when clicking X on chip', async () => {
      const user = userEvent.setup();
      const filters = { ...defaultFilters, tagIds: ['tag-1'] };
      render(<AnalysisListFilters filters={filters} onFiltersChange={mockOnFiltersChange} />);

      const removeButton = screen.getByLabelText('Remove Ethics filter');
      await user.click(removeButton);

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        tagIds: [],
      });
    });

    it('shows clear tags button when tags are selected', () => {
      const filters = { ...defaultFilters, tagIds: ['tag-1'] };
      render(<AnalysisListFilters filters={filters} onFiltersChange={mockOnFiltersChange} />);

      expect(screen.getByRole('button', { name: /Clear tags/i })).toBeInTheDocument();
    });

    it('clears all tags when clicking clear button', async () => {
      const user = userEvent.setup();
      const filters = { ...defaultFilters, tagIds: ['tag-1', 'tag-2'] };
      render(<AnalysisListFilters filters={filters} onFiltersChange={mockOnFiltersChange} />);

      await user.click(screen.getByRole('button', { name: /Clear tags/i }));

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        tagIds: [],
      });
    });

    it('does not show clear button when no tags selected', () => {
      render(<AnalysisListFilters filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />);

      expect(screen.queryByRole('button', { name: /Clear tags/i })).not.toBeInTheDocument();
    });
  });

  describe('View Mode Toggle', () => {
    it('renders flat and folder view buttons', () => {
      render(<AnalysisListFilters filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />);

      expect(screen.getByRole('button', { name: 'List view' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Folder view (by tag)' })).toBeInTheDocument();
    });

    it('highlights folder view when active', () => {
      render(<AnalysisListFilters filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />);

      const folderButton = screen.getByRole('button', { name: 'Folder view (by tag)' });
      expect(folderButton).toHaveClass('bg-teal-50');
    });

    it('highlights flat view when active', () => {
      const filters = { ...defaultFilters, viewMode: 'flat' as const };
      render(<AnalysisListFilters filters={filters} onFiltersChange={mockOnFiltersChange} />);

      const listButton = screen.getByRole('button', { name: 'List view' });
      expect(listButton).toHaveClass('bg-teal-50');
    });

    it('calls onFiltersChange when switching to flat view', async () => {
      const user = userEvent.setup();
      render(<AnalysisListFilters filters={defaultFilters} onFiltersChange={mockOnFiltersChange} />);

      await user.click(screen.getByRole('button', { name: 'List view' }));

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...defaultFilters,
        viewMode: 'flat',
      });
    });

    it('calls onFiltersChange when switching to folder view', async () => {
      const user = userEvent.setup();
      const filters = { ...defaultFilters, viewMode: 'flat' as const };
      render(<AnalysisListFilters filters={filters} onFiltersChange={mockOnFiltersChange} />);

      await user.click(screen.getByRole('button', { name: 'Folder view (by tag)' }));

      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        ...filters,
        viewMode: 'folder',
      });
    });
  });

  describe('Combined Filters', () => {
    it('maintains all filter values when changing one', async () => {
      const user = userEvent.setup();
      const filters: AnalysisFilterState = {
        analysisStatus: 'CURRENT',
        tagIds: ['tag-1'],
        viewMode: 'flat',
      };
      render(<AnalysisListFilters filters={filters} onFiltersChange={mockOnFiltersChange} />);

      // Change view mode
      await user.click(screen.getByRole('button', { name: 'Folder view (by tag)' }));

      // Should preserve other filters
      expect(mockOnFiltersChange).toHaveBeenCalledWith({
        analysisStatus: 'CURRENT',
        tagIds: ['tag-1'],
        viewMode: 'folder',
      });
    });
  });
});
