import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PressureHighPressureByValueDomainTable } from './PressureHighPressureByValueDomainTable';
import type {
  PressureSensitivityModel,
  PressureSensitivityValueRateAggregated,
} from '../../api/operations/pressureSensitivity';

function createValueRate(
  valueLabel: string,
  overrides: Partial<PressureSensitivityValueRateAggregated> = {},
): PressureSensitivityValueRateAggregated {
  return {
    valueToken: valueLabel.toLowerCase(),
    valueLabel,
    averageWinRate: 0.5,
    balancedWinRate: 0.5,
    highPressureOnThisValueWinRate: 0.5,
    highPressureOnThisValueDomainRates: [],
    highPressureOnOpposingValueWinRate: 0.5,
    pairsMeasured: 9,
    ...overrides,
  };
}

function createModel(modelId: string, valueRates: PressureSensitivityValueRateAggregated[]): PressureSensitivityModel {
  return {
    modelId,
    label: modelId,
    providerName: 'Provider',
    unscoredCount: 0,
    pushedEffectPairsUsed: 0,
    domainPressureEffects: [],
    pressureResponseSummary: {
      mean: 0.1,
      rangeMin: 0.05,
      rangeMax: 0.15,
      pairsMeasured: valueRates[0]?.pairsMeasured ?? 0,
    },
    valueRates,
    valuePairs: [],
  };
}

describe('PressureHighPressureByValueDomainTable', () => {
  it('renders raw high-pressure rates by default', () => {
    render(
      <PressureHighPressureByValueDomainTable
        models={[
          createModel('Model A', [
            createValueRate('Alpha', {
              highPressureOnThisValueWinRate: 0.6,
              highPressureOnThisValueDomainRates: [
                { domainId: 'domain-a', domainName: 'Domain A', rate: 0.7, pairsMeasured: 6 },
                { domainId: 'domain-b', domainName: 'Domain B', rate: 0.5, pairsMeasured: 6 },
              ],
            }),
          ]),
        ]}
      />,
    );

    const row = screen.getByText('Alpha').closest('tr');
    if (row == null) {
      throw new Error('Missing Alpha row');
    }

    const cells = within(row).getAllByRole('cell');
    expect(cells[1]?.textContent ?? '').toBe('60.0%');
    expect(cells[2]?.textContent ?? '').toBe('70.0%');
    expect(cells[3]?.textContent ?? '').toBe('50.0%');
  });

  it('toggles domain cells to shifts versus the value average', () => {
    render(
      <PressureHighPressureByValueDomainTable
        models={[
          createModel('Model A', [
            createValueRate('Alpha', {
              highPressureOnThisValueWinRate: 0.6,
              highPressureOnThisValueDomainRates: [
                { domainId: 'domain-a', domainName: 'Domain A', rate: 0.7, pairsMeasured: 6 },
                { domainId: 'domain-b', domainName: 'Domain B', rate: 0.5, pairsMeasured: 6 },
              ],
            }),
          ]),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Shift vs high pressure' }));

    const row = screen.getByText('Alpha').closest('tr');
    if (row == null) {
      throw new Error('Missing Alpha row');
    }

    const cells = within(row).getAllByRole('cell');
    expect(cells[1]?.textContent ?? '').toBe('60.0%');
    expect(cells[2]?.textContent ?? '').toBe('+10.0');
    expect(cells[3]?.textContent ?? '').toBe('−10.0');
  });

  it('averages the same domain across models before rendering', () => {
    render(
      <PressureHighPressureByValueDomainTable
        models={[
          createModel('Model A', [
            createValueRate('Alpha', {
              highPressureOnThisValueWinRate: 0.6,
              highPressureOnThisValueDomainRates: [
                { domainId: 'domain-a', domainName: 'Domain A', rate: 0.7, pairsMeasured: 6 },
              ],
            }),
          ]),
          createModel('Model B', [
            createValueRate('Alpha', {
              highPressureOnThisValueWinRate: 0.8,
              highPressureOnThisValueDomainRates: [
                { domainId: 'domain-a', domainName: 'Domain A', rate: 0.9, pairsMeasured: 8 },
              ],
            }),
          ]),
        ]}
      />,
    );

    const row = screen.getByText('Alpha').closest('tr');
    if (row == null) {
      throw new Error('Missing Alpha row');
    }

    const cells = within(row).getAllByRole('cell');
    expect(cells[1]?.textContent ?? '').toBe('70.0%');
    expect(cells[2]?.textContent ?? '').toBe('80.0%');
  });
});
