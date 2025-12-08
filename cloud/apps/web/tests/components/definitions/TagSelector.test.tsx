import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagSelector } from '../../../src/components/definitions/TagSelector';
import type { Tag } from '../../../src/api/operations/tags';
import { Provider } from 'urql';
import { fromValue, delay, pipe } from 'wonka';

// Mock tags for testing
const mockTags: Tag[] = [
  { id: 'tag-1', name: 'ethics', createdAt: '2024-01-15T10:00:00Z' },
  { id: 'tag-2', name: 'safety', createdAt: '2024-01-15T10:00:00Z' },
  { id: 'tag-3', name: 'privacy', createdAt: '2024-01-15T10:00:00Z' },
];

function createMockClient(tags: Tag[] = mockTags) {
  return {
    executeQuery: vi.fn(() =>
      pipe(
        fromValue({
          data: { tags },
        }),
        delay(0)
      )
    ),
    executeMutation: vi.fn(),
    executeSubscription: vi.fn(),
  };
}

function renderWithUrql(
  ui: React.ReactElement,
  { client = createMockClient() } = {}
) {
  return {
    ...render(
      <Provider value={client as never}>{ui}</Provider>
    ),
    client,
  };
}

describe('TagSelector', () => {
  const defaultProps = {
    selectedTags: [] as Tag[],
    onTagAdd: vi.fn(),
    onTagRemove: vi.fn(),
    onTagCreate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render "Add Tag" button', () => {
    renderWithUrql(<TagSelector {...defaultProps} />);
    expect(screen.getByText('Add Tag')).toBeInTheDocument();
  });

  it('should render selected tags with remove buttons', () => {
    const selectedTags: Tag[] = [
      { id: 'tag-1', name: 'ethics', createdAt: '2024-01-15T10:00:00Z' },
    ];

    renderWithUrql(<TagSelector {...defaultProps} selectedTags={selectedTags} />);

    expect(screen.getByText('ethics')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove ethics tag/i })).toBeInTheDocument();
  });

  it('should open dropdown when Add Tag is clicked', async () => {
    const user = userEvent.setup();
    renderWithUrql(<TagSelector {...defaultProps} />);

    await user.click(screen.getByText('Add Tag'));

    expect(screen.getByPlaceholderText('Search or create tag...')).toBeInTheDocument();
  });

  it('should close dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    renderWithUrql(
      <div>
        <div data-testid="outside">Outside</div>
        <TagSelector {...defaultProps} />
      </div>
    );

    await user.click(screen.getByText('Add Tag'));
    expect(screen.getByPlaceholderText('Search or create tag...')).toBeInTheDocument();

    await user.click(screen.getByTestId('outside'));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search or create tag...')).not.toBeInTheDocument();
    });
  });

  it('should filter tags based on search input', async () => {
    const user = userEvent.setup();
    renderWithUrql(<TagSelector {...defaultProps} />);

    await user.click(screen.getByText('Add Tag'));

    await waitFor(() => {
      expect(screen.getByText('ethics')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Search or create tag...'), 'saf');

    await waitFor(() => {
      expect(screen.getByText('safety')).toBeInTheDocument();
      expect(screen.queryByText('ethics')).not.toBeInTheDocument();
    });
  });

  it('should call onTagAdd when selecting a tag', async () => {
    const user = userEvent.setup();
    const onTagAdd = vi.fn();

    renderWithUrql(<TagSelector {...defaultProps} onTagAdd={onTagAdd} />);

    await user.click(screen.getByText('Add Tag'));

    await waitFor(() => {
      expect(screen.getByText('ethics')).toBeInTheDocument();
    });

    await user.click(screen.getByText('ethics'));

    expect(onTagAdd).toHaveBeenCalledWith('tag-1');
  });

  it('should call onTagRemove when clicking remove on selected tag', async () => {
    const user = userEvent.setup();
    const onTagRemove = vi.fn();
    const selectedTags: Tag[] = [
      { id: 'tag-1', name: 'ethics', createdAt: '2024-01-15T10:00:00Z' },
    ];

    renderWithUrql(
      <TagSelector {...defaultProps} selectedTags={selectedTags} onTagRemove={onTagRemove} />
    );

    await user.click(screen.getByRole('button', { name: /Remove ethics tag/i }));

    expect(onTagRemove).toHaveBeenCalledWith('tag-1');
  });

  it('should show create option when searching for non-existing tag', async () => {
    const user = userEvent.setup();
    renderWithUrql(<TagSelector {...defaultProps} />);

    await user.click(screen.getByText('Add Tag'));
    await user.type(screen.getByPlaceholderText('Search or create tag...'), 'newtag');

    await waitFor(() => {
      expect(screen.getByText(/Create "newtag"/)).toBeInTheDocument();
    });
  });

  it('should call onTagCreate when clicking create option', async () => {
    const user = userEvent.setup();
    const onTagCreate = vi.fn().mockResolvedValue(undefined);

    renderWithUrql(<TagSelector {...defaultProps} onTagCreate={onTagCreate} />);

    await user.click(screen.getByText('Add Tag'));
    await user.type(screen.getByPlaceholderText('Search or create tag...'), 'newtag');

    await waitFor(() => {
      expect(screen.getByText(/Create "newtag"/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Create "newtag"/));

    expect(onTagCreate).toHaveBeenCalledWith('newtag');
  });

  it('should not show already selected tags in dropdown', async () => {
    const user = userEvent.setup();
    const selectedTags: Tag[] = [
      { id: 'tag-1', name: 'ethics', createdAt: '2024-01-15T10:00:00Z' },
    ];

    renderWithUrql(<TagSelector {...defaultProps} selectedTags={selectedTags} />);

    await user.click(screen.getByText('Add Tag'));

    await waitFor(() => {
      // Only the selected tag should be visible in the selected area, not in dropdown
      const ethicsElements = screen.getAllByText('ethics');
      expect(ethicsElements).toHaveLength(1); // Only in selected tags, not in dropdown
    });
  });

  it('should disable Add Tag button when disabled prop is true', () => {
    renderWithUrql(<TagSelector {...defaultProps} disabled />);

    expect(screen.getByText('Add Tag').closest('button')).toBeDisabled();
  });

  it('should close dropdown on Escape key', async () => {
    const user = userEvent.setup();
    renderWithUrql(<TagSelector {...defaultProps} />);

    await user.click(screen.getByText('Add Tag'));
    expect(screen.getByPlaceholderText('Search or create tag...')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search or create tag...')).not.toBeInTheDocument();
    });
  });

  it('should create tag on Enter when search matches no existing tag', async () => {
    const user = userEvent.setup();
    const onTagCreate = vi.fn().mockResolvedValue(undefined);

    renderWithUrql(<TagSelector {...defaultProps} onTagCreate={onTagCreate} />);

    await user.click(screen.getByText('Add Tag'));
    await user.type(screen.getByPlaceholderText('Search or create tag...'), 'newtag{Enter}');

    expect(onTagCreate).toHaveBeenCalledWith('newtag');
  });
});
