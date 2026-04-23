import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  DomainValueShiftHeatmap,
  buildDomainShiftHeatmap,
  formatEvidenceWeight,
  formatPointShift,
  getDefaultModelId,
} from '../../src/pages/DomainValueShiftHeatmap';
import { MODELS_ANALYSIS_QUERY, type ModelsAnalysisModelResult } from '../../src/api/operations/modelsAnalysis';

const useQueryMock = vi.fn();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
  };
});

function makeModel(overrides: Partial<ModelsAnalysisModelResult> = {}): ModelsAnalysisModelResult {
  return {
    modelId: 'model-a',
    label: 'Model A',
    values: [
      {
        valueKey: 'Achievement',
        pooledWinRate: 60,
        stabilityScore: null,
        eligibleDomainCount: 3,
        domains: [
          { domainId: 'jobs', domainName: 'Jobs', winRate: 40, evidenceWeight: 2 },
          { domainId: 'city', domainName: 'City Planning', winRate: 80, evidenceWeight: null },
          { domainId: 'bad', domainName: 'Bad Data', winRate: Number.NaN, evidenceWeight: 3 },
        ],
      },
      {
        valueKey: 'Security_Personal',
        pooledWinRate: null,
        stabilityScore: null,
        eligibleDomainCount: 0,
        domains: [],
      },
      {
        valueKey: 'Novel_Value',
        pooledWinRate: 50,
        stabilityScore: null,
        eligibleDomainCount: 2,
        domains: [
          { domainId: 'jobs', domainName: 'Jobs', winRate: 55, evidenceWeight: 0 },
          { domainId: 'city', domainName: 'City Planning', winRate: 45, evidenceWeight: -1 },
        ],
      },
    ],
    ...overrides,
  };
}

function installModels(models: ModelsAnalysisModelResult[]) {
  useQueryMock.mockImplementation((args: { query: unknown }) => {
    if (args.query === MODELS_ANALYSIS_QUERY) {
      return [{
        data: { modelsAnalysis: { models } },
        fetching: false,
        error: undefined,
      }];
    }
    return [{ data: undefined, fetching: false, error: undefined }];
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DomainValueShiftHeatmap />
    </MemoryRouter>,
  );
}

describe('DomainValueShiftHeatmap helpers', () => {
  it('computes equal-domain averages and point shifts from eligible finite win rates', () => {
    const heatmap = buildDomainShiftHeatmap(makeModel());
    const achievement = heatmap.rows.find((row) => row.valueKey === 'Achievement');

    expect(heatmap.columns.map((column) => column.domainName)).toEqual(['City Planning', 'Jobs']);
    expect(achievement?.averageWinRate).toBe(60);
    expect(achievement?.averageMatchesPooled).toBe(true);
    expect(achievement?.cells.get('city')?.shift).toBe(20);
    expect(achievement?.cells.get('jobs')?.shift).toBe(-20);
    expect(achievement?.cells.has('bad')).toBe(false);
  });

  it('keeps canonical values with no eligible domains as n/a rows and appends unknown values stably', () => {
    const heatmap = buildDomainShiftHeatmap(makeModel());
    const security = heatmap.rows.find((row) => row.valueKey === 'Security_Personal');

    expect(security?.cells.size).toBe(0);
    expect(heatmap.rows.at(-1)?.valueKey).toBe('Novel_Value');
  });

  it('treats one-domain value rows as not comparable instead of fake zero shifts', () => {
    const heatmap = buildDomainShiftHeatmap(makeModel({
      values: [
        {
          valueKey: 'Achievement',
          pooledWinRate: 40,
          stabilityScore: null,
          eligibleDomainCount: 1,
          domains: [{ domainId: 'jobs', domainName: 'Jobs', winRate: 40, evidenceWeight: 1 }],
        },
        {
          valueKey: 'Tradition',
          pooledWinRate: 70,
          stabilityScore: null,
          eligibleDomainCount: 2,
          domains: [
            { domainId: 'city', domainName: 'City Planning', winRate: 80, evidenceWeight: 2 },
            { domainId: 'parks', domainName: 'Parks', winRate: 60, evidenceWeight: 2 },
          ],
        },
      ],
    }));
    const achievement = heatmap.rows.find((row) => row.valueKey === 'Achievement');
    const tradition = heatmap.rows.find((row) => row.valueKey === 'Tradition');

    expect(heatmap.columns.map((column) => column.domainName)).toEqual(['City Planning', 'Parks']);
    expect(achievement?.comparableDomainCount).toBe(1);
    expect(achievement?.averageWinRate).toBeNull();
    expect(achievement?.cells.size).toBe(0);
    expect(tradition?.cells.get('city')?.shift).toBe(10);
    expect(tradition?.cells.get('parks')?.shift).toBe(-10);
  });

  it('formats point shifts and unknown evidence without percent-change language', () => {
    expect(formatPointShift(12.4)).toBe('+12 pts');
    expect(formatPointShift(-8.6)).toBe('-9 pts');
    expect(formatPointShift(0.2)).toBe('0 pts');
    expect(formatEvidenceWeight(null)).toBe('—');
    expect(formatEvidenceWeight(0)).toBe('—');
    expect(formatEvidenceWeight(-1)).toBe('—');
    expect(formatEvidenceWeight(3)).toBe('3');
  });

  it('defaults to the sorted first available model and preserves a valid current selection', () => {
    const models = [
      makeModel({ modelId: 'model-b', label: 'Zulu' }),
      makeModel({ modelId: 'model-a', label: 'Alpha' }),
    ];

    expect(getDefaultModelId(models, null)).toBe('model-a');
    expect(getDefaultModelId(models, 'model-b')).toBe('model-b');
    expect(getDefaultModelId(models, 'missing')).toBe('model-a');
    expect(getDefaultModelId([], 'missing')).toBeNull();
  });
});

describe('DomainValueShiftHeatmap page', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it('renders the selected model heatmap with raw detail in accessible text', async () => {
    installModels([makeModel()]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Domain Shifts by Value' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /model a/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Achievement in City Planning: \+20 pts/i)).toHaveAccessibleName(
      /Domain win rate 80%; average 60%; evidence vignettes —/i,
    );
    expect(screen.getByText('Metric:')).toBeInTheDocument();
    expect(screen.getByText(/percentage-point shift, not percent change/i)).toBeInTheDocument();
  });

  it('lets the user select a different model', async () => {
    const user = userEvent.setup({ delay: null });
    installModels([
      makeModel({ modelId: 'model-b', label: 'Zulu' }),
      makeModel({ modelId: 'model-a', label: 'Alpha' }),
    ]);

    renderPage();

    expect(await screen.findByRole('button', { name: /alpha/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /alpha/i }));
    await user.click(screen.getByRole('option', { name: 'Zulu' }));

    expect(screen.getByRole('heading', { name: 'Zulu' })).toBeInTheDocument();
  });

  it('shows an empty state when fewer than two domains are eligible', async () => {
    installModels([
      makeModel({
        values: [
          {
            valueKey: 'Achievement',
            pooledWinRate: 40,
            stabilityScore: null,
            eligibleDomainCount: 1,
            domains: [{ domainId: 'jobs', domainName: 'Jobs', winRate: 40, evidenceWeight: 1 }],
          },
        ],
      }),
    ]);

    renderPage();

    expect(await screen.findByText('More domain coverage needed')).toBeInTheDocument();
    expect(screen.getByText(/two or more domains/i)).toBeInTheDocument();
  });

  it('shows the no-models empty state', async () => {
    installModels([]);

    renderPage();

    expect(await screen.findByText(/No models with analysis data/i)).toBeInTheDocument();
  });
});
