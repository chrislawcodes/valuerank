import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DefinitionFolderView } from '../../../src/components/definitions/DefinitionFolderView';

const mockTag1 = { id: 'tag-1', name: 'Safety', createdAt: '2024-01-01T00:00:00Z' };
const mockTag2 = { id: 'tag-2', name: 'Ethics', createdAt: '2024-01-01T00:00:00Z' };

const createDefinition = (id: string, name: string, tags: typeof mockTag1[] = []) => ({
  id,
  name,
  description: `Description for ${name}`,
  tags,
  allTags: tags,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  scenarioCount: 5,
  content: {},
});

describe('DefinitionFolderView', () => {
  it('returns null when no definitions', () => {
    const onClick = vi.fn();
    const { container } = render(
      <DefinitionFolderView definitions={[]} onDefinitionClick={onClick} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('displays tag folders for tagged definitions', () => {
    const onClick = vi.fn();
    const definitions = [
      createDefinition('def-1', 'Definition 1', [mockTag1]),
      createDefinition('def-2', 'Definition 2', [mockTag2]),
    ];

    render(
      <DefinitionFolderView definitions={definitions} onDefinitionClick={onClick} />
    );

    expect(screen.getByText('Safety')).toBeInTheDocument();
    expect(screen.getByText('Ethics')).toBeInTheDocument();
    expect(screen.getAllByText('(1)')).toHaveLength(2); // count for each folder
  });

  it('displays untagged folder for definitions without tags', () => {
    const onClick = vi.fn();
    const definitions = [createDefinition('def-1', 'Untagged Definition', [])];

    render(
      <DefinitionFolderView definitions={definitions} onDefinitionClick={onClick} />
    );

    expect(screen.getByText('Untagged')).toBeInTheDocument();
  });

  it('toggles folder when clicked', () => {
    const onClick = vi.fn();
    const definitions = [createDefinition('def-1', 'Definition 1', [mockTag1])];

    render(
      <DefinitionFolderView definitions={definitions} onDefinitionClick={onClick} />
    );

    // Initially collapsed - definition name should not be visible
    expect(screen.queryByText('Definition 1')).not.toBeInTheDocument();

    // Click folder header to expand
    const folderButtons = screen.getAllByRole('button');
    const safetyFolderButton = folderButtons.find((btn) =>
      btn.textContent?.includes('Safety') && btn.classList.contains('w-full')
    );
    fireEvent.click(safetyFolderButton!);
    expect(screen.getByText('Definition 1')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(safetyFolderButton!);
    expect(screen.queryByText('Definition 1')).not.toBeInTheDocument();
  });

  it('expands all folders when Expand all is clicked', () => {
    const onClick = vi.fn();
    const definitions = [
      createDefinition('def-1', 'Definition 1', [mockTag1]),
      createDefinition('def-2', 'Definition 2', [mockTag2]),
    ];

    render(
      <DefinitionFolderView definitions={definitions} onDefinitionClick={onClick} />
    );

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
    const definitions = [
      createDefinition('def-1', 'Definition 1', [mockTag1]),
      createDefinition('def-2', 'Definition 2', [mockTag2]),
    ];

    render(
      <DefinitionFolderView definitions={definitions} onDefinitionClick={onClick} />
    );

    // First expand all
    fireEvent.click(screen.getByText('Expand all'));
    expect(screen.getByText('Definition 1')).toBeInTheDocument();
    expect(screen.getByText('Definition 2')).toBeInTheDocument();

    // Then collapse all
    fireEvent.click(screen.getByText('Collapse all'));
    expect(screen.queryByText('Definition 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Definition 2')).not.toBeInTheDocument();
  });

  it('calls onDefinitionClick when definition is clicked', () => {
    const onClick = vi.fn();
    const definition = createDefinition('def-1', 'Definition 1', [mockTag1]);

    render(
      <DefinitionFolderView
        definitions={[definition]}
        onDefinitionClick={onClick}
      />
    );

    // Expand folder first
    fireEvent.click(screen.getByText('Safety'));

    // Click on definition
    fireEvent.click(screen.getByText('Definition 1'));
    expect(onClick).toHaveBeenCalledWith(definition);
  });

  it('groups definitions by tag correctly', () => {
    const onClick = vi.fn();
    const definitions = [
      createDefinition('def-1', 'Definition 1', [mockTag1]),
      createDefinition('def-2', 'Definition 2', [mockTag1]),
      createDefinition('def-3', 'Definition 3', [mockTag2]),
    ];

    render(
      <DefinitionFolderView definitions={definitions} onDefinitionClick={onClick} />
    );

    // Safety should have 2 definitions
    expect(screen.getByText('Safety').parentElement).toHaveTextContent('(2)');

    // Ethics should have 1 definition
    expect(screen.getByText('Ethics').parentElement).toHaveTextContent('(1)');
  });

  it('shows definition in multiple folders when it has multiple tags', () => {
    const onClick = vi.fn();
    const definitions = [
      createDefinition('def-1', 'Multi-tagged Definition', [mockTag1, mockTag2]),
    ];

    render(
      <DefinitionFolderView definitions={definitions} onDefinitionClick={onClick} />
    );

    // Expand both folders
    fireEvent.click(screen.getByText('Expand all'));

    // Definition should appear in both folders
    const definitionCards = screen.getAllByText('Multi-tagged Definition');
    expect(definitionCards).toHaveLength(2);
  });

  it('sorts folders alphabetically by tag name', () => {
    const onClick = vi.fn();
    const tagZ = { id: 'tag-z', name: 'Zeta', createdAt: '2024-01-01T00:00:00Z' };
    const tagA = { id: 'tag-a', name: 'Alpha', createdAt: '2024-01-01T00:00:00Z' };
    const definitions = [
      createDefinition('def-1', 'Definition 1', [tagZ]),
      createDefinition('def-2', 'Definition 2', [tagA]),
    ];

    render(
      <DefinitionFolderView definitions={definitions} onDefinitionClick={onClick} />
    );

    const buttons = screen.getAllByRole('button');
    // First button after expand/collapse should be Alpha
    const folderNames = buttons
      .slice(2) // Skip "Expand all" and "Collapse all" (they're text nodes, not buttons, so this won't work)
      .map((b) => b.textContent);

    expect(folderNames[0]).toContain('Alpha');
    expect(folderNames[1]).toContain('Zeta');
  });

  it('toggles untagged folder correctly', () => {
    const onClick = vi.fn();
    const definitions = [createDefinition('def-1', 'Untagged Definition', [])];

    render(
      <DefinitionFolderView definitions={definitions} onDefinitionClick={onClick} />
    );

    // Initially collapsed
    expect(screen.queryByText('Untagged Definition')).not.toBeInTheDocument();

    // Expand untagged folder
    fireEvent.click(screen.getByText('Untagged'));
    expect(screen.getByText('Untagged Definition')).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByText('Untagged'));
    expect(screen.queryByText('Untagged Definition')).not.toBeInTheDocument();
  });

  it('does not show Expand/Collapse all when only untagged definitions', () => {
    const onClick = vi.fn();
    const definitions = [createDefinition('def-1', 'Untagged Definition', [])];

    render(
      <DefinitionFolderView definitions={definitions} onDefinitionClick={onClick} />
    );

    expect(screen.queryByText('Expand all')).not.toBeInTheDocument();
    expect(screen.queryByText('Collapse all')).not.toBeInTheDocument();
  });

  it('uses allTags when available', () => {
    const onClick = vi.fn();
    const definition = {
      id: 'def-1',
      name: 'Definition with allTags',
      description: 'Test',
      tags: [], // Empty tags
      allTags: [mockTag1], // But has allTags
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      scenarioCount: 5,
      content: {},
    };

    render(
      <DefinitionFolderView definitions={[definition]} onDefinitionClick={onClick} />
    );

    // Should show Safety folder since allTags has mockTag1
    expect(screen.getByText('Safety')).toBeInTheDocument();
  });

  it('falls back to tags when allTags is undefined', () => {
    const onClick = vi.fn();
    const definition = {
      id: 'def-1',
      name: 'Definition without allTags',
      description: 'Test',
      tags: [mockTag2],
      allTags: undefined as unknown as typeof mockTag2[],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      scenarioCount: 5,
      content: {},
    };

    render(
      <DefinitionFolderView definitions={[definition]} onDefinitionClick={onClick} />
    );

    // Should show Ethics folder since tags has mockTag2
    expect(screen.getByText('Ethics')).toBeInTheDocument();
  });
});
