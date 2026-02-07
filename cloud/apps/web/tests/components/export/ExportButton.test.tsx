/**
 * ExportButton Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportButton } from '../../../src/components/export/ExportButton';
import * as exportApi from '../../../src/api/export';

vi.mock('../../../src/api/export', () => ({
  exportDefinitionAsMd: vi.fn(),
  exportScenariosAsYaml: vi.fn(),
}));

describe('ExportButton', () => {
  const mockDefinitionId = 'test-definition-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders export button', () => {
    render(<ExportButton definitionId={mockDefinitionId} />);

    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('opens dropdown when clicked', async () => {
    const user = userEvent.setup();
    render(<ExportButton definitionId={mockDefinitionId} />);

    const button = screen.getByRole('button', { name: /export/i });
    await user.click(button);

    expect(screen.getByText('Vignette (Markdown)')).toBeInTheDocument();
    expect(screen.getByText('Scenarios (YAML)')).toBeInTheDocument();
  });

  it('closes dropdown when clicked again', async () => {
    const user = userEvent.setup();
    render(<ExportButton definitionId={mockDefinitionId} />);

    const button = screen.getByRole('button', { name: /export/i });
    await user.click(button);
    expect(screen.getByText('Vignette (Markdown)')).toBeInTheDocument();

    await user.click(button);
    expect(screen.queryByText('Vignette (Markdown)')).not.toBeInTheDocument();
  });

  it('exports definition as markdown when option clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(exportApi.exportDefinitionAsMd).mockResolvedValue(undefined);

    render(<ExportButton definitionId={mockDefinitionId} />);

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByText('Vignette (Markdown)'));

    await waitFor(() => {
      expect(exportApi.exportDefinitionAsMd).toHaveBeenCalledWith(mockDefinitionId);
    });
  });

  it('exports scenarios as YAML when option clicked and scenarios available', async () => {
    const user = userEvent.setup();
    vi.mocked(exportApi.exportScenariosAsYaml).mockResolvedValue(undefined);

    render(<ExportButton definitionId={mockDefinitionId} hasScenarios={true} />);

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByText('Scenarios (YAML)'));

    await waitFor(() => {
      expect(exportApi.exportScenariosAsYaml).toHaveBeenCalledWith(mockDefinitionId);
    });
  });

  it('disables YAML export when no scenarios', async () => {
    const user = userEvent.setup();
    render(<ExportButton definitionId={mockDefinitionId} hasScenarios={false} />);

    await user.click(screen.getByRole('button', { name: /export/i }));

    const yamlButton = screen.getByText('Scenarios (YAML)').closest('button');
    expect(yamlButton).toBeDisabled();
    expect(screen.getByText('Generate scenarios first')).toBeInTheDocument();
  });

  it('shows error when export fails', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Network error';
    vi.mocked(exportApi.exportDefinitionAsMd).mockRejectedValue(new Error(errorMessage));

    render(<ExportButton definitionId={mockDefinitionId} />);

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByText('Vignette (Markdown)'));

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('closes dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ExportButton definitionId={mockDefinitionId} />
        <button>Outside</button>
      </div>
    );

    await user.click(screen.getByRole('button', { name: /export/i }));
    expect(screen.getByText('Vignette (Markdown)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /outside/i }));

    await waitFor(() => {
      expect(screen.queryByText('Vignette (Markdown)')).not.toBeInTheDocument();
    });
  });

  it('applies custom className', () => {
    render(<ExportButton definitionId={mockDefinitionId} className="custom-class" />);

    const container = screen.getByRole('button', { name: /export/i }).parentElement;
    expect(container).toHaveClass('custom-class');
  });

  it('disables button while exporting', async () => {
    const user = userEvent.setup();
    // Create a promise that we control
    let resolveExport: () => void;
    const exportPromise = new Promise<void>((resolve) => {
      resolveExport = resolve;
    });
    vi.mocked(exportApi.exportDefinitionAsMd).mockReturnValue(exportPromise);

    render(<ExportButton definitionId={mockDefinitionId} />);

    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(screen.getByText('Vignette (Markdown)'));

    // Button should be disabled while exporting
    const button = screen.getByRole('button', { name: /export/i });
    expect(button).toBeDisabled();

    // Complete the export
    resolveExport!();

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });
});
