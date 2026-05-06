import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ValuePrioritiesSection } from '../../src/components/domains/ValuePrioritiesSection';
import { VALUES, type ModelEntry, type ValueKey } from '../../src/data/domainAnalysisData';

function buildModel(label: string): ModelEntry {
  const values = Object.fromEntries(
    VALUES.map((value, index) => [value, index * 0.5]),
  ) as Record<ValueKey, number>;
  const winRates = Object.fromEntries(
    VALUES.map((value, index) => [value, 50 + index]),
  ) as Record<ValueKey, number | null>;

  return {
    model: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    values,
    winRates,
  };
}

describe('ValuePrioritiesSection', () => {
  it('renders the value priorities heading without the retired BT toggle', () => {
    render(
      <MemoryRouter>
        <ValuePrioritiesSection
          models={[buildModel('Model A')]}
          selectedDomainId="domain-a"
          selectedSignature="vnewtd"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Win Rate by Values by Model' })).toBeInTheDocument();
    expect(screen.queryByText(/model groups/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /full bt/i })).not.toBeInTheDocument();
  });
});
