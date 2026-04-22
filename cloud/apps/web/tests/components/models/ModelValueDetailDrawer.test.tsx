// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { ModelValueDetailDrawer } from '../../../src/components/models/ModelValueDetailDrawer';

const model = {
  modelId: 'model-1',
  label: 'Claude',
  values: [],
};

const value = {
  valueKey: 'Achievement',
  pooledWinRate: 62,
  stabilityScore: 74,
  eligibleDomainCount: 3,
  domains: [
    { domainId: 'domain-a', domainName: 'Domain A', evidenceWeight: 5, winRate: 60 },
    { domainId: 'domain-b', domainName: 'Domain B', evidenceWeight: 4, winRate: 64 },
    { domainId: 'domain-c', domainName: 'Domain C', evidenceWeight: 3, winRate: 62 },
  ],
};

describe('ModelValueDetailDrawer', () => {
  it('keeps the top-line cross-domain score but removes the domain-by-domain summary', () => {
    render(
      <MemoryRouter>
        <ModelValueDetailDrawer
          open
          model={model}
          value={value}
          singleDomainActive={false}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Cross-domain stability', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText(/contributing domains/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/vignette count/i)).not.toBeInTheDocument();
  });
});
