import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type {
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
    winRates: {
      Universalism_Nature: 1.0,
      Benevolence_Dependability: 0.94,
      Conformity_Interpersonal: 0.81,
      Tradition: 0.69,
      Security_Personal: 0.57,
      Power_Dominance: 0.45,
      Achievement: 0.33,
      Hedonism: 0.22,
      Stimulation: 0.11,
      Self_Direction_Action: 0.0,
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
    winRates: {
      Universalism_Nature: 0.32,
      Benevolence_Dependability: 0.64,
      Conformity_Interpersonal: 1.0,
      Tradition: 0.54,
      Security_Personal: 0.84,
      Power_Dominance: 0.13,
      Achievement: 0.41,
      Hedonism: 0.0,
      Stimulation: 0.93,
      Self_Direction_Action: 0.35,
    },
  },
];


describe('DominanceSection', () => {
  it('renders the shell and updates summary content when the selected model changes', async () => {
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
    let container: HTMLElement;
    const { rerender } = render(
      <DominanceSection
        models={models}
        selectedModelId="model-a"
      />,
    );
    await act(async () => {
      container = screen.getByRole('img', { name: 'Value dominance graph' }).parentElement!.parentElement!;
      await Promise.resolve();
    });

    expect(
      screen.getByRole('heading', { name: 'Ranking and Cycles' }),
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
    expect(screen.getByText('Model focus:')).toBeInTheDocument();
    expect(screen.getByText('Model A')).toBeInTheDocument();
    const summaryList = container!.querySelector('ol');
    expect(summaryList?.textContent).toBeTruthy();
    const initialSummary = summaryList?.textContent ?? '';

    rerender(
      <DominanceSection
        models={models}
        selectedModelId="model-b"
      />,
    );

    expect(screen.getByText('Model B')).toBeInTheDocument();
    expect(summaryList?.textContent).not.toEqual(initialSummary);
  });
});
