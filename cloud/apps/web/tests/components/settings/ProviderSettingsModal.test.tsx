/**
 * ProviderSettingsModal Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProviderSettingsModal } from '../../../src/components/settings/models/ProviderSettingsModal';

const baseProvider = {
  id: 'provider-1',
  name: 'anthropic',
  displayName: 'Anthropic',
  isEnabled: true,
  requestsPerMinute: 60,
  maxParallelRequests: 10,
  balance: null,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  models: [],
};

describe('ProviderSettingsModal', () => {
  it('shows read-only ValueRank balance when provider.balance is set', () => {
    render(
      <ProviderSettingsModal
        provider={{ ...baseProvider, balance: 8.60 }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText(/ValueRank balance/i)).toBeDefined();
    expect(screen.getByText(/8\.60/)).toBeDefined();
  });

  it('does not show ValueRank balance when provider.balance is null', () => {
    render(
      <ProviderSettingsModal
        provider={{ ...baseProvider, balance: null }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.queryByText(/ValueRank balance/i)).toBeNull();
  });

  it('does not render a Sync button', () => {
    render(
      <ProviderSettingsModal
        provider={{ ...baseProvider, balance: 10.00 }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /sync/i })).toBeNull();
  });

  it('renders Save Settings button', () => {
    render(
      <ProviderSettingsModal
        provider={baseProvider}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /save settings/i })).toBeDefined();
  });
});
