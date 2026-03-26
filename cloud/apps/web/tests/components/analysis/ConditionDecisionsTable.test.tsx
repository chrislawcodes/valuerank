import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  it('orders condition rows from negligible to full', () => {
    render(
      <MemoryRouter>
        <ConditionDecisionsTable
          runId="run-1"
          expectedAttributes={['Achievement', 'Care']}
          orientationLabels={{
            canonical: 'Achievement -> Benevolence',
            flipped: 'Benevolence -> Achievement',
          }}
          perModel={{
            model1: {
              sampleSize: 5,
              values: {},
              overall: { mean: 3, stdDev: 0, min: 1, max: 5 },
            },
          } as any}
          visualizationData={{
            decisionDistribution: {},
            scenarioDimensions: {
              'scenario-1': { Achievement: 'full', Care: 'same' },
              'scenario-2': { Achievement: 'minimal', Care: 'same' },
              'scenario-3': { Achievement: 'moderate', Care: 'same' },
              'scenario-4': { Achievement: 'negligible', Care: 'same' },
              'scenario-5': { Achievement: 'substantial', Care: 'same' },
            },
            modelScenarioMatrix: {
              model1: {
                'scenario-1': 3,
                'scenario-2': 3,
                'scenario-3': 3,
                'scenario-4': 3,
                'scenario-5': 3,
              },
            },
          } as any}
        />
      </MemoryRouter>
    );

    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows.map((row) => within(row).getAllByRole('cell')[0].textContent?.trim())).toEqual([
      'negligible',
      'minimal',
      'moderate',
      'substantial',
      'full',
    ]);
  });
});
