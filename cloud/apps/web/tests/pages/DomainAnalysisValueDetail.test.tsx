import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DomainAnalysisValueDetail } from '../../src/pages/DomainAnalysisValueDetail';
import {
  DOMAIN_ANALYSIS_CONDITION_TRANSCRIPTS_QUERY,
  DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY,
  DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY_LEGACY,
} from '../../src/api/operations/domainAnalysis';
import type { Transcript } from '../../src/api/operations/runs';

const useQueryMock = vi.fn();

vi.mock('urql', async () => {
  const actual = await vi.importActual<typeof import('urql')>('urql');
  return {
    ...actual,
    useQuery: (args: unknown) => useQueryMock(args),
  };
});

vi.mock('../../src/components/runs/TranscriptViewer', () => ({
  TranscriptViewer: ({ transcript, decisionDisplayMode }: { transcript: { id: string }; decisionDisplayMode?: string }) => (
    <div data-testid="transcript-viewer">
      <span>{transcript.id}</span>
      <span>{decisionDisplayMode ?? 'unset'}</span>
    </div>
  ),
}));

function createTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: 'transcript-1',
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'gpt-4',
    decisionCode: '1',
    decisionCodeSource: 'manual',
    decisionModelV2: null,
    turnCount: 2,
    tokenCount: 100,
    durationMs: 1500,
    createdAt: '2024-01-15T10:00:00Z',
    content: { turns: [] },
    ...overrides,
  };
}

