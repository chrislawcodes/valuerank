/**
 * Provider Health Service
 *
 * Tests connectivity to LLM providers with minimal API calls.
 * Caches results to avoid repeated checks on frequent page loads.
 */

import { createLogger, getEnvOptional } from '@valuerank/shared';
import { LLM_PROVIDERS, isProviderConfigured } from '../../config/models.js';

const log = createLogger('services:health:providers');

export type ProviderHealthStatus = {
  id: string;
  name: string;
  configured: boolean;
  connected: boolean;
  error?: string;
  lastChecked: Date | null;
};

export type ProviderHealthResult = {
  providers: ProviderHealthStatus[];
  checkedAt: Date;
};

// Cache health check results for 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedResult: ProviderHealthResult | null = null;
let cacheTimestamp = 0;

/**
 * Test OpenAI API connectivity using the models endpoint.
 */
async function checkOpenAI(apiKey: string): Promise<{ connected: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { connected: true };
    }

    const errorText = await response.text();
    return { connected: false, error: `HTTP ${response.status}: ${errorText.slice(0, 100)}` };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Test Anthropic API connectivity using a minimal messages request.
 */
async function checkAnthropic(apiKey: string): Promise<{ connected: boolean; error?: string }> {
  try {
    // Use the models endpoint if available, otherwise validate with a minimal request
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    // Anthropic returns 200 for success, 401/403 for auth errors
    if (response.ok || response.status === 200) {
      return { connected: true };
    }

    // 400 with "messages: at least 1 message" means auth is fine
    if (response.status === 400) {
      return { connected: true };
    }

    if (response.status === 401 || response.status === 403) {
      return { connected: false, error: 'Invalid API key or unauthorized' };
    }

    const errorText = await response.text();
    return { connected: false, error: `HTTP ${response.status}: ${errorText.slice(0, 100)}` };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Test Google AI API connectivity using the models endpoint.
 */
async function checkGoogle(apiKey: string): Promise<{ connected: boolean; error?: string }> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: 'GET' }
    );

    if (response.ok) {
      return { connected: true };
    }

    const errorText = await response.text();
    return { connected: false, error: `HTTP ${response.status}: ${errorText.slice(0, 100)}` };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Test xAI API connectivity using the models endpoint.
 */
async function checkXAI(apiKey: string): Promise<{ connected: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.x.ai/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { connected: true };
    }

    const errorText = await response.text();
    return { connected: false, error: `HTTP ${response.status}: ${errorText.slice(0, 100)}` };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Test DeepSeek API connectivity using the models endpoint.
 */
async function checkDeepSeek(apiKey: string): Promise<{ connected: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.deepseek.com/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { connected: true };
    }

    const errorText = await response.text();
    return { connected: false, error: `HTTP ${response.status}: ${errorText.slice(0, 100)}` };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Test Mistral API connectivity using the models endpoint.
 */
async function checkMistral(apiKey: string): Promise<{ connected: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.mistral.ai/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { connected: true };
    }

    const errorText = await response.text();
    return { connected: false, error: `HTTP ${response.status}: ${errorText.slice(0, 100)}` };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Map provider ID to health check function.
 */
const healthCheckers: Record<string, (apiKey: string) => Promise<{ connected: boolean; error?: string }>> = {
  openai: checkOpenAI,
  anthropic: checkAnthropic,
  google: checkGoogle,
  xai: checkXAI,
  deepseek: checkDeepSeek,
  mistral: checkMistral,
};

/**
 * Check health of a single provider.
 */
async function checkProviderHealth(providerId: string, envKey: string): Promise<ProviderHealthStatus> {
  const provider = LLM_PROVIDERS.find((p) => p.id === providerId);
  const name = provider?.name ?? providerId;
  const configured = isProviderConfigured(envKey);

  if (!configured) {
    return {
      id: providerId,
      name,
      configured: false,
      connected: false,
      lastChecked: new Date(),
    };
  }

  const apiKey = getEnvOptional(envKey);
  if (!apiKey) {
    return {
      id: providerId,
      name,
      configured: false,
      connected: false,
      lastChecked: new Date(),
    };
  }

  const checker = healthCheckers[providerId];
  if (!checker) {
    log.warn({ providerId }, 'No health checker for provider');
    return {
      id: providerId,
      name,
      configured: true,
      connected: false,
      error: 'Health check not implemented for this provider',
      lastChecked: new Date(),
    };
  }

  const result = await checker(apiKey);
  return {
    id: providerId,
    name,
    configured: true,
    connected: result.connected,
    error: result.error,
    lastChecked: new Date(),
  };
}

/**
 * Get health status for all LLM providers.
 * Results are cached for 5 minutes to avoid excessive API calls.
 */
export async function getProviderHealth(forceRefresh = false): Promise<ProviderHealthResult> {
  const now = Date.now();

  // Return cached result if still valid
  if (!forceRefresh && cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
    log.debug('Returning cached provider health');
    return cachedResult;
  }

  log.info('Checking provider health');

  // Check all providers in parallel
  const checks = LLM_PROVIDERS.map((provider) =>
    checkProviderHealth(provider.id, provider.envKey)
  );

  const providers = await Promise.all(checks);

  const result: ProviderHealthResult = {
    providers,
    checkedAt: new Date(),
  };

  // Update cache
  cachedResult = result;
  cacheTimestamp = now;

  const connectedCount = providers.filter((p) => p.connected).length;
  const configuredCount = providers.filter((p) => p.configured).length;

  log.info(
    { configuredCount, connectedCount, totalProviders: providers.length },
    'Provider health check complete'
  );

  return result;
}

/**
 * Clear the health check cache.
 * Useful for testing or forcing immediate re-check.
 */
export function clearProviderHealthCache(): void {
  cachedResult = null;
  cacheTimestamp = 0;
}
