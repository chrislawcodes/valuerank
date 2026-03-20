import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'urql';
import { fromValue, delay, pipe } from 'wonka';
import { DefinitionDetail } from '../../src/pages/DefinitionDetail';

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../src/components/definitions/DefinitionEditor', () => ({
  DefinitionEditor: ({ mode }: { mode: 'create' | 'edit' }) => (
    <div>
      <div>{mode === 'create' ? 'Definition Editor Stub (create)' : 'Definition Editor Stub (edit)'}</div>
      <div>Vignette Name</div>
    </div>
  ),
}));

vi.mock('../../src/components/definitions/TagSelector', () => ({
  TagSelector: ({ selectedTags }: { selectedTags?: { id: string; name: string }[] }) => (
    <div>
      <div>Add Tag</div>
      {selectedTags?.map((tag) => <div key={tag.id}>{tag.name}</div>)}
    </div>
  ),
}));

vi.mock('../../src/pages/DefinitionDetail/RunFormModal', () => ({
  RunFormModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>RunFormModal Open</div> : null),
}));

function createMockClient(options: {
  definition?: {
    id: string;
    name: string;
    content: object;
    domainId?: string | null;
    domainContextId?: string | null;
    preambleVersionId?: string | null;
    levelPresetVersionId?: string | null;
    parentId?: string | null;
    runCount?: number;
    createdAt?: string;
    updatedAt?: string;
    tags?: { id: string; name: string; createdAt: string }[];
    parent?: { id: string; name: string } | null;
    children?: { id: string; name: string }[];
  } | null;
  loading?: boolean;
  error?: Error | null;
} = {}) {
  const {
    definition = {
      id: 'def-1',
      name: 'Test Definition',
      content: {
        schema_version: 1,
        preamble: 'Test preamble',
        template: 'Test template [dimension]',
        dimensions: [
          { name: 'dimension', levels: [{ score: 1, label: 'low' }] },
        ],
      },
      parentId: null,
      runCount: 0,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
      tags: [],
      parent: null,
      children: [],
    },
    loading = false,
    error = null,
  } = options;

  return {
    executeQuery: vi.fn((request: { query: string }) => {
      // Return appropriate data based on the query being executed
      const queryStr = typeof request.query === 'string' ? request.query : '';
      if (queryStr.includes('GetPreamblesList') || queryStr.includes('preambles')) {
        return pipe(
          fromValue({
            data: { preambles: [] },
            fetching: false,
            error: undefined,
          }),
          delay(0)
        );
      }
      // Default: definition query (also handles scenario/count queries gracefully)
      return pipe(
        fromValue({
          data: definition
            ? {
                definition,
                scenarioCount: definition.scenarioCount ?? 8,
              }
            : null,
          fetching: loading,
          error: error ? { message: error.message } : undefined,
        }),
        delay(0)
      );
    }),
    executeMutation: vi.fn(() =>
      pipe(
        fromValue({ data: {} }),
        delay(0)
      )
    ),
    executeSubscription: vi.fn(),
  };
}

