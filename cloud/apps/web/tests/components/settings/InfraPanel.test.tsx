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

const mockLlmModels = [
  {
    id: 'model-3',
    modelId: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    costInputPerMillion: 0.15,
    costOutputPerMillion: 0.6,
    provider: {
      id: 'provider-2',
      name: 'openai',
      displayName: 'OpenAI',
    },
  },
];

const mockCodeGenSettingEnabled = {
  id: 'setting-1',
  key: 'scenario_expansion_use_code_generation',
  value: { enabled: true },
};

const mockCodeGenSettingDisabled = {
  id: 'setting-1',
  key: 'scenario_expansion_use_code_generation',
  value: { enabled: false },
};

// Helper to create a query handler that returns appropriate data based on query
function createQueryHandler(overrides: {
  llmProviders?: unknown;
  infraModel?: unknown;
  summarizerModel?: unknown;
  llmModels?: unknown;
  systemSetting?: unknown;
}) {
  return vi.fn((request: { query: unknown; variables?: Record<string, unknown> }) => {
    // Convert query to string for matching - handles both string and DocumentNode
    const queryString = typeof request.query === 'string'
      ? request.query
      : JSON.stringify(request.query);

    if (queryString.includes('llmProviders')) {
      return fromValue({
        data: { llmProviders: overrides.llmProviders ?? mockProviders },
        stale: false,
      });
    }

    if (queryString.includes('infraModel') || queryString.includes('InfraModel')) {
      // Check purpose to return correct infra model
      const purpose = request.variables?.purpose;
      if (purpose === 'summarizer') {
        return fromValue({
          data: { infraModel: overrides.summarizerModel ?? null },
          stale: false,
        });
      }
      return fromValue({
        data: { infraModel: overrides.infraModel ?? null },
        stale: false,
      });
    }

    if (queryString.includes('llmModels') || queryString.includes('LowestCostModel')) {
      return fromValue({
        data: { llmModels: overrides.llmModels ?? mockLlmModels },
        stale: false,
      });
    }

    if (queryString.includes('systemSetting') || queryString.includes('CodeGenerationSetting')) {
      return fromValue({
        data: { systemSetting: overrides.systemSetting ?? null },
        stale: false,
      });
    }

    // Default response
    return fromValue({ data: {}, stale: false });
  });
}

