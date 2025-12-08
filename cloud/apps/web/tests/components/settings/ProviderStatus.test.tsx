/**
 * ProviderStatus Component Tests
 *
 * Tests for LLM provider health status display.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProviderStatus } from '../../../src/components/settings/ProviderStatus';
import type { ProviderHealthStatus } from '../../../src/api/operations/health';

function createMockProvider(overrides: Partial<ProviderHealthStatus> = {}): ProviderHealthStatus {
  return {
    id: 'openai',
    name: 'OpenAI',
    configured: true,
    connected: true,
    error: null,
    lastChecked: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('ProviderStatus', () => {
  it('renders all providers', () => {
    const providers: ProviderHealthStatus[] = [
      createMockProvider({ id: 'openai', name: 'OpenAI' }),
      createMockProvider({ id: 'anthropic', name: 'Anthropic' }),
      createMockProvider({ id: 'google', name: 'Google' }),
    ];

    render(<ProviderStatus providers={providers} />);

    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
  });

  it('displays connected/configured count correctly', () => {
    const providers: ProviderHealthStatus[] = [
      createMockProvider({ id: 'openai', configured: true, connected: true }),
      createMockProvider({ id: 'anthropic', configured: true, connected: false }),
      createMockProvider({ id: 'google', configured: false, connected: false }),
    ];

    render(<ProviderStatus providers={providers} />);

    expect(screen.getByText('1/2 connected')).toBeInTheDocument();
  });

  it('shows "Connected" status for connected provider', () => {
    const providers: ProviderHealthStatus[] = [
      createMockProvider({ configured: true, connected: true }),
    ];

    render(<ProviderStatus providers={providers} />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('shows "API key not configured" for unconfigured provider', () => {
    const providers: ProviderHealthStatus[] = [
      createMockProvider({ configured: false, connected: false }),
    ];

    render(<ProviderStatus providers={providers} />);

    expect(screen.getByText('API key not configured')).toBeInTheDocument();
  });

  it('shows error message for configured but failed provider', () => {
    const providers: ProviderHealthStatus[] = [
      createMockProvider({ configured: true, connected: false, error: 'Invalid API key' }),
    ];

    render(<ProviderStatus providers={providers} />);

    expect(screen.getByText('Invalid API key')).toBeInTheDocument();
  });

  it('shows "Connection failed" when error is null but not connected', () => {
    const providers: ProviderHealthStatus[] = [
      createMockProvider({ configured: true, connected: false, error: null }),
    ];

    render(<ProviderStatus providers={providers} />);

    expect(screen.getByText('Connection failed')).toBeInTheDocument();
  });

  it('renders provider initials in badge', () => {
    const providers: ProviderHealthStatus[] = [
      createMockProvider({ id: 'openai', name: 'OpenAI' }),
    ];

    render(<ProviderStatus providers={providers} />);

    expect(screen.getByText('OP')).toBeInTheDocument();
  });

  it('shows title "LLM Providers"', () => {
    const providers: ProviderHealthStatus[] = [];

    render(<ProviderStatus providers={providers} />);

    expect(screen.getByText('LLM Providers')).toBeInTheDocument();
  });
});
