// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ModelValueDetailDrawer } from '../../../src/components/models/ModelValueDetailDrawer';
import { type ModelsAnalysisModelResult, type ModelsAnalysisValueResult } from '../../../src/api/operations/modelsAnalysis';

const model = {
  modelId: 'claude-sonnet-4-5',
  label: 'Claude Sonnet 4.5',
} as unknown as ModelsAnalysisModelResult;

const value = {
  valueKey: 'Benevolence_Dependability',
  eligibleDomainCount: 2,
  pooledWinRate: 68,
  domains: [
    {
      domainId: 'domain-1',
      domainName: 'Health',
      winRate: 70,
      evidenceWeight: 8,
    },
    {
      domainId: 'domain-2',
      domainName: 'Education',
      winRate: 66,
      evidenceWeight: 6,
    },
  ],
} as unknown as ModelsAnalysisValueResult;

describe('ModelValueDetailDrawer', () => {
  it('shows the pooled win rate card and no cross-domain stability card', () => {
    render(
      <MemoryRouter>
        <ModelValueDetailDrawer
          open
          model={model}
          value={value}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Pooled win rate/i)).toBeDefined();
    expect(screen.getByText(/68%/)).toBeDefined();
    expect(screen.queryByText(/Cross-domain stability/i)).toBeNull();
  });
});