describe('InfraPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the panel header', async () => {
    const mockClient = createMockClient(
      createQueryHandler({ infraModel: mockInfraModel })
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
      createQueryHandler({ infraModel: mockInfraModel })
    );
    renderInfraPanel(mockClient);

    await waitFor(() => {
      expect(screen.getAllByText('Currently configured:').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Anthropic / Claude 3 Haiku')).toBeInTheDocument();
  });

  it('shows warning when no infra model configured', async () => {
    const mockClient = createMockClient(
      createQueryHandler({ infraModel: null })
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
      createQueryHandler({ infraModel: mockInfraModel })
    );
    renderInfraPanel(mockClient);

    await waitFor(() => {
      expect(screen.getAllByText('Provider').length).toBeGreaterThan(0);
    });
    // The select should have the placeholder option (multiple for scenario expansion and summarizer)
    expect(screen.getAllByText('Select a provider...').length).toBeGreaterThan(0);
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
      createQueryHandler({ llmProviders: providers, infraModel: null })
    );
    renderInfraPanel(mockClient);

    await waitFor(() => {
      // Enabled Provider appears in both scenario expansion and summarizer dropdowns
      expect(screen.getAllByText('Enabled Provider').length).toBeGreaterThan(0);
    });
    // Disabled provider should not be visible in options
    expect(screen.queryByText('Disabled Provider')).not.toBeInTheDocument();
  });

  it('displays info section about infrastructure models', async () => {
    const mockClient = createMockClient(
      createQueryHandler({ infraModel: mockInfraModel })
    );
    renderInfraPanel(mockClient);

    await waitFor(() => {
      expect(screen.getByText('About Infrastructure Models')).toBeInTheDocument();
    });
    expect(screen.getByText(/cost-efficient model.*is recommended/i)).toBeInTheDocument();
  });

  describe('Code Generation Section', () => {
    it('displays generation method section', async () => {
      const mockClient = createMockClient(
        createQueryHandler({
          infraModel: mockInfraModel,
          systemSetting: mockCodeGenSettingDisabled,
        })
      );
      renderInfraPanel(mockClient);

      await waitFor(() => {
        expect(screen.getByText('Generation Method')).toBeInTheDocument();
      });
      expect(screen.getByText('Use Code-based Generation')).toBeInTheDocument();
    });

    it('shows LLM generation enabled when code gen is disabled', async () => {
      const mockClient = createMockClient(
        createQueryHandler({
          infraModel: mockInfraModel,
          systemSetting: mockCodeGenSettingDisabled,
        })
      );
      renderInfraPanel(mockClient);

      await waitFor(() => {
        expect(screen.getByText('LLM generation enabled')).toBeInTheDocument();
      });
    });

    it('shows code generation enabled when setting is true', async () => {
      const mockClient = createMockClient(
        createQueryHandler({
          infraModel: mockInfraModel,
          systemSetting: mockCodeGenSettingEnabled,
        })
      );
      renderInfraPanel(mockClient);

      await waitFor(() => {
        expect(screen.getByText('Code generation enabled')).toBeInTheDocument();
      });
    });

    it('shows code generation toggle checkbox', async () => {
      const mockClient = createMockClient(
        createQueryHandler({
          infraModel: mockInfraModel,
          systemSetting: mockCodeGenSettingDisabled,
        })
      );
      renderInfraPanel(mockClient);

      await waitFor(() => {
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeInTheDocument();
        expect(checkbox).not.toBeChecked();
      });
    });

    it('displays trade-offs information', async () => {
      const mockClient = createMockClient(
        createQueryHandler({
          infraModel: mockInfraModel,
          systemSetting: null,
        })
      );
      renderInfraPanel(mockClient);

      await waitFor(() => {
        expect(screen.getByText('Trade-offs:')).toBeInTheDocument();
      });
      expect(screen.getByText('Code Generation')).toBeInTheDocument();
      expect(screen.getByText('LLM Generation')).toBeInTheDocument();
    });
  });

  describe('Summarizer Model Section', () => {
    it('displays summarizer model section', async () => {
      const mockClient = createMockClient(
        createQueryHandler({ infraModel: mockInfraModel })
      );
      renderInfraPanel(mockClient);

      await waitFor(() => {
        expect(screen.getByText('Transcript Summarization Model')).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Model used to summarize AI responses/)
      ).toBeInTheDocument();
    });

    it('shows lowest cost model fallback when no summarizer configured', async () => {
      const mockClient = createMockClient(
        createQueryHandler({
          infraModel: mockInfraModel,
          summarizerModel: null,
          llmModels: mockLlmModels,
        })
      );
      renderInfraPanel(mockClient);

      await waitFor(() => {
        expect(screen.getByText('Using lowest cost model')).toBeInTheDocument();
      });
      // GPT-4o Mini may appear in multiple places (model list and cost info)
      expect(screen.getAllByText(/GPT-4o Mini/).length).toBeGreaterThan(0);
    });

    it('shows configured summarizer model', async () => {
      const mockSummarizerModel = {
        id: 'model-3',
        modelId: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        provider: {
          id: 'provider-2',
          name: 'openai',
          displayName: 'OpenAI',
        },
      };

      const mockClient = createMockClient(
        createQueryHandler({
          infraModel: mockInfraModel,
          summarizerModel: mockSummarizerModel,
        })
      );
      renderInfraPanel(mockClient);

      await waitFor(() => {
        // Should show all configured messages (scenario expansion, summarizer, and parallelism)
        expect(screen.getAllByText('Currently configured:').length).toBe(3);
      });
      expect(screen.getByText('OpenAI / GPT-4o Mini')).toBeInTheDocument();
    });
  });
});
