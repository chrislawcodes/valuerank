import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelAgreementHeatmap } from './ModelAgreementHeatmap';

function createRow(overrides: Partial<{
  modelAId: string;
  modelALabel: string;
  modelBId: string;
  modelBLabel: string;
  totalCells: number;
  percentAgreement: number | null;
  cohensKappa: number | null;
  kappaInterpretation: string | null;
  meanAbsoluteDivergence: number | null;
}> = {}) {
  return {
    modelAId: 'alpha',
    modelALabel: 'Alpha',
    modelBId: 'beta',
    modelBLabel: 'Beta',
    totalCells: 10,
    percentAgreement: 0.5,
    cohensKappa: 0,
    kappaInterpretation: 'Slight',
    meanAbsoluteDivergence: 0.25,
    ...overrides,
  };
}

describe('ModelAgreementHeatmap', () => {
  it('renders diagonal placeholders and pair cells with kappa titles', () => {
    render(
      <ModelAgreementHeatmap
        kappaMatrix={[
          createRow({ modelAId: 'alpha', modelALabel: 'Alpha', modelBId: 'beta', modelBLabel: 'Beta', cohensKappa: -1, percentAgreement: 0, kappaInterpretation: 'Poor (worse than chance)' }),
          createRow({ modelAId: 'alpha', modelALabel: 'Alpha', modelBId: 'gamma', modelBLabel: 'Gamma', cohensKappa: 0, percentAgreement: 0.5, kappaInterpretation: 'Slight' }),
          createRow({ modelAId: 'beta', modelALabel: 'Beta', modelBId: 'gamma', modelBLabel: 'Gamma', cohensKappa: null, percentAgreement: null, kappaInterpretation: null, totalCells: 0 }),
        ]}
      />,
    );

    expect(screen.getByTitle('Alpha compared with itself')).toBeDefined();
    expect(screen.getByTitle('Beta compared with itself')).toBeDefined();
    expect(screen.getByTitle('Gamma compared with itself')).toBeDefined();
    expect(screen.getByTitle('Alpha vs Beta: kappa -1.00, interpretation Poor (worse than chance), total cells 10, percent agreement 0.0%')).toBeDefined();
    expect(screen.getByTitle('Alpha vs Gamma: kappa +0.00, interpretation Slight, total cells 10, percent agreement 50.0%')).toBeDefined();
    expect(screen.getByTitle('Beta vs Gamma: no overlap')).toBeDefined();
  });

  it('renders a red-to-white-to-green palette based on kappa', () => {
    render(
      <ModelAgreementHeatmap
        kappaMatrix={[
          createRow({ modelAId: 'alpha', modelALabel: 'Alpha', modelBId: 'beta', modelBLabel: 'Beta', cohensKappa: -1, percentAgreement: 0, kappaInterpretation: 'Poor (worse than chance)' }),
          createRow({ modelAId: 'alpha', modelALabel: 'Alpha', modelBId: 'gamma', modelBLabel: 'Gamma', cohensKappa: 0, percentAgreement: 0.5, kappaInterpretation: 'Slight' }),
          createRow({ modelAId: 'beta', modelALabel: 'Beta', modelBId: 'gamma', modelBLabel: 'Gamma', cohensKappa: 1, percentAgreement: 1, kappaInterpretation: 'Near-perfect' }),
        ]}
      />,
    );

    const redCell = screen.getByTitle('Alpha vs Beta: kappa -1.00, interpretation Poor (worse than chance), total cells 10, percent agreement 0.0%');
    const whiteCell = screen.getByTitle('Alpha vs Gamma: kappa +0.00, interpretation Slight, total cells 10, percent agreement 50.0%');
    const greenCell = screen.getByTitle('Beta vs Gamma: kappa +1.00, interpretation Near-perfect, total cells 10, percent agreement 100.0%');

    expect(window.getComputedStyle(redCell).backgroundColor).not.toBe(window.getComputedStyle(whiteCell).backgroundColor);
    expect(window.getComputedStyle(greenCell).backgroundColor).not.toBe(window.getComputedStyle(whiteCell).backgroundColor);
    expect(window.getComputedStyle(whiteCell).backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('renders an empty message when there are no pairs', () => {
    render(<ModelAgreementHeatmap kappaMatrix={[]} />);

    expect(screen.getByText('No pairwise agreement data available.')).toBeDefined();
  });
});