function renderDefinitionDetail(id: string, client = createMockClient()) {
  return {
    ...render(
      <Provider value={client as never}>
        <MemoryRouter initialEntries={[`/definitions/${id}`]}>
          <Routes>
            <Route path="/definitions/:id" element={<DefinitionDetail />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    ),
    client,
  };
}

describe('DefinitionDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('should show loading indicator when fetching definition', async () => {
      const client = createMockClient({ loading: true, definition: null });

      // Override executeQuery to simulate loading state with fetching true
      client.executeQuery = vi.fn(() =>
        pipe(
          fromValue({ data: null, fetching: true }),
          delay(100)
        )
      );

      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByText('Loading vignette...')).toBeInTheDocument();
      });
    });
  });

  describe('create new mode', () => {
    it('should show editor in create mode for /definitions/new', async () => {
      const client = createMockClient();
      renderDefinitionDetail('new', client);

      await waitFor(() => {
        expect(screen.getByText('Create New Vignette')).toBeInTheDocument();
      });
    });

    it('should show Vignette Name input in create mode', async () => {
      const client = createMockClient();
      renderDefinitionDetail('new', client);

      await waitFor(() => {
        // The Input component renders label text, not a proper label-input association
        expect(screen.getByText('Vignette Name')).toBeInTheDocument();
      });
    });
  });

  describe('view mode', () => {
    it('should show definition name when loaded', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Test Definition' })).toBeInTheDocument();
      });
    });

    it('should show Back button', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument();
      });
    });

    it('should show Edit button', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });
    });

    it('should show Fork button', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /fork/i })).toBeInTheDocument();
      });
    });

    it('should show Delete button', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });
    });

    it('should show preamble content', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByText('Test preamble')).toBeInTheDocument();
      });
    });

    it('should show template content', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByText(/Test template/)).toBeInTheDocument();
      });
    });

    it('shows a shared level scale for job-choice definitions with identical preset levels', async () => {
      const client = createMockClient({
        definition: {
          id: 'job-choice-scale',
          name: 'Dependability vs Achievement',
          levelPresetVersionId: 'preset-1',
          content: {
            schema_version: 1,
            template: [
              'A mid-level professional has been offered two distinct roles.',
              '',
              'In one role, this job offers [level] trust from other people because of how it relates to being someone others can rely on to carry through on shared responsibilities.',
              '',
              'In the other role, this job offers [level] recognition of their expertise because of how it relates to success through strong performance.',
            ].join('\n'),
            dimensions: [
              {
                name: 'benevolence_dependability',
                levels: [
                  { score: 1, label: 'negligible' },
                  { score: 2, label: 'low' },
                  { score: 3, label: 'moderate' },
                  { score: 4, label: 'high' },
                  { score: 5, label: 'full' },
                ],
              },
              {
                name: 'achievement',
                levels: [
                  { score: 1, label: 'negligible' },
                  { score: 2, label: 'low' },
                  { score: 3, label: 'moderate' },
                  { score: 4, label: 'high' },
                  { score: 5, label: 'full' },
                ],
              },
            ],
            methodology: {
              family: 'job-choice',
              presentation_order: 'A_first',
              pair_key: 'pair-1',
            },
          },
          parentId: null,
          runCount: 0,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
          tags: [],
          parent: null,
          children: [],
        },
      });

      renderDefinitionDetail('job-choice-scale', client);

      await waitFor(() => {
        expect(screen.getByText(/In one role, this job offers \[level\] trust from other people/)).toBeInTheDocument();
      });

      expect(screen.getByText('Level Scale')).toBeInTheDocument();
      expect(screen.getByText('Applies to all values in this vignette')).toBeInTheDocument();
      expect(screen.queryByText('Attributes (2)')).not.toBeInTheDocument();
      expect(screen.queryByText('[benevolence_dependability]')).not.toBeInTheDocument();
      expect(screen.queryByText('[achievement]')).not.toBeInTheDocument();
      expect(screen.getAllByText('negligible')).toHaveLength(1);
      expect(screen.getAllByText('full')).toHaveLength(1);
    });
  });

  describe('edit mode', () => {
    it('should switch to edit mode when Edit button clicked', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      await waitFor(() => {
        expect(screen.getByText('Edit Vignette')).toBeInTheDocument();
      });
    });

    it('routes job-choice vignettes to the vignette editor', async () => {
      const client = createMockClient({
        definition: {
          id: 'job-choice-1',
          name: 'Care -> Freedom',
          domainId: 'domain-a',
          domainContextId: 'context-1',
          levelPresetVersionId: null,
          preambleVersionId: null,
          content: {
            schema_version: 1,
            template: 'Choose between care and freedom',
            dimensions: [{ name: 'care' }, { name: 'freedom' }],
            methodology: {
              family: 'job-choice',
              presentation_order: 'A_first',
              pair_key: 'pair-1',
            },
            components: {
              context_id: 'context-1',
              value_first: { token: 'care', body: 'show care' },
              value_second: { token: 'freedom', body: 'protect freedom' },
            },
          },
          parentId: null,
          runCount: 0,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
          tags: [],
          parent: null,
          children: [],
        },
      });
      renderDefinitionDetail('job-choice-1', client);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /edit/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/job-choice/job-choice-1/edit');
    });

    it('routes job-choice vignettes to the paired batch launch page', async () => {
      const client = createMockClient({
        definition: {
          id: 'job-choice-2',
          name: 'Care -> Freedom',
          domainId: 'domain-a',
          domainContextId: 'context-1',
          levelPresetVersionId: null,
          preambleVersionId: null,
          content: {
            schema_version: 1,
            template: 'Choose between care and freedom',
            dimensions: [{ name: 'care' }, { name: 'freedom' }],
            methodology: {
              family: 'job-choice',
              presentation_order: 'A_first',
              pair_key: 'pair-1',
            },
            components: {
              context_id: 'context-1',
              value_first: { token: 'care', body: 'show care' },
              value_second: { token: 'freedom', body: 'protect freedom' },
            },
          },
          parentId: null,
          runCount: 0,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
          tags: [],
          parent: null,
          children: [],
        },
      });

      renderDefinitionDetail('job-choice-2', client);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /start paired batch/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /start paired batch/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/definitions/job-choice-2/start-paired-batch');
    });

    it('opens the trial modal for standard vignettes', async () => {
      const client = createMockClient({
        definition: {
          id: 'standard-1',
          name: 'Standard Definition',
          domainId: 'domain-b',
          domainContextId: 'context-2',
          levelPresetVersionId: null,
          preambleVersionId: null,
          content: {
            schema_version: 1,
            template: 'Standard vignette',
            dimensions: [{ name: 'dimension' }],
          },
          parentId: null,
          runCount: 0,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
          tags: [],
          parent: null,
          children: [],
        },
      });

      renderDefinitionDetail('standard-1', client);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /start trial/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /start trial/i }));

      await waitFor(() => {
        expect(screen.getByText('RunFormModal Open')).toBeInTheDocument();
      });
      expect(mockNavigate).not.toHaveBeenCalledWith('/definitions/standard-1/start-paired-batch');
    });
  });

  describe('fork dialog', () => {
    it('should show fork dialog when Fork button clicked', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /fork/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /fork/i }));

      await waitFor(() => {
        expect(screen.getByText('Fork Vignette')).toBeInTheDocument();
      });
    });
  });

  describe('delete confirmation', () => {
    it('should show delete confirmation when Delete button clicked', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByText('Delete Vignette')).toBeInTheDocument();
      });
    });
  });

  describe('parent reference', () => {
    it('should show parent indicator for forked definitions', async () => {
      const client = createMockClient({
        definition: {
          id: 'def-2',
          name: 'Forked Definition',
          content: {
            schema_version: 1,
            preamble: '',
            template: 'Test',
            dimensions: [],
          },
          parentId: 'def-1',
          runCount: 0,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
          tags: [],
          parent: { id: 'def-1', name: 'Parent Definition' },
          children: [],
        },
      });

      renderDefinitionDetail('def-2', client);

      await waitFor(() => {
        expect(screen.getByText('Forked from parent')).toBeInTheDocument();
      });
    });
  });

  describe('version tree', () => {
    it('should show version tree section for definition', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        // With the new tree implementation, we show "Version Tree" header
        expect(screen.getByText('Version Tree')).toBeInTheDocument();
      });
    });
  });

  describe('tags', () => {
    it('should show tag selector', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByText('Add Tag')).toBeInTheDocument();
      });
    });

    it('should display existing tags', async () => {
      const client = createMockClient({
        definition: {
          id: 'def-1',
          name: 'Test Definition',
          content: {
            schema_version: 1,
            preamble: '',
            template: 'Test',
            dimensions: [],
          },
          parentId: null,
          runCount: 0,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
          tags: [{ id: 'tag-1', name: 'ethics', createdAt: '2024-01-15T10:00:00Z' }],
          parent: null,
          children: [],
        },
      });

      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByText('ethics')).toBeInTheDocument();
      });
    });
  });
});
