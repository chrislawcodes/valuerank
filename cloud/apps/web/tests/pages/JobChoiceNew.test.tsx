import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { JobChoiceNew } from '../../src/pages/JobChoiceNew';
import { DOMAINS_QUERY } from '../../src/api/operations/domains';
import { DOMAIN_CONTEXTS_QUERY } from '../../src/api/operations/domain-contexts';
import { VALUE_STATEMENTS_QUERY } from '../../src/api/operations/value-statements';
import { LEVEL_PRESETS_QUERY } from '../../src/api/operations/level-presets';

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
    useMutation: () => useMutationMock(),
    gql: actual.gql,
  };
});

function createUseQueryImplementation() {
  return (args: { query: unknown; variables?: Record<string, unknown> }) => {
    if (args.query === DOMAINS_QUERY) {
      return [{
        data: {
          domains: [
            {
              id: 'domain-a',
              name: 'Domain A',
              defaultLevelPresetVersion: {
                id: 'preset-v1',
                version: '1',
                levelPreset: { name: 'Standard' },
              },
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

describe('JobChoiceNew', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    useMutationMock.mockReturnValue([{}, vi.fn()]);
    useQueryMock.mockImplementation(createUseQueryImplementation());
  });

  it('preselects the requested domain from the URL', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/job-choice/new?domainId=domain-a']}>
        <JobChoiceNew />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(container.querySelector('select')).toHaveValue('domain-a');
    });
  });
});
