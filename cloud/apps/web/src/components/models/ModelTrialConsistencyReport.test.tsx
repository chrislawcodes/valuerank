import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelTrialConsistencyReport } from './ModelTrialConsistencyReport';
import type { ModelAgreementOnTradeoffsQuery } from '../../generated/graphql';

type TrialConsistencyRow = ModelAgreementOnTradeoffsQuery['modelAgreementOnTradeoffs']['trialConsistency'][number];

function createRow(overrides: Partial<TrialConsistencyRow> = {}): TrialConsistencyRow {
  return {
    __typename: 'ModelTrialConsistency',
    modelId: 'alpha',
    modelLabel: 'Alpha',
    cellsObserved: 12,
    meanTrialConsistency: 0.875,
    noisy: false,
    ...overrides,
  };
}

describe('ModelTrialConsistencyReport', () => {
  it('renders the info icon tooltip trigger and the methodology footnote', () => {
    render(
      <ModelTrialConsistencyReport
        rows={[
          createRow(),
          createRow({ modelId: 'beta', modelLabel: 'Beta', meanTrialConsistency: 0.55, noisy: true }),
        ]}
      />,
    );

    expect(screen.getByLabelText('Show Trial Consistency help')).toBeDefined();
    expect(
      screen.getByText(
        'Measures the dominance of a model\'s modal choice across trials of the same scenario. 1.0 means the model gave the same answer every trial; 0.5 means it split 50/50. This conflates run-to-run variation with scenario-orientation flips and excludes single-trial cells.',
      ),
    ).toBeDefined();
  });
});
