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
let lastTranscriptListProps: {
  transcripts: Transcript[];
  decisionColumnLabel?: string;
  decisionDisplayMode?: string;
  groupByModel?: boolean;
  scenarioDimensions?: Record<string, Record<string, string | number>>;
  onSelect: (transcript: Transcript) => void;
} | null = null;

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

vi.mock('../../src/components/runs/TranscriptList', () => ({
  TranscriptList: (props: {
    transcripts: Transcript[];
    decisionColumnLabel?: string;
    decisionDisplayMode?: string;
    groupByModel?: boolean;
    scenarioDimensions?: Record<string, Record<string, string | number>>;
    onSelect: (transcript: Transcript) => void;
  }) => {
    lastTranscriptListProps = props;
    return (
      <div data-testid="transcript-list">
        <span>{props.decisionColumnLabel ?? 'unset'}</span>
        <span>{props.decisionDisplayMode ?? 'unset'}</span>
        <span>{props.groupByModel ? 'grouped' : 'flat'}</span>
        <span>{props.transcripts.length}</span>
        {props.transcripts.map((transcript) => (
          <button key={transcript.id} type="button" onClick={() => props.onSelect(transcript)}>
            {transcript.id}
          </button>
        ))}
      </div>
    );
  },
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
    lastTranscriptListProps = null;
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
      expect(screen.getByTestId('transcript-list')).toBeInTheDocument();
    });

    expect(lastTranscriptListProps?.decisionColumnLabel).toBe('Decision summary');
    expect(lastTranscriptListProps?.decisionDisplayMode).toBe('audit');
    expect(lastTranscriptListProps?.groupByModel).toBe(false);
    expect(lastTranscriptListProps?.scenarioDimensions).toEqual({
      'scenario-1': { Row: 'High', Col: 'Low' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'transcript-v2' }));

    const viewer = await screen.findByTestId('transcript-viewer');
    expect(within(viewer).getByText('transcript-v2')).toBeInTheDocument();
    expect(within(viewer).getByText('audit')).toBeInTheDocument();
    expect(screen.queryByText('Tokens')).not.toBeInTheDocument();
  });

  it('orders the value-detail condition matrix from negligible to full', async () => {
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
                      dimensions: { A: 'full', B: 'same' },
                      prioritized: 2,
                      deprioritized: 1,
                      neutral: 0,
                      totalTrials: 3,
                      selectedValueWinRate: 0.67,
                      meanDecisionScore: 4.2,
                    },
                    {
                      scenarioId: 'scenario-2',
                      conditionName: 'Condition B',
                      dimensions: { A: 'minimal', B: 'same' },
                      prioritized: 2,
                      deprioritized: 1,
                      neutral: 0,
                      totalTrials: 3,
                      selectedValueWinRate: 0.67,
                      meanDecisionScore: 4.2,
                    },
                    {
                      scenarioId: 'scenario-3',
                      conditionName: 'Condition C',
                      dimensions: { A: 'moderate', B: 'same' },
                      prioritized: 2,
                      deprioritized: 1,
                      neutral: 0,
                      totalTrials: 3,
                      selectedValueWinRate: 0.67,
                      meanDecisionScore: 4.2,
                    },
                    {
                      scenarioId: 'scenario-4',
                      conditionName: 'Condition D',
                      dimensions: { A: 'negligible', B: 'same' },
                      prioritized: 2,
                      deprioritized: 1,
                      neutral: 0,
                      totalTrials: 3,
                      selectedValueWinRate: 0.67,
                      meanDecisionScore: 4.2,
                    },
                    {
                      scenarioId: 'scenario-5',
                      conditionName: 'Condition E',
                      dimensions: { A: 'substantial', B: 'same' },
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
        return [{ data: undefined, fetching: false, error: undefined }];
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

    const matrixTable = screen.getByTitle('Condition A').closest('table');
    expect(matrixTable).not.toBeNull();

    const rowLabels = within(matrixTable as HTMLTableElement)
      .getAllByRole('row')
      .slice(2)
      .map((row) => within(row).getAllByRole('cell')[0].textContent?.trim());

    expect(rowLabels).toEqual([
      'negligible',
      'minimal',
      'moderate',
      'substantial',
      'full',
    ]);
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
      expect(screen.getByTestId('transcript-list')).toBeInTheDocument();
    });

    expect(lastTranscriptListProps?.decisionColumnLabel).toBe('Decision');
    expect(lastTranscriptListProps?.decisionDisplayMode).toBe('legacy');
    expect(lastTranscriptListProps?.groupByModel).toBe(false);
    expect(lastTranscriptListProps?.transcripts).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'transcript-v2' }));

    const viewer = await screen.findByTestId('transcript-viewer');
    expect(within(viewer).getByText('transcript-v2')).toBeInTheDocument();
    expect(within(viewer).getByText('legacy')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'transcript-legacy' }));

    const legacyViewer = await screen.findByTestId('transcript-viewer');
    expect(within(legacyViewer).getByText('transcript-legacy')).toBeInTheDocument();
    expect(within(legacyViewer).getByText('legacy')).toBeInTheDocument();
    expect(screen.queryByText('Tokens')).not.toBeInTheDocument();
  });
});
