import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunFolderView } from '../../../src/components/runs/RunFolderView';

const mockTag1 = { id: 'tag-1', name: 'Safety' };
const mockTag2 = { id: 'tag-2', name: 'Ethics' };

const createRun = (id: string, definitionName: string, tags: typeof mockTag1[] = []) => ({
  id,
  definitionId: `def-${id}`,
  experimentId: null,
  status: 'COMPLETED' as const,
  config: { models: ['gpt-4o'] },
  progress: { total: 10, completed: 10, failed: 0 },
  runProgress: { total: 10, completed: 10, failed: 0, percentComplete: 100 },
  startedAt: '2024-01-15T10:00:00Z',
  completedAt: '2024-01-15T10:05:00Z',
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:05:00Z',
  lastAccessedAt: null,
  transcriptCount: 10,
  definition: {
    id: `def-${id}`,
    name: definitionName,
    tags,
  },
});

describe('RunFolderView', () => {
  it('returns null when no runs', () => {
    const onClick = vi.fn();
    const { container } = render(
      <RunFolderView runs={[]} onRunClick={onClick} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('displays tag folders for runs with tagged definitions', () => {
    const onClick = vi.fn();
    const runs = [
      createRun('run-1', 'Definition 1', [mockTag1]),
      createRun('run-2', 'Definition 2', [mockTag2]),
    ];

    render(<RunFolderView runs={runs} onRunClick={onClick} />);

    expect(screen.getByText('Safety')).toBeInTheDocument();
    expect(screen.getByText('Ethics')).toBeInTheDocument();
    expect(screen.getAllByText('(1)')).toHaveLength(2);
  });

  it('displays untagged folder for runs without tags', () => {
    const onClick = vi.fn();
    const runs = [createRun('run-1', 'Untagged Definition', [])];

    render(<RunFolderView runs={runs} onRunClick={onClick} />);

    expect(screen.getByText('Untagged')).toBeInTheDocument();
  });

  it('toggles folder when clicked', () => {
    const onClick = vi.fn();
    const runs = [createRun('run-1', 'Test Definition', [mockTag1])];

    render(<RunFolderView runs={runs} onRunClick={onClick} />);

    // Initially collapsed - run should not be visible
    expect(screen.queryByText('Test Definition')).not.toBeInTheDocument();

    // Click folder header to expand
    const folderButtons = screen.getAllByRole('button');
    const safetyFolderButton = folderButtons.find((btn) =>
      btn.textContent?.includes('Safety') && btn.classList.contains('w-full')
    );
    fireEvent.click(safetyFolderButton!);

    expect(screen.getByText('Test Definition')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(safetyFolderButton!);
    expect(screen.queryByText('Test Definition')).not.toBeInTheDocument();
  });

  it('expands all folders when Expand all is clicked', () => {
    const onClick = vi.fn();
    const runs = [
      createRun('run-1', 'Definition 1', [mockTag1]),
      createRun('run-2', 'Definition 2', [mockTag2]),
    ];

    render(<RunFolderView runs={runs} onRunClick={onClick} />);

    // Initially collapsed
    expect(screen.queryByText('Definition 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Definition 2')).not.toBeInTheDocument();

    // Click expand all
    fireEvent.click(screen.getByText('Expand all'));

    // Both should be visible
    expect(screen.getByText('Definition 1')).toBeInTheDocument();
    expect(screen.getByText('Definition 2')).toBeInTheDocument();
  });

  it('collapses all folders when Collapse all is clicked', () => {
    const onClick = vi.fn();
    const runs = [
      createRun('run-1', 'Definition 1', [mockTag1]),
      createRun('run-2', 'Definition 2', [mockTag2]),
    ];

    render(<RunFolderView runs={runs} onRunClick={onClick} />);

    // First expand all
    fireEvent.click(screen.getByText('Expand all'));
    expect(screen.getByText('Definition 1')).toBeInTheDocument();

    // Then collapse all
    fireEvent.click(screen.getByText('Collapse all'));
    expect(screen.queryByText('Definition 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Definition 2')).not.toBeInTheDocument();
  });

  it('calls onRunClick when run card is clicked', () => {
    const onClick = vi.fn();
    const run = createRun('run-1', 'Test Definition', [mockTag1]);

    render(<RunFolderView runs={[run]} onRunClick={onClick} />);

    // Expand folder first
    fireEvent.click(screen.getByText('Expand all'));

    // Click on run
    fireEvent.click(screen.getByText('Test Definition'));
    expect(onClick).toHaveBeenCalledWith('run-1');
  });

  it('groups runs by tag correctly', () => {
    const onClick = vi.fn();
    const runs = [
      createRun('run-1', 'Definition 1', [mockTag1]),
      createRun('run-2', 'Definition 2', [mockTag1]),
      createRun('run-3', 'Definition 3', [mockTag2]),
    ];

    render(<RunFolderView runs={runs} onRunClick={onClick} />);

    // Safety should have 2 runs
    expect(screen.getByText('Safety').parentElement).toHaveTextContent('(2)');

    // Ethics should have 1 run
    expect(screen.getByText('Ethics').parentElement).toHaveTextContent('(1)');
  });

  it('shows run in multiple folders when definition has multiple tags', () => {
    const onClick = vi.fn();
    const runs = [createRun('run-1', 'Multi-tagged Definition', [mockTag1, mockTag2])];

    render(<RunFolderView runs={runs} onRunClick={onClick} />);

    // Expand both folders
    fireEvent.click(screen.getByText('Expand all'));

    // Run should appear in both folders
    const definitionNames = screen.getAllByText('Multi-tagged Definition');
    expect(definitionNames).toHaveLength(2);
  });

  it('sorts folders alphabetically by tag name', () => {
    const onClick = vi.fn();
    const tagZ = { id: 'tag-z', name: 'Zeta' };
    const tagA = { id: 'tag-a', name: 'Alpha' };
    const runs = [
      createRun('run-1', 'Definition 1', [tagZ]),
      createRun('run-2', 'Definition 2', [tagA]),
    ];

    render(<RunFolderView runs={runs} onRunClick={onClick} />);

    const buttons = screen.getAllByRole('button');
    const folderButtons = buttons.filter((b) => b.classList.contains('w-full'));

    expect(folderButtons[0].textContent).toContain('Alpha');
    expect(folderButtons[1].textContent).toContain('Zeta');
  });

  it('toggles untagged folder correctly', () => {
    const onClick = vi.fn();
    const runs = [createRun('run-1', 'Untagged Definition', [])];

    render(<RunFolderView runs={runs} onRunClick={onClick} />);

    // Initially collapsed
    expect(screen.queryByText('Untagged Definition')).not.toBeInTheDocument();

    // Expand untagged folder
    const untaggedButton = screen.getAllByRole('button').find((btn) =>
      btn.textContent?.includes('Untagged') && btn.classList.contains('w-full')
    );
    fireEvent.click(untaggedButton!);
    expect(screen.getByText('Untagged Definition')).toBeInTheDocument();

    // Collapse
    fireEvent.click(untaggedButton!);
    expect(screen.queryByText('Untagged Definition')).not.toBeInTheDocument();
  });

  it('handles runs with definitions that have no tags', () => {
    const onClick = vi.fn();
    const run = {
      ...createRun('run-1', 'Definition without tags', []),
      definition: {
        id: 'def-1',
        name: 'Definition without tags',
        tags: [],
      },
    };

    render(<RunFolderView runs={[run]} onRunClick={onClick} />);

    expect(screen.getByText('Untagged')).toBeInTheDocument();
  });

  it('includes untagged in expand all', () => {
    const onClick = vi.fn();
    const runs = [
      createRun('run-1', 'Tagged Definition', [mockTag1]),
      createRun('run-2', 'Untagged Definition', []),
    ];

    render(<RunFolderView runs={runs} onRunClick={onClick} />);

    // Expand all should expand both tagged and untagged folders
    fireEvent.click(screen.getByText('Expand all'));

    expect(screen.getByText('Tagged Definition')).toBeInTheDocument();
    expect(screen.getByText('Untagged Definition')).toBeInTheDocument();
  });

  it('handles runs where definition is undefined', () => {
    const onClick = vi.fn();
    const run = {
      ...createRun('run-1', 'Test', []),
      definition: undefined,
    };

    render(<RunFolderView runs={[run]} onRunClick={onClick} />);

    // Should show in untagged since definition is undefined
    expect(screen.getByText('Untagged')).toBeInTheDocument();
  });
});
