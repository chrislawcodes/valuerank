import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  ALL_MODELS_OPTION_VALUE,
  buildDomainShiftHeatmap,
  buildDomainShiftModelOptions,
  formatEvidenceWeight,
  formatPointShift,
  formatPercent,
  getDefaultDomainShiftSignature,
  getDefaultModelId,
  sortHeatmapRows,
} from '../../src/pages/domainValueShiftHeatmapUtils';
import { DomainValueShiftHeatmap } from '../../src/pages/DomainValueShiftHeatmap';
import { type ModelsAnalysisModelResult } from '../../src/api/operations/modelsAnalysis';
import { type Domain } from '../../src/api/operations/domains';

const useQueryMock = vi.fn();
const useDomainsMock = vi.fn();

function getOperationName(query: unknown): string | null {
  const typedQuery = query as {
    definitions?: Array<{ kind?: string; name?: { value?: string } }>;
    loc?: { source?: { body?: string } };
  } | null;
  const definitions = typedQuery?.definitions ?? [];
  const operationName = definitions.find((definition) => definition.kind === 'OperationDefinition' && definition.name?.value)?.name?.value;
  if (operationName != null) {
    return operationName;
  }

  const body = typedQuery?.loc?.source?.body ?? '';
  if (body.includes('query ModelsAnalysis')) return 'ModelsAnalysis';
  if (body.includes('query AvailableSignatures')) return 'AvailableSignatures';
  if (body.includes('query LlmModels')) return 'LlmModels';
  return null;
}

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
  };
});

vi.mock('../../src/hooks/useDomains', () => ({
  useDomains: () => useDomainsMock(),
}));

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

function installModels(
  models: ModelsAnalysisModelResult[],
  signatures: string[] = ['vnewtd', 'vnewt0'],
  defaultModelIds: string[] = models.map((model) => model.modelId),
) {
  useQueryMock.mockImplementation((args: { query: unknown }) => {
    const operationName = getOperationName(args.query);
    const variables = (args as { variables?: Record<string, unknown> }).variables ?? {};

    if (
      operationName === 'AvailableSignatures'
      || (Object.keys(variables).length === 0 && !('status' in variables) && !('signature' in variables) && !('domainId' in variables) && !('providerId' in variables))
    ) {
      return [{
        data: {
          availableSignatures: signatures.map((signature) => ({
            signature,
            mostRecentRunAt: '2026-04-17T03:06:20.919Z',
          })),
        },
        fetching: false,
        error: undefined,
      }];
    }
    if (operationName === 'LlmModels' || variables.status === 'ACTIVE') {
      return [{
        data: {
          llmModels: models.map((model) => ({
            id: model.modelId,
            providerId: 'provider',
            modelId: model.modelId,
            displayName: model.label,
            costInputPerMillion: 0,
            costOutputPerMillion: 0,
            status: 'ACTIVE',
            isDefault: defaultModelIds.includes(model.modelId),
            isAvailable: true,
            apiConfig: null,
            createdAt: '2026-04-17T03:06:20.919Z',
            updatedAt: '2026-04-17T03:06:20.919Z',
          })),
        },
        fetching: false,
        error: undefined,
      }];
    }
    if (operationName === 'ModelsAnalysis' || 'signature' in variables || 'domainId' in variables) {
      return [{
        data: { modelsAnalysis: { models } },
        fetching: false,
        error: undefined,
      }];
    }
    return [{ data: undefined, fetching: false, error: undefined }];
  });
}

