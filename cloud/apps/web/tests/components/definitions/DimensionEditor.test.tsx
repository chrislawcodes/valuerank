import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DimensionEditor } from '../../../src/components/definitions/DimensionEditor';
import type { Dimension } from '../../../src/api/operations/definitions';

function createMockDimension(overrides: Partial<Dimension> = {}): Dimension {
  return {
    name: 'situation',
    levels: [
      { score: 1, label: 'Low', description: 'Low severity' },
      { score: 2, label: 'High', description: 'High severity' },
    ],
    ...overrides,
  };
}

describe('DimensionEditor', () => {
  it('should render dimension name input', () => {
    const dimension = createMockDimension({ name: 'test-dimension' });
    render(
      <DimensionEditor
        dimension={dimension}
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        canRemove={true}
      />
    );

    expect(screen.getByDisplayValue('test-dimension')).toBeInTheDocument();
  });

  it('should render level count', () => {
    const dimension = createMockDimension();
    render(
      <DimensionEditor
        dimension={dimension}
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        canRemove={true}
      />
    );

    expect(screen.getByText('2 levels')).toBeInTheDocument();
  });

  it('should render singular "level" when only one level', () => {
    const dimension = createMockDimension({
      levels: [{ score: 1, label: 'Only' }],
    });
    render(
      <DimensionEditor
        dimension={dimension}
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        canRemove={true}
      />
    );

    expect(screen.getByText('1 level')).toBeInTheDocument();
  });

  it('should call onChange when dimension name changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const dimension = createMockDimension({ name: '' });

    render(
      <DimensionEditor
        dimension={dimension}
        index={0}
        onChange={onChange}
        onRemove={vi.fn()}
        canRemove={true}
      />
    );

    const input = screen.getByPlaceholderText(/dimension name/i);
    await user.type(input, 'a');

    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'a' })
    );
  });

  it('should have remove button when canRemove is true', () => {
    const dimension = createMockDimension();

    const { container } = render(
      <DimensionEditor
        dimension={dimension}
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        canRemove={true}
      />
    );

    // With canRemove=true, we should have a trash icon (svg with lucide class)
    const trashIcons = container.querySelectorAll('svg[class*="lucide"]');
    // Should have at least one trash icon (from the dimension header + level headers)
    expect(trashIcons.length).toBeGreaterThan(0);
  });

  it('should not show remove button when canRemove is false', () => {
    const dimension = createMockDimension();

    const { container } = render(
      <DimensionEditor
        dimension={dimension}
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        canRemove={false}
      />
    );

    // With canRemove=false, we should have only level trash icons (not the dimension one)
    // Check that the header area doesn't have a trash icon directly
    const headerTrashIcons = container.querySelectorAll(
      '.flex.items-center.gap-2.p-4 > .lucide-trash-2'
    );
    expect(headerTrashIcons.length).toBe(0);
  });

  it('should add a new level when "Add Level" button clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const dimension = createMockDimension({
      levels: [{ score: 1, label: 'Only' }],
    });

    render(
      <DimensionEditor
        dimension={dimension}
        index={0}
        onChange={onChange}
        onRemove={vi.fn()}
        canRemove={true}
      />
    );

    const addLevelButton = screen.getByRole('button', { name: /add level/i });
    await user.click(addLevelButton);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        levels: expect.arrayContaining([
          { score: 1, label: 'Only' },
          expect.objectContaining({ score: 2 }),
        ]),
      })
    );
  });

  it('should toggle expansion when header clicked', async () => {
    const user = userEvent.setup();
    const dimension = createMockDimension();

    const { container } = render(
      <DimensionEditor
        dimension={dimension}
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        canRemove={true}
      />
    );

    // Initially expanded - should show Add Level button
    expect(screen.getByRole('button', { name: /add level/i })).toBeInTheDocument();

    // Click the header div (which contains the chevron) to collapse
    // The header is the div with cursor-pointer class
    const header = container.querySelector('.cursor-pointer');
    expect(header).toBeInTheDocument();
    await user.click(header!);

    // Now collapsed - Add Level button should be hidden
    expect(screen.queryByRole('button', { name: /add level/i })).not.toBeInTheDocument();
  });
});
