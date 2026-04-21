import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModelsCircumplex } from '../../src/pages/ModelsCircumplex';
import { LLM_MODELS_QUERY } from '../../src/api/operations/llm';
import { CIRCUMPLEX_ANALYSIS_QUERY } from '../../src/api/operations/circumplex';
import type { CircumplexResult } from '../../src/api/operations/circumplex';

const useQueryMock = vi.fn();

function buildCircumplexResult(modelId: string, modelLabel: string): CircumplexResult {
  return {
    modelId,
    modelLabel,
    providerName: 'openai',
    signature: 'vnewtd',
    valueOrder: ['Self_Direction_Action', 'Universalism_Nature', 'Benevolence_Dependability'],
    profileCorrelationMatrix: [
      [1, 0.7, 0.2],
      [0.7, 1, 0.1],
      [0.2, 0.1, 1],
    ],
    pairTrialCounts: [
      [0, 20, 20],
      [20, 0, 20],
      [20, 20, 0],
    ],
    excludedValues: [],
    spearmanRho: -0.61,
    spearmanP: 0.012,
    verdictBand: 'clear',
    mds2d: [
      { valueKey: 'Self_Direction_Action', x: 0, y: 1, theoreticalAngleDeg: 90 },
      { valueKey: 'Universalism_Nature', x: 0.8, y: -0.1, theoreticalAngleDeg: 18 },
      { valueKey: 'Benevolence_Dependability', x: -0.6, y: -0.4, theoreticalAngleDeg: -54 },
    ],
    mdsStress: 0.08,
    mdsWarning: null,
    trialsPerValue: [
      { valueKey: 'Self_Direction_Action', trials: 8 },
      { valueKey: 'Universalism_Nature', trials: 8 },
      { valueKey: 'Benevolence_Dependability', trials: 8 },
    ],
  } as CircumplexResult;
}

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
              models: [buildCircumplexResult('model-a', 'Model A'), buildCircumplexResult('model-b', 'Model B')],
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
    expect(screen.getByTestId('circumplex-overlay-chart')).toBeInTheDocument();
    expect(screen.getAllByText('Model A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Model B').length).toBeGreaterThan(0);
  });

  it('shows estimated progress while circumplex data is loading', () => {
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
          data: undefined,
          fetching: true,
          error: undefined,
        }];
      }

      return [{ data: undefined, fetching: false, error: undefined }];
    });

    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={['/models/circumplex?signature=vnewtd&n=5&methodology=closed']}
      >
        <ModelsCircumplex />
      </MemoryRouter>,
    );

    expect(screen.getByRole('progressbar', { name: /estimated circumplex loading progress/i })).toHaveAttribute('aria-valuenow', '35');
    expect(screen.getByText(/Computing circumplex fit across models/i)).toBeInTheDocument();
    expect(screen.getByText(/2 models on/i)).toBeInTheDocument();
  });

  it('waits to start the circumplex query until model ids are available', () => {
    let circumplexPause: boolean | undefined;

    useQueryMock.mockImplementation((args: { query: unknown; pause?: boolean }) => {
      if (args.query === LLM_MODELS_QUERY) {
        return [{
          data: undefined,
          fetching: true,
          error: undefined,
        }];
      }

      if (args.query === CIRCUMPLEX_ANALYSIS_QUERY) {
        circumplexPause = args.pause;
        return [{
          data: undefined,
          fetching: false,
          error: undefined,
        }];
      }

      return [{ data: undefined, fetching: false, error: undefined }];
    });

    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={['/models/circumplex?signature=vnewtd&n=5&methodology=closed']}
      >
        <ModelsCircumplex />
      </MemoryRouter>,
    );

    expect(circumplexPause).toBe(true);
    expect(screen.getByRole('progressbar', { name: /estimated circumplex loading progress/i })).toBeInTheDocument();
  });
});
