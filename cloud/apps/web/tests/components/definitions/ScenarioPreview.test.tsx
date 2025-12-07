import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScenarioPreview } from '../../../src/components/definitions/ScenarioPreview';
import type { DefinitionContent } from '../../../src/api/operations/definitions';

function createMockContent(overrides: Partial<DefinitionContent> = {}): DefinitionContent {
  return {
    schema_version: 1,
    preamble: 'Test preamble',
    template: 'You encounter a [situation] involving [actor].',
    dimensions: [
      {
        name: 'situation',
        levels: [
          { score: 1, label: 'minor' },
          { score: 2, label: 'moderate' },
        ],
      },
      {
        name: 'actor',
        levels: [
          { score: 1, label: 'stranger' },
          { score: 2, label: 'friend' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('ScenarioPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render Preview Scenarios button', () => {
    render(<ScenarioPreview content={createMockContent()} />);
    expect(screen.getByText('Preview Scenarios')).toBeInTheDocument();
  });

  it('should show total count on button when content is valid', () => {
    render(<ScenarioPreview content={createMockContent()} />);
    // 2 x 2 = 4 total scenarios
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('should open preview panel when button is clicked', async () => {
    const user = userEvent.setup();
    render(<ScenarioPreview content={createMockContent()} />);

    await user.click(screen.getByText('Preview Scenarios'));

    expect(screen.getByText('Scenario Preview')).toBeInTheDocument();
    expect(screen.getByText('Scenario 1')).toBeInTheDocument();
  });

  it('should show scenario count in panel', async () => {
    const user = userEvent.setup();
    render(<ScenarioPreview content={createMockContent()} />);

    await user.click(screen.getByText('Preview Scenarios'));

    expect(screen.getByText(/Showing 4 of 4 possible scenarios/)).toBeInTheDocument();
  });

  it('should show limited scenarios with sample message', async () => {
    const user = userEvent.setup();
    render(<ScenarioPreview content={createMockContent()} maxSamples={2} />);

    await user.click(screen.getByText('Preview Scenarios'));

    expect(screen.getByText(/Showing 2 of 4 possible scenarios/)).toBeInTheDocument();
  });

  it('should expand scenario when clicked', async () => {
    const user = userEvent.setup();
    render(<ScenarioPreview content={createMockContent()} />);

    await user.click(screen.getByText('Preview Scenarios'));
    await user.click(screen.getByText('Scenario 1'));

    // Should show dimension values and filled template
    expect(screen.getAllByText(/situation:/).length).toBeGreaterThan(0);
    expect(screen.getByText(/You encounter a minor/)).toBeInTheDocument();
  });

  it('should show error when content is invalid', async () => {
    const user = userEvent.setup();
    render(<ScenarioPreview content={createMockContent({ template: '' })} />);

    await user.click(screen.getByText('Preview Scenarios'));

    expect(screen.getByText('Cannot generate preview')).toBeInTheDocument();
    expect(screen.getByText('Template is empty')).toBeInTheDocument();
  });

  it('should close panel when Close is clicked', async () => {
    const user = userEvent.setup();
    render(<ScenarioPreview content={createMockContent()} />);

    await user.click(screen.getByText('Preview Scenarios'));
    expect(screen.getByText('Scenario Preview')).toBeInTheDocument();

    await user.click(screen.getByText('Close'));
    expect(screen.queryByText('Scenario Preview')).not.toBeInTheDocument();
  });

  it('should toggle scenario expansion', async () => {
    const user = userEvent.setup();
    render(<ScenarioPreview content={createMockContent()} />);

    await user.click(screen.getByText('Preview Scenarios'));
    await user.click(screen.getByText('Scenario 1'));

    // Should be expanded
    expect(screen.getByText(/You encounter a minor/)).toBeInTheDocument();

    // Click again to collapse
    await user.click(screen.getByText('Scenario 1'));

    // Content should be hidden (the template text)
    expect(screen.queryByText(/You encounter a minor involving stranger/)).not.toBeInTheDocument();
  });

  it('should show dimension values as chips', async () => {
    const user = userEvent.setup();
    render(<ScenarioPreview content={createMockContent()} />);

    await user.click(screen.getByText('Preview Scenarios'));
    await user.click(screen.getByText('Scenario 1'));

    // Should show dimension chips
    expect(screen.getByText('situation:')).toBeInTheDocument();
    expect(screen.getByText('actor:')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <ScenarioPreview content={createMockContent()} className="custom-class" />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should show empty state when no dimensions', async () => {
    const user = userEvent.setup();
    render(<ScenarioPreview content={createMockContent({ dimensions: [] })} />);

    await user.click(screen.getByText('Preview Scenarios'));

    expect(screen.getByText(/No dimensions defined/)).toBeInTheDocument();
  });
});
