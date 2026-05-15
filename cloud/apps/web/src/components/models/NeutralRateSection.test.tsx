import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NeutralRateSection } from './NeutralRateSection';
import type { DomainAnalysisModel, DomainAnalysisValueScore } from '../../api/operations/domainAnalysis';

function makeValue(overrides: Partial<DomainAnalysisValueScore>): DomainAnalysisValueScore {
  return {
    valueKey: 'Benevolence_Care',
    score: 0,
    prioritized: 0,
    deprioritized: 0,
    neutral: 0,
    totalComparisons: 0,
    winRateExcNeutral: null,
    ...overrides,
  };
}

// `neutralRate` is the condition-weighted rate from the API. The per-value
// `neutral` / `totalComparisons` are double-counted (once per value in the
// pair), so 8 neutral / 40 total here renders as 4 neutral trials of 20.
function makeModel(
  model: string,
  label: string,
  neutralRate: number | null,
  neutral: number,
  total: number,
): DomainAnalysisModel {
  return {
    model,
    label,
    neutralRate,
    values: [makeValue({ neutral, totalComparisons: total })],
  };
}

const MODEL_HIGH = makeModel('model-high', 'High Neutral', 0.2, 8, 40);
const MODEL_LOW = makeModel('model-low', 'Low Neutral', 0.05, 2, 40);
const MODEL_ZERO = makeModel('model-zero', 'No Data', null, 0, 0);

describe('NeutralRateSection', () => {
  it('renders the heading and column headers', () => {
    render(<NeutralRateSection models={[MODEL_HIGH]} />);
    expect(screen.getByRole('heading', { name: /neutral \/ unsure rate by model/i })).toBeTruthy();
    expect(screen.getAllByText(/neutral rate/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/trials \(n\)/i).length).toBeGreaterThan(0);
  });

  it('renders null when models list is empty', () => {
    const { container } = render(<NeutralRateSection models={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the API neutral rate and trial counts derived from pair counts', () => {
    render(<NeutralRateSection models={[MODEL_HIGH, MODEL_LOW]} />);
    const rows = screen.getAllByRole('row');
    // neutralRate 0.2 -> 20.0%; doubled pair counts halve to 4 neutral / 20 total.
    const highRow = rows.find((row) => row.textContent?.includes('High Neutral'))!;
    const highCells = within(highRow).getAllByRole('cell');
    expect(highCells[1]?.textContent).toBe('20.0%');
    expect(highCells[2]?.textContent).toBe('4');
    expect(highCells[3]?.textContent).toBe('20');
    const lowRow = rows.find((row) => row.textContent?.includes('Low Neutral'))!;
    expect(within(lowRow).getAllByRole('cell')[1]?.textContent).toBe('5.0%');
  });

  it('sorts by neutral rate descending by default', () => {
    render(<NeutralRateSection models={[MODEL_LOW, MODEL_HIGH]} />);
    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent).toMatch(/High Neutral/);
    expect(rows[2]?.textContent).toMatch(/Low Neutral/);
  });

  it('toggles sort direction when clicking an active column header', async () => {
    const user = userEvent.setup();
    render(<NeutralRateSection models={[MODEL_LOW, MODEL_HIGH]} />);
    await user.click(screen.getByRole('button', { name: /sort by neutral rate ascending/i }));
    const rows = screen.getAllByRole('row');
    expect(rows[1]?.textContent).toMatch(/Low Neutral/);
  });

  it('renders an em-dash when a model has no neutral rate', () => {
    render(<NeutralRateSection models={[MODEL_ZERO]} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows an equal-weight average row across selected models', () => {
    render(<NeutralRateSection models={[MODEL_HIGH, MODEL_LOW]} />);
    // mean of per-model rates: (0.2 + 0.05) / 2 = 0.125
    expect(screen.getByText(/all models \(avg\)/i)).toBeTruthy();
    expect(screen.getByText('12.5%')).toBeTruthy();
  });
});
