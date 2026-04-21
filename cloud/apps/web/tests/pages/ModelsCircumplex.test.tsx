import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModelsCircumplex } from '../../src/pages/ModelsCircumplex';
import { LLM_MODELS_QUERY } from '../../src/api/operations/llm';
import { CIRCUMPLEX_ANALYSIS_QUERY } from '../../src/api/operations/circumplex';

const useQueryMock = vi.fn();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
  };
});

vi.mock('../../src/hooks/useAvailableSignatures', () => ({
  useAvailableSignatures: () => ({
    signatures: ['vnewtd'],
    defaultSignature: 'vnewtd',
    loading: false,
    error: undefined,
  }),
}));

vi.mock('../../src/components/models/CircumplexModelPicker', () => ({
  CircumplexModelPicker: () => <div>Mock circumplex model picker</div>,
}));

vi.mock('../../src/components/models/CircumplexModelCard', () => ({
  CircumplexModelCard: ({ result }: { result: { modelLabel: string } }) => <div>{result.modelLabel}</div>,
}));

describe('ModelsCircumplex', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementation((args: { query: unknown }) => {
      if (args.query === LLM_MODELS_QUERY) {
        return [{
          data: {
            llmModels: [
              { id: 'model-a', isDefault: true },
              { id: 'model-b', isDefault: false },
            ],
          },
          fetching: false,
          error: undefined,
        }];
      }

      if (args.query === CIRCUMPLEX_ANALYSIS_QUERY) {
        return [{
          data: {
            circumplexAnalysis: {
              models: [
                {
                  modelId: 'model-a',
                  modelLabel: 'Model A',
                  providerName: 'openai',
                  signature: 'vnewtd',
                  trialsPerValue: [{ valueKey: 'Achievement', trials: 8 }],
                },
                {
                  modelId: 'model-b',
                  modelLabel: 'Model B',
                  providerName: 'anthropic',
                  signature: 'vnewtd',
                  trialsPerValue: [{ valueKey: 'Achievement', trials: 8 }],
                },
              ],
              insufficient: [],
            },
          },
          fetching: false,
          error: undefined,
        }];
      }

      return [{ data: undefined, fetching: false, error: undefined }];
    });
  });

  it('keeps the header controls in one box and stacks selected cards vertically', () => {
    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={['/models/circumplex?signature=vnewtd&models=model-a,model-b&n=5&methodology=closed']}
      >
        <ModelsCircumplex />
      </MemoryRouter>,
    );

    const methodologyLabel = screen.getByText('How this is computed');
    const signatureLabel = screen.getByText('Signature');
    const thresholdLabel = screen.getByText('Minimum trials per value');

    expect(signatureLabel.closest('section')).toBe(thresholdLabel.closest('section'));
    expect(thresholdLabel.closest('section')).toBe(methodologyLabel.closest('section'));

    const stack = screen.getByTestId('circumplex-model-card-stack');
    expect(stack).toHaveClass('space-y-4');
    expect(stack).not.toHaveClass('xl:grid-cols-2');
    expect(screen.getByText('Model A')).toBeInTheDocument();
    expect(screen.getByText('Model B')).toBeInTheDocument();
  });
});
