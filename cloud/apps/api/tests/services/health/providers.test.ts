/**
 * Provider Health Service Tests
 *
 * Tests for LLM provider connectivity health checks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getProviderHealth,
  clearProviderHealthCache,
  type ProviderHealthResult,
} from '../../../src/services/health/providers.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the models config
vi.mock('../../../src/config/models.js', () => ({
  LLM_PROVIDERS: [
    { id: 'openai', name: 'OpenAI', envKey: 'OPENAI_API_KEY' },
    { id: 'anthropic', name: 'Anthropic', envKey: 'ANTHROPIC_API_KEY' },
    { id: 'google', name: 'Google', envKey: 'GOOGLE_API_KEY' },
  ],
  isProviderConfigured: vi.fn((envKey: string) => {
    const configured = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];
    return configured.includes(envKey);
  }),
}));

// Mock shared getEnvOptional
vi.mock('@valuerank/shared', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getEnvOptional: vi.fn((key: string) => {
    const keys: Record<string, string> = {
      OPENAI_API_KEY: 'sk-test-openai-key',
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
    };
    return keys[key];
  }),
}));

describe('Provider Health Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProviderHealthCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getProviderHealth', () => {
    it('returns health status for all providers', async () => {
      // Mock successful API responses
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('openai.com')) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
        }
        if (url.includes('anthropic.com')) {
          return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') });
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
      });

      const result = await getProviderHealth();

      expect(result.providers).toHaveLength(3);
      expect(result.checkedAt).toBeInstanceOf(Date);

      // OpenAI should be configured and connected
      const openai = result.providers.find((p) => p.id === 'openai');
      expect(openai).toBeDefined();
      expect(openai?.configured).toBe(true);
      expect(openai?.connected).toBe(true);

      // Anthropic should be configured and connected
      const anthropic = result.providers.find((p) => p.id === 'anthropic');
      expect(anthropic).toBeDefined();
      expect(anthropic?.configured).toBe(true);
      expect(anthropic?.connected).toBe(true);

      // Google should NOT be configured
      const google = result.providers.find((p) => p.id === 'google');
      expect(google).toBeDefined();
      expect(google?.configured).toBe(false);
      expect(google?.connected).toBe(false);
    });

    it('handles API errors gracefully', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('openai.com')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            text: () => Promise.resolve('Unauthorized'),
          });
        }
        if (url.includes('anthropic.com')) {
          return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') });
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
      });

      const result = await getProviderHealth();

      const openai = result.providers.find((p) => p.id === 'openai');
      expect(openai?.connected).toBe(false);
      expect(openai?.error).toContain('401');
    });

    it('handles network errors gracefully', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('openai.com')) {
          return Promise.reject(new Error('Network error'));
        }
        if (url.includes('anthropic.com')) {
          return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') });
        }
        return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
      });

      const result = await getProviderHealth();

      const openai = result.providers.find((p) => p.id === 'openai');
      expect(openai?.connected).toBe(false);
      expect(openai?.error).toBe('Network error');
    });

    it('caches results and returns cached data on subsequent calls', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });

      const result1 = await getProviderHealth();
      const result2 = await getProviderHealth();

      // Second call should use cache, so fetch shouldn't be called again
      expect(result1.checkedAt.getTime()).toBe(result2.checkedAt.getTime());
    });

    it('refreshes cache when forceRefresh is true', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });

      const result1 = await getProviderHealth();

      // Wait a bit
      await new Promise((r) => setTimeout(r, 10));

      const result2 = await getProviderHealth(true);

      // Times should be different with force refresh
      expect(result2.checkedAt.getTime()).toBeGreaterThan(result1.checkedAt.getTime());
    });
  });

  describe('clearProviderHealthCache', () => {
    it('clears cache and forces new health check', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') });

      const result1 = await getProviderHealth();
      clearProviderHealthCache();

      // Wait a bit
      await new Promise((r) => setTimeout(r, 10));

      const result2 = await getProviderHealth();

      // Times should be different after cache clear
      expect(result2.checkedAt.getTime()).toBeGreaterThan(result1.checkedAt.getTime());
    });
  });
});
