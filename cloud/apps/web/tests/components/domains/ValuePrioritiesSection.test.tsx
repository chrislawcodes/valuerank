import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValuePrioritiesSection } from '../../../src/components/domains/ValuePrioritiesSection';
import type { ModelEntry } from '../../../src/data/domainAnalysisData';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const models: ModelEntry[] = [
  {
    model: 'claude',
    label: 'Claude',
    values: {
      Self_Direction_Action: 42,
      Universalism_Nature: 12,
      Benevolence_Dependability: 11,
      Security_Personal: 10,
      Power_Dominance: 9,
      Achievement: 8,
      Tradition: 7,
      Stimulation: 6,
      Hedonism: 5,
      Conformity_Interpersonal: 4,
    },
    winRates: {
      Self_Direction_Action: 42,
      Universalism_Nature: 12,
      Benevolence_Dependability: 11,
      Security_Personal: 10,
      Power_Dominance: 9,
      Achievement: 8,
      Tradition: 7,
      Stimulation: 6,
      Hedonism: 5,
      Conformity_Interpersonal: 4,
    },
  },
];

describe('ValuePrioritiesSection', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it('keeps value cells read-only in all-domains mode', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ValuePrioritiesSection
          models={models}
          selectedDomainId="domain-a"
          selectedSignature="vnewtd"
          isReadOnly
        />
      </MemoryRouter>,
    );

    const cellButton = screen.getByRole('button', { name: /42\.0%/i });
    expect(cellButton).toBeDisabled();

    await user.click(cellButton);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
