import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function createMockClient(options: {
  definition?: {
    id: string;
    name: string;
    content: object;
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
    executeQuery: vi.fn(() =>
      pipe(
        fromValue({
          data: definition ? { definition } : null,
          fetching: loading,
          error: error ? { message: error.message } : undefined,
        }),
        delay(0)
      )
    ),
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
        expect(screen.getByText('Loading definition...')).toBeInTheDocument();
      });
    });
  });

  describe('create new mode', () => {
    it('should show editor in create mode for /definitions/new', async () => {
      const client = createMockClient();
      renderDefinitionDetail('new', client);

      await waitFor(() => {
        expect(screen.getByText('Create New Definition')).toBeInTheDocument();
      });
    });

    it('should show Definition Name input in create mode', async () => {
      const client = createMockClient();
      renderDefinitionDetail('new', client);

      await waitFor(() => {
        // The Input component renders label text, not a proper label-input association
        expect(screen.getByText('Definition Name')).toBeInTheDocument();
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
  });

  describe('edit mode', () => {
    it('should switch to edit mode when Edit button clicked', async () => {
      const user = userEvent.setup();
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit/i }));

      await waitFor(() => {
        expect(screen.getByText('Edit Definition')).toBeInTheDocument();
      });
    });
  });

  describe('fork dialog', () => {
    it('should show fork dialog when Fork button clicked', async () => {
      const user = userEvent.setup();
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /fork/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /fork/i }));

      await waitFor(() => {
        expect(screen.getByText('Fork Definition')).toBeInTheDocument();
      });
    });
  });

  describe('delete confirmation', () => {
    it('should show delete confirmation when Delete button clicked', async () => {
      const user = userEvent.setup();
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByText('Delete Definition')).toBeInTheDocument();
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
    it('should show version tree message for root definition', async () => {
      const client = createMockClient();
      renderDefinitionDetail('def-1', client);

      await waitFor(() => {
        expect(screen.getByText('This is a root definition with no forks')).toBeInTheDocument();
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
