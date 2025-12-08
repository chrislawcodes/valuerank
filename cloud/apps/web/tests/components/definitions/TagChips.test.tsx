import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagChips } from '../../../src/components/definitions/TagChips';
import type { Tag } from '../../../src/api/operations/tags';

function createMockTags(count: number): Tag[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `tag-${i + 1}`,
    name: `Tag ${i + 1}`,
    createdAt: '2024-01-15T10:00:00Z',
  }));
}

describe('TagChips', () => {
  it('should render nothing when tags array is empty', () => {
    const { container } = render(<TagChips tags={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render all tags when count is under maxDisplay', () => {
    const tags = createMockTags(3);
    render(<TagChips tags={tags} />);

    expect(screen.getByText('Tag 1')).toBeInTheDocument();
    expect(screen.getByText('Tag 2')).toBeInTheDocument();
    expect(screen.getByText('Tag 3')).toBeInTheDocument();
  });

  it('should limit displayed tags to maxDisplay', () => {
    const tags = createMockTags(6);
    render(<TagChips tags={tags} maxDisplay={4} />);

    expect(screen.getByText('Tag 1')).toBeInTheDocument();
    expect(screen.getByText('Tag 2')).toBeInTheDocument();
    expect(screen.getByText('Tag 3')).toBeInTheDocument();
    expect(screen.getByText('Tag 4')).toBeInTheDocument();
    expect(screen.queryByText('Tag 5')).not.toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('should call onRemove when remove button is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const tags = createMockTags(2);

    render(<TagChips tags={tags} onRemove={onRemove} />);

    const removeButtons = screen.getAllByRole('button', { name: /Remove .* tag/i });
    await user.click(removeButtons[0]);

    expect(onRemove).toHaveBeenCalledWith('tag-1');
  });

  it('should not render remove buttons when onRemove is not provided', () => {
    const tags = createMockTags(2);
    render(<TagChips tags={tags} />);

    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument();
  });

  it('should call onTagClick when tag is clicked', async () => {
    const user = userEvent.setup();
    const onTagClick = vi.fn();
    const tags = createMockTags(2);

    render(<TagChips tags={tags} onTagClick={onTagClick} />);

    await user.click(screen.getByText('Tag 1'));

    expect(onTagClick).toHaveBeenCalledWith(tags[0]);
  });

  it('should apply size classes correctly', () => {
    const tags = createMockTags(1);
    const { rerender } = render(<TagChips tags={tags} size="sm" />);

    const chip = screen.getByText('Tag 1');
    expect(chip.className).toContain('text-xs');

    rerender(<TagChips tags={tags} size="md" />);
    expect(screen.getByText('Tag 1').className).toContain('text-sm');
  });

  it('should apply custom className', () => {
    const tags = createMockTags(1);
    const { container } = render(<TagChips tags={tags} className="custom-class" />);

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should handle keyboard navigation for clickable tags', async () => {
    const user = userEvent.setup();
    const onTagClick = vi.fn();
    const tags = createMockTags(1);

    render(<TagChips tags={tags} onTagClick={onTagClick} />);

    const tagElement = screen.getByText('Tag 1');
    tagElement.focus();
    await user.keyboard('{Enter}');

    expect(onTagClick).toHaveBeenCalledWith(tags[0]);
  });

  it('should stop event propagation when removing a tag', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const parentClickHandler = vi.fn();
    const tags = createMockTags(1);

    render(
      <div onClick={parentClickHandler}>
        <TagChips tags={tags} onRemove={onRemove} />
      </div>
    );

    const removeButton = screen.getByRole('button', { name: /Remove/i });
    await user.click(removeButton);

    expect(onRemove).toHaveBeenCalled();
    expect(parentClickHandler).not.toHaveBeenCalled();
  });
});