function installDomains(
  domains: Domain[] = [
    { id: 'jobs', name: 'Jobs', description: null },
    { id: 'city', name: 'City Planning', description: null },
  ],
) {
  useDomainsMock.mockReturnValue({
    domains,
    loading: false,
    queryLoading: false,
    creating: false,
    renaming: false,
    deleting: false,
    assigningByIds: false,
    assigningByFilter: false,
    runningDomainTrials: false,
    error: null,
    refetch: vi.fn(),
    createDomain: vi.fn(),
    renameDomain: vi.fn(),
    deleteDomain: vi.fn(),
    assignDomainToDefinitions: vi.fn(),
    assignDomainToDefinitionsByFilter: vi.fn(),
    runTrialsForDomain: vi.fn(),
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
    expect(formatPointShift(12.4)).toBe('+12.4 pts');
    expect(formatPointShift(-8.6)).toBe('-8.6 pts');
    expect(formatPointShift(0.2)).toBe('+0.2 pts');
    expect(formatPercent(42.34)).toBe('42.3%');
    expect(formatEvidenceWeight(null)).toBe('—');
    expect(formatEvidenceWeight(0)).toBe('—');
    expect(formatEvidenceWeight(-1)).toBe('—');
    expect(formatEvidenceWeight(3)).toBe('3.0');
  });

  it('averages domain win rates across multiple models', () => {
    const heatmap = buildDomainShiftHeatmap([
      makeModel({
        modelId: 'model-a',
        label: 'Model A',
        values: [
          {
            valueKey: 'Achievement',
            pooledWinRate: 60,
            stabilityScore: null,
            eligibleDomainCount: 2,
            domains: [
              { domainId: 'city', domainName: 'City Planning', winRate: 40, evidenceWeight: 2 },
              { domainId: 'jobs', domainName: 'Jobs', winRate: 80, evidenceWeight: 2 },
            ],
          },
        ],
      }),
      makeModel({
        modelId: 'model-b',
        label: 'Model B',
        values: [
          {
            valueKey: 'Achievement',
            pooledWinRate: 50,
            stabilityScore: null,
            eligibleDomainCount: 2,
            domains: [
              { domainId: 'city', domainName: 'City Planning', winRate: 60, evidenceWeight: 4 },
              { domainId: 'jobs', domainName: 'Jobs', winRate: 40, evidenceWeight: 6 },
            ],
          },
        ],
      }),
    ]);
    const achievement = heatmap.rows.find((row) => row.valueKey === 'Achievement');

    expect(heatmap.columns.map((column) => column.domainName)).toEqual(['City Planning', 'Jobs']);
    expect(achievement?.averageWinRate).toBe(55);
    expect(achievement?.pooledWinRate).toBe(55);
    expect(achievement?.averageMatchesPooled).toBe(true);
    expect(achievement?.cells.get('city')?.winRate).toBe(50);
    expect(achievement?.cells.get('jobs')?.winRate).toBe(60);
  });

  it('puts the all-models option first and keeps grouped models after it', () => {
    const options = buildDomainShiftModelOptions(
      [
        makeModel({ modelId: 'model-c', label: 'Charlie' }),
        makeModel({ modelId: 'model-a', label: 'Alpha' }),
        makeModel({ modelId: 'model-b', label: 'Bravo' }),
      ],
      new Set(['model-c', 'model-a']),
    );

    expect(options.map((option) => option.label)).toEqual(['Default models', 'Alpha', 'Charlie', '---', 'Bravo']);
    expect(options[0]?.value).toBe(ALL_MODELS_OPTION_VALUE);
  });

  it('sorts domain columns by the visible metric mode', () => {
    const heatmap = buildDomainShiftHeatmap(makeModel({
      values: [
        {
          valueKey: 'Achievement',
          pooledWinRate: 30,
          stabilityScore: null,
          eligibleDomainCount: 2,
          domains: [
            { domainId: 'city', domainName: 'City Planning', winRate: 60, evidenceWeight: 2 },
            { domainId: 'jobs', domainName: 'Jobs', winRate: 0, evidenceWeight: 2 },
          ],
        },
        {
          valueKey: 'Tradition',
          pooledWinRate: 79,
          stabilityScore: null,
          eligibleDomainCount: 2,
          domains: [
            { domainId: 'city', domainName: 'City Planning', winRate: 80, evidenceWeight: 2 },
            { domainId: 'jobs', domainName: 'Jobs', winRate: 78, evidenceWeight: 2 },
          ],
        },
      ],
    }));
    const sort = { key: 'domain:city' as const, direction: 'desc' as const };

    expect(sortHeatmapRows(heatmap.rows, sort, 'shift')[0]?.valueKey).toBe('Achievement');
    expect(sortHeatmapRows(heatmap.rows, sort, 'winRate')[0]?.valueKey).toBe('Tradition');
  });

  it('defaults to the sorted first available model and preserves a valid current selection', () => {
    const models = [
      makeModel({ modelId: 'model-b', label: 'Zulu' }),
      makeModel({ modelId: 'model-a', label: 'Alpha' }),
    ];

    expect(getDefaultModelId(models, null)).toBe(ALL_MODELS_OPTION_VALUE);
    expect(getDefaultModelId(models, ALL_MODELS_OPTION_VALUE)).toBe(ALL_MODELS_OPTION_VALUE);
    expect(getDefaultModelId(models, 'model-b')).toBe('model-b');
    expect(getDefaultModelId(models, 'missing')).toBe(ALL_MODELS_OPTION_VALUE);
    expect(getDefaultModelId([], 'missing')).toBe(ALL_MODELS_OPTION_VALUE);
  });

  it('defaults signature selection to latest default temperature', () => {
    expect(getDefaultDomainShiftSignature(['vnewt0'], null)).toBe('vnewtd');
    expect(getDefaultDomainShiftSignature(['vnewtd', 'vnewt0'], 'vnewt0')).toBe('vnewt0');
    expect(getDefaultDomainShiftSignature(['vnewtd'], 'missing')).toBe('vnewtd');
  });
});

