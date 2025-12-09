/**
 * InfraPanel Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'urql';
import { fromValue, never } from 'wonka';
import { InfraPanel } from '../../../src/components/settings/InfraPanel';

// Mock client factory
function createMockClient(executeQuery: ReturnType<typeof vi.fn>) {
  return {
    executeQuery,
    executeMutation: vi.fn(() =>
      fromValue({ data: { updateSystemSetting: { success: true } } })
    ),
    executeSubscription: vi.fn(() => never),
  };
}

function renderInfraPanel(mockClient: ReturnType<typeof createMockClient>) {
  return render(
    <Provider value={mockClient as never}>
      <InfraPanel />
    </Provider>
  );
}

const mockProviders = [
  {
    id: 'provider-1',
    name: 'anthropic',
    displayName: 'Anthropic',
    isEnabled: true,
    models: [
      {
        id: 'model-1',
        modelId: 'claude-3-haiku-20240307',
        displayName: 'Claude 3 Haiku',
        status: 'ACTIVE',
        costInputPerMillion: 0.25,
        costOutputPerMillion: 1.25,
      },
      {
        id: 'model-2',
        modelId: 'claude-3-5-sonnet-20241022',
        displayName: 'Claude 3.5 Sonnet',
        status: 'ACTIVE',
        costInputPerMillion: 3.0,
        costOutputPerMillion: 15.0,
      },
    ],
  },
  {
    id: 'provider-2',
    name: 'openai',
    displayName: 'OpenAI',
    isEnabled: true,
    models: [
      {
        id: 'model-3',
        modelId: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        status: 'ACTIVE',
        costInputPerMillion: 0.15,
        costOutputPerMillion: 0.6,
      },
    ],
  },
];

const mockInfraModel = {
  id: 'model-1',
  modelId: 'claude-3-haiku-20240307',
  displayName: 'Claude 3 Haiku',
  provider: {
    id: 'provider-1',
    name: 'anthropic',
    displayName: 'Anthropic',
  },
};

describe('InfraPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the panel header', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: mockProviders, infraModel: mockInfraModel },
          stale: false,
        })
      )
    );
    renderInfraPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Scenario Expansion Model')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Model used for expanding scenario definitions/)
    ).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    const mockClient = createMockClient(vi.fn(() => never));
    renderInfraPanel(mockClient);

    expect(screen.getByText('Loading configuration...')).toBeInTheDocument();
  });

  it('shows error state when providers fail to load', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          error: { message: 'Failed to load providers' },
          stale: false,
        })
      )
    );
    renderInfraPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Failed to load providers')).toBeInTheDocument();
    });
  });

  it('displays current configuration when infra model is set', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: mockProviders, infraModel: mockInfraModel },
          stale: false,
        })
      )
    );
    renderInfraPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Currently configured:')).toBeInTheDocument();
    });
    expect(screen.getByText('Anthropic / Claude 3 Haiku')).toBeInTheDocument();
  });

  it('shows warning when no infra model configured', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: mockProviders, infraModel: null },
          stale: false,
        })
      )
    );
    renderInfraPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('No model configured')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/System will use default.*until you configure one/)
    ).toBeInTheDocument();
  });

  it('displays provider selection dropdown', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: mockProviders, infraModel: mockInfraModel },
          stale: false,
        })
      )
    );
    renderInfraPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Provider')).toBeInTheDocument();
    });
    // The select should have the placeholder option
    expect(screen.getByText('Select a provider...')).toBeInTheDocument();
  });

  it('shows only enabled providers in dropdown', async () => {
    const providers = [
      {
        id: 'enabled',
        name: 'enabled-provider',
        displayName: 'Enabled Provider',
        isEnabled: true,
        models: [],
      },
      {
        id: 'disabled',
        name: 'disabled-provider',
        displayName: 'Disabled Provider',
        isEnabled: false,
        models: [],
      },
    ];

    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: providers, infraModel: null },
          stale: false,
        })
      )
    );
    renderInfraPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Enabled Provider')).toBeInTheDocument();
    });
    // Disabled provider should not be visible in options
    expect(screen.queryByText('Disabled Provider')).not.toBeInTheDocument();
  });

  it('displays info section about infrastructure models', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: mockProviders, infraModel: mockInfraModel },
          stale: false,
        })
      )
    );
    renderInfraPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('About Infrastructure Models')).toBeInTheDocument();
    });
    expect(screen.getByText(/cost-efficient model.*is recommended/i)).toBeInTheDocument();
  });
});
