import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConditionDecisionsTable } from '../../../src/components/analysis/ConditionDecisionsTable';

describe('ConditionDecisionsTable', () => {
  it('groups model headers by family when multiple variants share a provider', () => {
    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          orientationLabels={{
            canonical: 'Achievement -> Benevolence',
            flipped: 'Benevolence -> Achievement',
          }}
          perModel={{}}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              'scenario-1': { Achievement: 'full', Benevolence_Dependability: 'full' },
            },
            modelScenarioMatrix: {
              'deepseek-chat': { 'scenario-1': 2 },
              'deepseek-reasoner': { 'scenario-1': 3 },
              'gpt-4': { 'scenario-1': 4 },
              'gpt-5': { 'scenario-1': 5 },
            },
          } as any}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('columnheader', { name: 'DeepSeek' })).toHaveAttribute('colspan', '2');
    expect(screen.getByRole('columnheader', { name: 'GPT' })).toHaveAttribute('colspan', '2');
    expect(screen.getByRole('columnheader', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Reasoner' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '4' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '5' })).toBeInTheDocument();
  });

  it('uses the Claude model line as the header and version as the sublabel when available', () => {
    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          orientationLabels={{
            canonical: 'Achievement -> Benevolence',
            flipped: 'Benevolence -> Achievement',
          }}
          perModel={{}}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              'scenario-1': { Achievement: 'full', Benevolence_Dependability: 'full' },
            },
            modelScenarioMatrix: {
              'deepseek-chat': { 'scenario-1': 2 },
              'deepseek-reasoner': { 'scenario-1': 3 },
              'claude-sonnet-4-5': { 'scenario-1': 4 },
            },
          } as any}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('columnheader', { name: 'DeepSeek' })).toHaveAttribute('colspan', '2');
    expect(screen.getByRole('columnheader', { name: 'Sonnet' })).toHaveAttribute('colspan', '1');
    expect(screen.getByRole('columnheader', { name: '4.5' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Chat' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Reasoner' })).toBeInTheDocument();
  });

  it('formats long Grok reasoning labels with a deliberate wrap point', () => {
    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          orientationLabels={{
            canonical: 'Achievement -> Benevolence',
            flipped: 'Benevolence -> Achievement',
          }}
          perModel={{}}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              'scenario-1': { Achievement: 'full', Benevolence_Dependability: 'full' },
            },
            modelScenarioMatrix: {
              'grok-4-1-fast-reasoning': { 'scenario-1': 4 },
            },
          } as any}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('columnheader', { name: 'Grok' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /4\.1 Fast\s+Reasoning/i })).toBeInTheDocument();
  });
});