describe('DomainValueShiftHeatmap page', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useDomainsMock.mockReset();
    installDomains();
  });

  it('renders the selected model heatmap with raw detail in accessible text', async () => {
    const user = userEvent.setup({ delay: null });
    installModels([makeModel()]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Model A' })).toBeInTheDocument();
    });
    expect(screen.getByRole('table')).toHaveClass('table-auto');
    await user.click(screen.getByRole('button', { name: /default — 1 model/i }));
    expect(screen.getByRole('button', { name: /default models/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signature: latest @ default/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sort by Avg Win Rate descending/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sort by Value descending/i })).toHaveTextContent('Value↓');
    expect(screen.getByLabelText(/Achievement in City Planning: raw win rate 80\.0%; shift \+20\.0 pts/i)).toHaveAccessibleName(
      /average 60\.0%; average evidence vignettes —/i,
    );
    expect(screen.getByText('Metric:')).toBeInTheDocument();
    expect(screen.getByText(/percentage-point shift, not percent change/i)).toBeInTheDocument();

    const firstDataRow = screen.getAllByRole('row')[1];
    expect(within(firstDataRow).getAllByRole('rowheader')[0]).toHaveTextContent('Achievement');
    expect(within(firstDataRow).getAllByRole('cell')[0]).toHaveTextContent('60.0%');
    expect(within(firstDataRow).getAllByRole('cell')[1]).toHaveClass('bg-emerald-100');
  });

  it('passes the selected signature to the models analysis query', async () => {
    const user = userEvent.setup({ delay: null });
    installModels([makeModel()]);

    renderPage();

    await screen.findByRole('button', { name: /default — 1 model/i });
    const initialModelsCalls = useQueryMock.mock.calls.filter(([args]: [{ query: unknown }]) => getOperationName(args.query) === 'ModelsAnalysis');
    expect(initialModelsCalls.at(-1)?.[0]).toEqual(expect.objectContaining({
      variables: { signature: 'vnewtd' },
    }));

    await user.click(screen.getByRole('button', { name: /Latest @ default/i }));
    await user.click(screen.getByRole('option', { name: 'Latest @ t=0' }));

    const updatedModelsCalls = useQueryMock.mock.calls.filter(([args]: [{ query: unknown }]) => getOperationName(args.query) === 'ModelsAnalysis');
    expect(updatedModelsCalls.at(-1)?.[0]).toEqual(expect.objectContaining({
      variables: { signature: 'vnewt0' },
    }));
  });

  it('toggles cells from shifts to raw win rates', async () => {
    const user = userEvent.setup({ delay: null });
    installModels([makeModel()]);

    renderPage();

    expect(await screen.findByText('+20.0 pts')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Raw win rate' }));

    expect(screen.getByRole('button', { name: 'Raw win rate' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText(/raw domain win rate/i)).toBeInTheDocument();
  });

  it('sorts table rows when a domain column header is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    installModels([makeModel()]);

    renderPage();

    await screen.findByRole('button', { name: /Sort by City Planning descending/i });
    await user.click(screen.getByRole('button', { name: /Sort by City Planning descending/i }));

    const firstDataRow = screen.getAllByRole('row')[1];
    expect(firstDataRow).toBeDefined();
    expect(within(firstDataRow as HTMLElement).getByRole('rowheader', { name: 'Achievement' })).toBeInTheDocument();
  });

  it('toggles active sort arrows between highest-first and lowest-first', async () => {
    const user = userEvent.setup({ delay: null });
    installModels([makeModel()]);

    renderPage();

    expect(await screen.findByRole('button', { name: /Sort by Value descending/i })).toHaveTextContent('Value↓');

    await user.click(screen.getByRole('button', { name: /Sort by Avg Win Rate descending/i }));

    expect(screen.getByRole('button', { name: /Sort by Avg Win Rate ascending/i })).toHaveTextContent('Avg Win Rate↑');
  });

  it('lets the user select a different model', async () => {
    const user = userEvent.setup({ delay: null });
    installModels([
      makeModel({ modelId: 'model-b', label: 'Zulu' }),
      makeModel({ modelId: 'model-a', label: 'Alpha' }),
    ]);

    renderPage();

    expect(await screen.findByText('Default — 2 models')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /default — 2 models/i }));
    await user.click(screen.getByRole('button', { name: 'Alpha' }));

    expect(screen.getByRole('heading', { name: 'Zulu' })).toBeInTheDocument();
  });

  it('groups default models ahead of non-default models with a divider', async () => {
    const user = userEvent.setup({ delay: null });
    installModels([
      makeModel({ modelId: 'model-c', label: 'Charlie' }),
      makeModel({ modelId: 'model-a', label: 'Alpha' }),
      makeModel({ modelId: 'model-b', label: 'Bravo' }),
    ], ['vnewtd', 'vnewt0'], ['model-c', 'model-a']);

    renderPage();

    await user.click(screen.getByRole('button', { name: /default — 2 models/i }));
    const modelButtons = screen
      .getAllByRole('button', { name: /^(Default Models|Alpha|Charlie|Bravo)$/i })
      .map((button) => button.textContent?.trim());
    expect(modelButtons).toEqual(['Default Models', 'Alpha', 'Charlie', 'Bravo']);
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

    expect(await screen.findByRole('heading', { name: 'No active models are available yet' })).toBeInTheDocument();
    expect(screen.getByText('Create or activate models first, then reopen this report.')).toBeInTheDocument();
  });
});
