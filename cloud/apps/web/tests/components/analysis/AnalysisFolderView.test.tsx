import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalysisFolderView } from '../../../src/components/analysis/AnalysisFolderView';
import type { Run } from '../../../src/api/operations/runs';

function createRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    name: 'Run 1',
    definitionId: 'definition-1',
    definitionVersion: 1,
    experimentId: null,
    status: 'COMPLETED',
    config: { models: ['gpt-4'] },
    progress: null,
    runProgress: null,
    summarizeProgress: null,
    startedAt: null,
    completedAt: '2026-03-03T12:00:00Z',
    createdAt: '2026-03-03T12:00:00Z',
    updatedAt: '2026-03-03T12:00:00Z',
    lastAccessedAt: null,
    transcripts: [],
    transcriptCount: 1,
    recentTasks: [],
    analysisStatus: 'completed',
    executionMetrics: null,
    analysis: null,
    definition: {
      id: 'definition-1',
      name: 'Generated Scenario',
      version: 1,
      tags: [
        {
          id: 'tag-generated',
          name: 'generated',
        },
      ],
      content: {},
    },
    tags: [],
    ...overrides,
  };
}

describe('AnalysisFolderView', () => {
  it('uses authoritative folder counts when provided', () => {
    render(
      <AnalysisFolderView
        runs={[createRun()]}
        onRunClick={() => {}}
        folderCounts={{
          aggregateCount: 0,
          untaggedCount: 0,
          tagCounts: {
            'tag-generated': 45,
          },
        }}
      />
    );

    expect(screen.getByRole('button', { name: /generated/i })).toHaveTextContent('(45)');
  });
});
