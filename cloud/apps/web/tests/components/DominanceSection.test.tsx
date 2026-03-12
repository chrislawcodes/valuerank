import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  DomainAnalysisModelAvailability,
  ModelEntry,
} from '../../src/data/domainAnalysisData';
import { DominanceSection } from '../../src/components/domains/DominanceSection';

const models: ModelEntry[] = [
  {
    model: 'model-a',
    label: 'Model A',
    values: {
      Universalism_Nature: 10,
      Benevolence_Dependability: 8.5,
      Conformity_Interpersonal: 7.3,
      Tradition: 6.2,
      Security_Personal: 5.1,
      Power_Dominance: 4.05,
      Achievement: 3.01,
      Hedonism: 2,
      Stimulation: 1,
      Self_Direction_Action: 0,
    },
  },
  {
    model: 'model-b',
    label: 'Model B',
    values: {
      Universalism_Nature: 0.4,
      Benevolence_Dependability: 4.7,
      Conformity_Interpersonal: 9.4,
      Tradition: 3.3,
      Security_Personal: 7.2,
      Power_Dominance: -2.1,
      Achievement: 1.6,
      Hedonism: -3.8,
      Stimulation: 8.5,
      Self_Direction_Action: 0.9,
    },
  },
];

const unavailableModels: DomainAnalysisModelAvailability[] = [
  {
    model: 'offline-model',
    label: 'Offline Model',
    reason: 'not available',
  },
];

describe('DominanceSection', () => {
  it('renders the shell, keeps unavailable options disabled, and updates summary content on model change', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    );
    const user = userEvent.setup();
    let container: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <DominanceSection models={models} unavailableModels={unavailableModels} />,
      ));
      await Promise.resolve();
    });

    expect(
      screen.getByRole('heading', { name: '2. Ranking and Cycles' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Directed value graph for one selected AI: arrows point from stronger value to weaker value.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Value dominance graph' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Most Contestable Value Pairs' }),
    ).toBeInTheDocument();

    const modelSelect = screen.getByRole('combobox');
    expect(modelSelect).toHaveValue('model-a');

    const unavailableOption = screen.getByRole('option', {
      name: 'Offline Model (Unavailable)',
    });
    expect(unavailableOption).toBeDisabled();

    const summaryList = container!.querySelector('ol');
    expect(summaryList?.textContent).toBeTruthy();
    const initialSummary = summaryList?.textContent ?? '';

    await user.selectOptions(modelSelect, 'model-b');

    expect(modelSelect).toHaveValue('model-b');
    expect(summaryList?.textContent).not.toEqual(initialSummary);
  });
});
