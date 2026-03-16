import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { JobChoiceNew } from '../../src/pages/JobChoiceNew';
import { DEFINITION_QUERY } from '../../src/api/operations/definitions';
import { DOMAINS_QUERY } from '../../src/api/operations/domains';
import { DOMAIN_CONTEXTS_QUERY } from '../../src/api/operations/domain-contexts';
import { VALUE_STATEMENTS_QUERY } from '../../src/api/operations/value-statements';
import { LEVEL_PRESETS_QUERY } from '../../src/api/operations/level-presets';

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();
const mockNavigate = vi.fn();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
    useMutation: () => useMutationMock(),
    gql: actual.gql,
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function createUseQueryImplementation() {
  return (args: { query: unknown; variables?: Record<string, unknown> }) => {
    if (args.query === DEFINITION_QUERY) {
      return [{
        data: {
          definition: {
            id: 'def-1',
            name: 'care vs freedom (A)',
            domainId: 'domain-a',
            domainContextId: 'context-1',
            preambleVersionId: null,
            levelPresetVersionId: 'preset-v1',
            content: {
              schema_version: 1,
              template: 'Shared domain context',
              dimensions: [{ name: 'care' }, { name: 'freedom' }],
              methodology: {
                family: 'job-choice',
                presentation_order: 'A_first',
                pair_key: 'pair-1',
              },
              components: {
                context_id: 'context-1',
                value_first: { token: 'care', body: 'Care deeply' },
                value_second: { token: 'freedom', body: 'Preserve freedom' },
              },
            },
            resolvedContent: {
              schema_version: 1,
              template: 'Shared domain context',
              dimensions: [{ name: 'care' }, { name: 'freedom' }],
              methodology: {
                family: 'job-choice',
                presentation_order: 'A_first',
                pair_key: 'pair-1',
              },
              components: {
                context_id: 'context-1',
                value_first: { token: 'care', body: 'Care deeply' },
                value_second: { token: 'freedom', body: 'Preserve freedom' },
              },
            },
          },
        },
        fetching: false,
        error: undefined,
      }];
    }
    if (args.query === DOMAINS_QUERY) {
      return [{
        data: {
          domains: [
            {
              id: 'domain-a',
              name: 'Domain A',
            },
          ],
        },
        fetching: false,
        error: undefined,
      }];
    }
    if (args.query === DOMAIN_CONTEXTS_QUERY) {
      return [{
        data: {
          domainContexts: [
            { id: 'context-1', domainId: 'domain-a', text: 'Shared domain context' },
          ],
        },
        fetching: false,
        error: undefined,
      }];
    }
    if (args.query === VALUE_STATEMENTS_QUERY) {
      return [{
        data: {
          valueStatements: [
            { id: 'value-1', domainId: 'domain-a', token: 'care', body: 'Care deeply' },
            { id: 'value-2', domainId: 'domain-a', token: 'freedom', body: 'Preserve freedom' },
          ],
        },
        fetching: false,
        error: undefined,
      }];
    }
    if (args.query === LEVEL_PRESETS_QUERY) {
      return [{
        data: {
          levelPresets: [
            {
              id: 'preset-1',
              name: 'Standard',
              latestVersion: {
                id: 'preset-v1',
                version: '1',
                l1: 'Low',
                l2: 'Some',
                l3: 'Medium',
                l4: 'High',
                l5: 'Full',
              },
            },
          ],
        },
        fetching: false,
        error: undefined,
      }];
    }
    return [{ data: { preambles: [] }, fetching: false, error: undefined }];
  };
}

function mockMutationHooks(
  createPairMock = vi.fn(),
  updatePairMock = vi.fn(),
) {
  let callIndex = 0;
  useMutationMock.mockImplementation(() => {
    callIndex += 1;
    return callIndex % 2 === 1 ? [{}, createPairMock] : [{}, updatePairMock];
  });

  return { createPairMock, updatePairMock };
}

describe('JobChoiceNew', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    mockNavigate.mockReset();
    useQueryMock.mockImplementation(createUseQueryImplementation());
  });

  it('preselects the requested domain from the URL', async () => {
    mockMutationHooks();

    const { container } = render(
      <MemoryRouter initialEntries={['/job-choice/new?domainId=domain-a']}>
        <JobChoiceNew />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(container.querySelector('select')).toHaveValue('domain-a');
    });
  });

  it('does not auto-select a level preset when creating a new vignette', async () => {
    mockMutationHooks();

    render(
      <MemoryRouter initialEntries={['/job-choice/new?domainId=domain-a']}>
        <JobChoiceNew />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const levelPresetHelp = screen.getByText(/choose this explicitly for the vignette/i);
      const levelPresetSelect = levelPresetHelp.parentElement?.querySelector('select');
      expect(levelPresetSelect).not.toBeNull();
      expect(levelPresetSelect).toHaveValue('');
    });
  });

  it('prefills the vignette editor when editing an existing job-choice vignette', async () => {
    mockMutationHooks();

    render(
      <MemoryRouter initialEntries={['/job-choice/def-1/edit']}>
        <Routes>
          <Route path="/job-choice/:id/edit" element={<JobChoiceNew />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Vignette' })).toBeInTheDocument();
      expect(screen.getByDisplayValue('care vs freedom')).toBeInTheDocument();
    });
  });

  it('submits edit mode through updateJobChoicePair and returns to the definition page', async () => {
    const mutationMocks = mockMutationHooks(
      vi.fn(),
      vi.fn().mockResolvedValue({
      data: {
        updateJobChoicePair: {
          aFirst: { id: 'def-1', name: 'care vs freedom (A)' },
          bFirst: { id: 'def-2', name: 'care vs freedom (B)' },
        },
      },
      }),
    );

    render(
      <MemoryRouter initialEntries={['/job-choice/def-1/edit']}>
        <Routes>
          <Route path="/job-choice/:id/edit" element={<JobChoiceNew />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Vignette' })).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue('care vs freedom');
    fireEvent.change(nameInput, { target: { value: 'care vs freedom revised' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save Vignette Changes' }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mutationMocks.updatePairMock).toHaveBeenCalledWith({
        input: {
          definitionId: 'def-1',
          name: 'care vs freedom revised',
          contextId: 'context-1',
          valueFirstId: 'value-1',
          valueSecondId: 'value-2',
          preambleVersionId: null,
          levelPresetVersionId: 'preset-v1',
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save Vignette Changes' })).not.toBeDisabled();
      expect(mockNavigate).toHaveBeenCalledWith('/definitions/def-1');
    });

    expect(mutationMocks.createPairMock).not.toHaveBeenCalled();
  });
});