describe('DomainAnalysisValueDetail', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementation((args: { query: unknown; variables?: Record<string, unknown> }) => {
      if (args.query === DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY || args.query === DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY_LEGACY) {
        return [{
          data: {
            domainAnalysisValueDetail: {
              domainId: 'domain-a',
              domainName: 'Domain A',
              modelId: 'gpt-4',
              modelLabel: 'GPT-4',
              valueKey: 'Achievement',
              score: 1.25,
              prioritized: 8,
              deprioritized: 3,
              neutral: 2,
              totalTrials: 13,
              targetedDefinitions: 1,
              coveredDefinitions: 1,
              missingDefinitionIds: [],
              generatedAt: '2026-03-15T12:00:00.000Z',
              vignettes: [
                {
                  definitionId: 'def-1',
                  definitionName: 'One vignette',
                  definitionVersion: 1,
                  aggregateRunId: 'run-1',
                  otherValueKey: 'Benevolence_Dependability',
                  prioritized: 8,
                  deprioritized: 3,
                  neutral: 2,
                  totalTrials: 13,
                  selectedValueWinRate: 0.61,
                  conditions: [
                    {
                      scenarioId: 'scenario-1',
                      conditionName: 'Condition A',
                      dimensions: { Row: 'High', Col: 'Low' },
                      prioritized: 2,
                      deprioritized: 1,
                      neutral: 0,
                      totalTrials: 3,
                      selectedValueWinRate: 0.67,
                      meanDecisionScore: 4.2,
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

      if (args.query === DOMAIN_ANALYSIS_CONDITION_TRANSCRIPTS_QUERY) {
        const definitionId = String(args.variables?.definitionId ?? '');
        if (definitionId === '') {
          return [{ data: undefined, fetching: false, error: undefined }];
        }

        const v2Transcript = createTranscript({
          id: 'transcript-v2',
          decisionCode: '1',
          decisionModelV2: {
            raw: {
              matchedText: 'Achievement',
              matchedLabel: 'Achievement',
              parseClass: 'exact',
              parsePath: 'exact.favor_second.strong',
              parserVersion: 'v1',
              responseExcerpt: 'Achievement',
              manualOverride: null,
            },
            canonical: {
              favoredValueKey: 'Benevolence_Dependability',
              opposedValueKey: 'Achievement',
              direction: 'favor_second',
              strength: 'strong',
              normalizationApplied: true,
              normalizationReason: 'orientation_flipped',
              source: 'deterministic',
            },
            legacy: {
              rawScore: 5,
              canonicalScore: 1,
            },
          },
        });
        const legacyTranscript = createTranscript({
          id: 'transcript-legacy',
          decisionCode: '4',
        });

        return [{
          data: {
            domainAnalysisConditionTranscripts: definitionId === 'def-1'
              ? [v2Transcript]
              : [v2Transcript, legacyTranscript],
          },
          fetching: false,
          error: undefined,
        }];
      }

      return [{ data: undefined, fetching: false, error: undefined }];
    });
  });

  it('switches the full report surface to canonical mode when the selected condition is fully V2', async () => {
    render(
      <MemoryRouter initialEntries={['/domains/analysis/value-detail?domainId=domain-a&modelId=gpt-4&valueKey=Achievement']}>
        <DomainAnalysisValueDetail />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Value Score Detail')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Condition A'));

    await waitFor(() => {
      expect(screen.getByText('Canonical decision')).toBeInTheDocument();
    });

    expect(screen.getByText('Strongly favors Benevolence Dependability')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /transcript/i })[0]!);

    const viewer = await screen.findByTestId('transcript-viewer');
    expect(within(viewer).getByText('transcript-v2')).toBeInTheDocument();
    expect(within(viewer).getByText('audit')).toBeInTheDocument();
  });

  it('keeps the report surface in legacy mode when mixed V1/V2 transcripts are present', async () => {
    useQueryMock.mockReset();
    useQueryMock.mockImplementation((args: { query: unknown; variables?: Record<string, unknown> }) => {
      if (args.query === DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY || args.query === DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY_LEGACY) {
        return [{
          data: {
            domainAnalysisValueDetail: {
              domainId: 'domain-a',
              domainName: 'Domain A',
              modelId: 'gpt-4',
              modelLabel: 'GPT-4',
              valueKey: 'Achievement',
              score: 1.25,
              prioritized: 8,
              deprioritized: 3,
              neutral: 2,
              totalTrials: 13,
              targetedDefinitions: 1,
              coveredDefinitions: 1,
              missingDefinitionIds: [],
              generatedAt: '2026-03-15T12:00:00.000Z',
              vignettes: [
                {
                  definitionId: 'def-1',
                  definitionName: 'One vignette',
                  definitionVersion: 1,
                  aggregateRunId: 'run-1',
                  otherValueKey: 'Benevolence_Dependability',
                  prioritized: 8,
                  deprioritized: 3,
                  neutral: 2,
                  totalTrials: 13,
                  selectedValueWinRate: 0.61,
                  conditions: [
                    {
                      scenarioId: 'scenario-1',
                      conditionName: 'Condition A',
                      dimensions: { Row: 'High', Col: 'Low' },
                      prioritized: 2,
                      deprioritized: 1,
                      neutral: 0,
                      totalTrials: 3,
                      selectedValueWinRate: 0.67,
                      meanDecisionScore: 4.2,
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

      if (args.query === DOMAIN_ANALYSIS_CONDITION_TRANSCRIPTS_QUERY) {
        return [{
          data: {
            domainAnalysisConditionTranscripts: [
              createTranscript({
                id: 'transcript-v2',
                decisionCode: '1',
                decisionModelV2: {
                  raw: {
                    matchedText: 'Achievement',
                    matchedLabel: 'Achievement',
                    parseClass: 'exact',
                    parsePath: 'exact.favor_second.strong',
                    parserVersion: 'v1',
                    responseExcerpt: 'Achievement',
                    manualOverride: null,
                  },
                  canonical: {
                    favoredValueKey: 'Benevolence_Dependability',
                    opposedValueKey: 'Achievement',
                    direction: 'favor_second',
                    strength: 'strong',
                    normalizationApplied: true,
                    normalizationReason: 'orientation_flipped',
                    source: 'deterministic',
                  },
                  legacy: {
                    rawScore: 5,
                    canonicalScore: 1,
                  },
                },
              }),
              createTranscript({
                id: 'transcript-legacy',
                decisionCode: '4',
              }),
            ],
          },
          fetching: false,
          error: undefined,
        }];
      }

      return [{ data: undefined, fetching: false, error: undefined }];
    });

    render(
      <MemoryRouter initialEntries={['/domains/analysis/value-detail?domainId=domain-a&modelId=gpt-4&valueKey=Achievement']}>
        <DomainAnalysisValueDetail />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Value Score Detail')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Condition A'));

    await waitFor(() => {
      expect(screen.getByText('Decision')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /transcript/i })[0]!);

    const viewer = await screen.findByTestId('transcript-viewer');
    expect(within(viewer).getByText('transcript-v2')).toBeInTheDocument();
    expect(within(viewer).getByText('legacy')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /transcript/i })[1]!);

    const legacyViewer = await screen.findByTestId('transcript-viewer');
    expect(within(legacyViewer).getByText('transcript-legacy')).toBeInTheDocument();
    expect(within(legacyViewer).getByText('legacy')).toBeInTheDocument();
  });
});
