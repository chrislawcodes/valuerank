/**
 * MethodsDocumentation Component Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MethodsDocumentation } from '../../../src/components/analysis/MethodsDocumentation';
import type { MethodsUsed, AnalysisWarning } from '../../../src/api/operations/analysis';

function createMockMethodsUsed(overrides: Partial<MethodsUsed> = {}): MethodsUsed {
  return {
    winRateCI: 'wilson_score',
    modelComparison: 'spearman_rho',
    pValueCorrection: 'bonferroni',
    effectSize: 'cohens_d',
    dimensionTest: 'factorial_anova',
    alpha: 0.05,
    codeVersion: '1.0.0',
    ...overrides,
  };
}

function createMockWarnings(): AnalysisWarning[] {
  return [
    {
      code: 'SMALL_SAMPLE_SIZE',
      message: 'Sample size is below recommended threshold',
      recommendation: 'Consider collecting more data for reliable results',
    },
    {
      code: 'NON_NORMAL_DISTRIBUTION',
      message: 'Data does not follow normal distribution',
      recommendation: 'Non-parametric tests have been applied',
    },
  ];
}

describe('MethodsDocumentation', () => {
  it('renders collapsed by default', () => {
    const methodsUsed = createMockMethodsUsed();
    render(<MethodsDocumentation methodsUsed={methodsUsed} warnings={[]} />);

    expect(screen.getByText('Statistical Methods Used')).toBeInTheDocument();
    // Content should not be visible
    expect(screen.queryByText('Methods & Parameters')).not.toBeInTheDocument();
  });

  it('expands when defaultExpanded is true', () => {
    const methodsUsed = createMockMethodsUsed();
    render(
      <MethodsDocumentation methodsUsed={methodsUsed} warnings={[]} defaultExpanded />
    );

    expect(screen.getByText('Methods & Parameters')).toBeInTheDocument();
  });

  it('expands when clicked', () => {
    const methodsUsed = createMockMethodsUsed();
    render(<MethodsDocumentation methodsUsed={methodsUsed} warnings={[]} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(screen.getByText('Methods & Parameters')).toBeInTheDocument();
  });

  it('collapses when clicked again', () => {
    const methodsUsed = createMockMethodsUsed();
    render(
      <MethodsDocumentation methodsUsed={methodsUsed} warnings={[]} defaultExpanded />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(screen.queryByText('Methods & Parameters')).not.toBeInTheDocument();
  });

  it('shows all checks passed when no warnings', () => {
    const methodsUsed = createMockMethodsUsed();
    render(<MethodsDocumentation methodsUsed={methodsUsed} warnings={[]} />);

    expect(screen.getByText('All checks passed')).toBeInTheDocument();
  });

  it('shows warning count badge when warnings present', () => {
    const methodsUsed = createMockMethodsUsed();
    const warnings = createMockWarnings();
    render(<MethodsDocumentation methodsUsed={methodsUsed} warnings={warnings} />);

    expect(screen.getByText('2 warnings')).toBeInTheDocument();
  });

  it('shows singular warning text for one warning', () => {
    const methodsUsed = createMockMethodsUsed();
    const warnings = [createMockWarnings()[0]];
    render(<MethodsDocumentation methodsUsed={methodsUsed} warnings={warnings} />);

    expect(screen.getByText('1 warning')).toBeInTheDocument();
  });

  it('displays warning details when expanded', () => {
    const methodsUsed = createMockMethodsUsed();
    const warnings = createMockWarnings();
    render(
      <MethodsDocumentation
        methodsUsed={methodsUsed}
        warnings={warnings}
        defaultExpanded
      />
    );

    expect(screen.getByText('Data Quality Warnings')).toBeInTheDocument();
    expect(
      screen.getByText('Sample size is below recommended threshold')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Consider collecting more data for reliable results')
    ).toBeInTheDocument();
  });

  it('displays method values when expanded', () => {
    const methodsUsed = createMockMethodsUsed();
    render(
      <MethodsDocumentation methodsUsed={methodsUsed} warnings={[]} defaultExpanded />
    );

    expect(screen.getByText('Win Rate Confidence Interval')).toBeInTheDocument();
    expect(screen.getByText('wilson score')).toBeInTheDocument();
    expect(screen.getByText('Model Comparison')).toBeInTheDocument();
    expect(screen.getByText('spearman rho')).toBeInTheDocument();
  });

  it('displays alpha level', () => {
    const methodsUsed = createMockMethodsUsed({ alpha: 0.01 });
    render(
      <MethodsDocumentation methodsUsed={methodsUsed} warnings={[]} defaultExpanded />
    );

    expect(screen.getByText('Significance Level (α)')).toBeInTheDocument();
    expect(screen.getByText('0.01')).toBeInTheDocument();
  });

  it('displays code version', () => {
    const methodsUsed = createMockMethodsUsed({ codeVersion: '2.1.0' });
    render(
      <MethodsDocumentation methodsUsed={methodsUsed} warnings={[]} defaultExpanded />
    );

    expect(screen.getByText('Analysis code version: 2.1.0')).toBeInTheDocument();
  });

  it('applies high severity style for SMALL_SAMPLE warnings', () => {
    const methodsUsed = createMockMethodsUsed();
    const warnings: AnalysisWarning[] = [
      {
        code: 'SMALL_SAMPLE_SIZE',
        message: 'Small sample',
        recommendation: 'Get more data',
      },
    ];
    render(
      <MethodsDocumentation
        methodsUsed={methodsUsed}
        warnings={warnings}
        defaultExpanded
      />
    );

    // Warning should be displayed
    expect(screen.getByText('Small sample')).toBeInTheDocument();
    expect(screen.getByText('SMALL_SAMPLE_SIZE')).toBeInTheDocument();
  });

  it('displays warning code in monospace', () => {
    const methodsUsed = createMockMethodsUsed();
    const warnings = createMockWarnings();
    render(
      <MethodsDocumentation
        methodsUsed={methodsUsed}
        warnings={warnings}
        defaultExpanded
      />
    );

    const codeElement = screen.getByText('SMALL_SAMPLE_SIZE');
    expect(codeElement).toHaveClass('font-mono');
  });
});
