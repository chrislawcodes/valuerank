/**
 * ModelsPanel Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'urql';
import { fromValue, never } from 'wonka';
import { ModelsPanel } from '../../../src/components/settings/ModelsPanel';

// Mock client factory
function createMockClient(executeQuery: ReturnType<typeof vi.fn>) {
  return {
    executeQuery,
    executeMutation: vi.fn(() => fromValue({ data: { success: true } })),
    executeSubscription: vi.fn(() => never),
  };
}

function renderModelsPanel(mockClient: ReturnType<typeof createMockClient>) {
  return render(
    <Provider value={mockClient as never}>
      <ModelsPanel />
    </Provider>
  );
}

const mockProviders = [
  {
    id: 'provider-1',
    name: 'anthropic',
    displayName: 'Anthropic',
    isEnabled: true,
    requestsPerMinute: 60,
    maxParallelRequests: 10,
    models: [
      {
        id: 'model-1',
        modelId: 'claude-3-haiku-20240307',
        displayName: 'Claude 3 Haiku',
        status: 'ACTIVE',
        isDefault: true,
        releaseDate: '2024-03-07',
        contextWindow: 200000,
        costInputPerMillion: 0.25,
        costOutputPerMillion: 1.25,
      },
      {
        id: 'model-2',
        modelId: 'claude-3-5-sonnet-20241022',
        displayName: 'Claude 3.5 Sonnet',
        status: 'ACTIVE',
        isDefault: false,
        releaseDate: '2024-10-22',
        contextWindow: 200000,
        costInputPerMillion: 3.0,
        costOutputPerMillion: 15.0,
      },
      {
        id: 'model-3',
        modelId: 'claude-2',
        displayName: 'Claude 2',
        status: 'DEPRECATED',
        isDefault: false,
        releaseDate: '2023-07-11',
        contextWindow: 100000,
        costInputPerMillion: 8.0,
        costOutputPerMillion: 24.0,
      },
    ],
  },
  {
    id: 'provider-2',
    name: 'openai',
    displayName: 'OpenAI',
    isEnabled: true,
    requestsPerMinute: 100,
    maxParallelRequests: 20,
    models: [
      {
        id: 'model-4',
        modelId: 'gpt-4o',
        displayName: 'GPT-4o',
        status: 'ACTIVE',
        isDefault: false,
        releaseDate: '2024-05-13',
        contextWindow: 128000,
        costInputPerMillion: 5.0,
        costOutputPerMillion: 15.0,
      },
    ],
  },
];

describe('ModelsPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows loading state while fetching', () => {
    const mockClient = createMockClient(vi.fn(() => never));
    renderModelsPanel(mockClient);

    expect(screen.getByText('Loading models...')).toBeInTheDocument();
  });

  it('shows error state when query fails', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          error: { message: 'Failed to load models' },
          stale: false,
        })
      )
    );
    renderModelsPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Failed to load models')).toBeInTheDocument();
    });
  });

  it('shows empty state when no providers exist', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: [] },
          stale: false,
        })
      )
    );
    renderModelsPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('No providers configured')).toBeInTheDocument();
    });
    expect(
      screen.getByText('LLM providers need to be seeded in the database')
    ).toBeInTheDocument();
  });

  it('renders provider cards', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: mockProviders },
          stale: false,
        })
      )
    );
    renderModelsPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
    });
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
  });

  it('shows model counts on provider cards', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: mockProviders },
          stale: false,
        })
      )
    );
    renderModelsPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
    });

    // Check for active model counts (format: "X active models, Y deprecated")
    expect(screen.getByText(/2 active models?, 1 deprecated/)).toBeInTheDocument(); // Anthropic
    expect(screen.getByText(/1 active model$/)).toBeInTheDocument(); // OpenAI
  });

  it('expands provider card when clicked', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: mockProviders },
          stale: false,
        })
      )
    );
    renderModelsPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
    });

    // Click on the Anthropic provider card header
    const anthropicCard = screen.getByText('Anthropic').closest('button');
    if (anthropicCard) {
      fireEvent.click(anthropicCard);
    }

    await waitFor(() => {
      // Should show model names when expanded
      expect(screen.getByText('Claude 3 Haiku')).toBeInTheDocument();
      expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument();
    });
  });

  it('shows default badge on default model', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: mockProviders },
          stale: false,
        })
      )
    );
    renderModelsPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
    });

    // Expand provider
    const anthropicCard = screen.getByText('Anthropic').closest('button');
    if (anthropicCard) {
      fireEvent.click(anthropicCard);
    }

    await waitFor(() => {
      expect(screen.getByText('Default')).toBeInTheDocument();
    });
  });

  it('shows rate limit info when expanded', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: mockProviders },
          stale: false,
        })
      )
    );
    renderModelsPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
    });

    // Expand provider to see rate limits
    const anthropicCard = screen.getByText('Anthropic').closest('button');
    if (anthropicCard) {
      fireEvent.click(anthropicCard);
    }

    await waitFor(() => {
      // Rate limit format: "Rate limit: X/min, Y parallel"
      expect(screen.getByText(/Rate limit: 60\/min, 10 parallel/)).toBeInTheDocument();
    });
  });

  it('shows deprecated models when expanded', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: mockProviders },
          stale: false,
        })
      )
    );
    renderModelsPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
    });

    // Expand provider
    const anthropicCard = screen.getByText('Anthropic').closest('button');
    if (anthropicCard) {
      fireEvent.click(anthropicCard);
    }

    await waitFor(() => {
      expect(screen.getByText('Claude 2')).toBeInTheDocument();
    });
  });

  it('can toggle provider expansion', async () => {
    const mockClient = createMockClient(
      vi.fn(() =>
        fromValue({
          data: { llmProviders: mockProviders },
          stale: false,
        })
      )
    );
    renderModelsPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
    });

    const anthropicCard = screen.getByText('Anthropic').closest('button');
    if (!anthropicCard) throw new Error('Card not found');

    // Expand
    fireEvent.click(anthropicCard);
    await waitFor(() => {
      expect(screen.getByText('Claude 3 Haiku')).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(anthropicCard);
    await waitFor(() => {
      expect(screen.queryByText('Claude 3 Haiku')).not.toBeInTheDocument();
    });
  });
});
