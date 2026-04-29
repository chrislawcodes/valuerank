import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Models } from '../../src/pages/Models';
import { MODELS_ANALYSIS_QUERY } from '../../src/api/operations/modelsAnalysis';
import { LLM_MODELS_QUERY } from '../../src/api/operations/llm';

const useQueryMock = vi.fn();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
  };
});

vi.mock('../../src/hooks/useDomains', () => ({
  useDomains: () => ({
    domains: [
      { id: 'domain-a', name: 'Domain A' },
      { id: 'domain-b', name: 'Domain B' },
    ],
    queryLoading: false,
    error: null,
  }),
}));

function renderModelsPage() {
  return render(
    <MemoryRouter>
      <Models />
    </MemoryRouter>,
  );
}

describe('Models page', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementation((args: { query: { definitions: Array<{ kind: string; name?: { value: string } }> } }) => {
      const operationName = args.query.definitions.find((definition) => definition.kind === 'OperationDefinition')?.name?.value;

      if (operationName === 'DomainAvailableSignatures') {
        return [{
          data: {
            domainAvailableSignatures: [
              { signature: 'vnewtd', label: 'Default', isVirtual: true, temperature: 0 },
            ],
          },
          fetching: false,
          error: undefined,
        }];
      }

      if (operationName === 'ModelsAnalysis') {
        return [{
          data: {
            modelsAnalysis: {
              models: [
                {
                  modelId: 'model-a',
                  label: 'Model A',
                  values: [
                    {
                      valueKey: 'Achievement',
                      pooledWinRate: 62,
                      stabilityScore: 88,
                      eligibleDomainCount: 2,
                      domains: [],
                    },
                  ],
                },
              ],
            },
          },
          fetching: false,
          error: undefined,
        }];
      }

      if (operationName === 'LlmModels') {
        return [{
          data: {
            llmModels: [
              {
                id: 'model-a',
                providerId: 'provider-a',
                modelId: 'model-a',
                displayName: 'Model A',
                costInputPerMillion: 0,
                costOutputPerMillion: 0,
                status: 'ACTIVE',
                isDefault: true,
                isAvailable: true,
                apiConfig: null,
                createdAt: '2026-04-17T03:06:20.919Z',
                updatedAt: '2026-04-17T03:06:20.919Z',
              },
            ],
          },
          fetching: false,
          error: undefined,
        }];
      }

      return [{ data: undefined, fetching: false, error: undefined }];
    });
  });

  it('shows the report title, screenshot control, and a single-line model label', () => {
    renderModelsPage();

    expect(screen.getByRole('heading', { name: /model value preference overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /screenshot report/i })).toBeInTheDocument();
    expect(screen.getAllByText('Model A')).toHaveLength(2);
    expect(screen.queryByText('model-a')).not.toBeInTheDocument();
  });
});
