import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DefinitionCard } from '../../../src/components/definitions/DefinitionCard';
import type { Definition } from '../../../src/api/operations/definitions';

function createMockDefinition(overrides: Partial<Definition> = {}): Definition {
  return {
    id: 'def-1',
    name: 'Test Definition',
    parentId: null,
    runCount: 0,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    tags: [],
    children: [],
    ...overrides,
  };
}

describe('DefinitionCard', () => {
  it('should render definition name', () => {
    const definition = createMockDefinition({ name: 'My Scenario Definition' });
    render(<DefinitionCard definition={definition} />);
    expect(screen.getByText('My Scenario Definition')).toBeInTheDocument();
  });

  it('should render formatted creation date', () => {
    const definition = createMockDefinition({
      createdAt: '2024-03-20T10:00:00Z',
    });
    render(<DefinitionCard definition={definition} />);
    expect(screen.getByText('Mar 20, 2024')).toBeInTheDocument();
  });

  it('should render run count', () => {
    const definition = createMockDefinition({ runCount: 5 });
    render(<DefinitionCard definition={definition} />);
    expect(screen.getByText('5 runs')).toBeInTheDocument();
  });

  it('should render singular "run" when runCount is 1', () => {
    const definition = createMockDefinition({ runCount: 1 });
    render(<DefinitionCard definition={definition} />);
    expect(screen.getByText('1 run')).toBeInTheDocument();
  });

  it('should render "Fork" badge when definition has parent', () => {
    const definition = createMockDefinition({ parentId: 'parent-def-1' });
    render(<DefinitionCard definition={definition} />);
    expect(screen.getByText('Fork')).toBeInTheDocument();
  });

  it('should not render "Fork" badge when definition has no parent', () => {
    const definition = createMockDefinition({ parentId: null });
    render(<DefinitionCard definition={definition} />);
    expect(screen.queryByText('Fork')).not.toBeInTheDocument();
  });

  it('should render fork count when definition has children', () => {
    const definition = createMockDefinition({
      children: [{ id: 'child-1' }, { id: 'child-2' }],
    });
    render(<DefinitionCard definition={definition} />);
    expect(screen.getByText('2 forks')).toBeInTheDocument();
  });

  it('should render singular "fork" when has 1 child', () => {
    const definition = createMockDefinition({
      children: [{ id: 'child-1' }],
    });
    render(<DefinitionCard definition={definition} />);
    expect(screen.getByText('1 fork')).toBeInTheDocument();
  });

  it('should not render fork count when definition has no children', () => {
    const definition = createMockDefinition({ children: [] });
    render(<DefinitionCard definition={definition} />);
    expect(screen.queryByText(/fork/)).not.toBeInTheDocument();
  });

  it('should render tags', () => {
    const definition = createMockDefinition({
      tags: [
        { id: 'tag-1', name: 'ethics' },
        { id: 'tag-2', name: 'safety' },
      ],
    });
    render(<DefinitionCard definition={definition} />);
    expect(screen.getByText('ethics')).toBeInTheDocument();
    expect(screen.getByText('safety')).toBeInTheDocument();
  });

  it('should show first 4 tags and "+N more" for additional tags', () => {
    const definition = createMockDefinition({
      tags: [
        { id: 'tag-1', name: 'ethics' },
        { id: 'tag-2', name: 'safety' },
        { id: 'tag-3', name: 'privacy' },
        { id: 'tag-4', name: 'fairness' },
        { id: 'tag-5', name: 'transparency' },
        { id: 'tag-6', name: 'accountability' },
      ],
    });
    render(<DefinitionCard definition={definition} />);
    expect(screen.getByText('ethics')).toBeInTheDocument();
    expect(screen.getByText('safety')).toBeInTheDocument();
    expect(screen.getByText('privacy')).toBeInTheDocument();
    expect(screen.getByText('fairness')).toBeInTheDocument();
    expect(screen.queryByText('transparency')).not.toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('should call onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const definition = createMockDefinition();
    render(<DefinitionCard definition={definition} onClick={onClick} />);

    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should be a button element for accessibility', () => {
    const definition = createMockDefinition();
    render(<DefinitionCard definition={definition} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
