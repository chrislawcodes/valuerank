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
  remainingBudgetUsd?: number | null;
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

function getMonthDateRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  return { start, end: now };
}

function findFirstNumberDeep(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) return parsed;
    return null;
  }
  if (input === null || input === undefined) return null;
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = findFirstNumberDeep(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    for (const value of Object.values(record)) {
      const found = findFirstNumberDeep(value);
      if (found !== null) return found;
    }
  }
  return null;
}

function sumNumbersDeep(input: unknown): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string') {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (input === null || input === undefined) return 0;
  if (Array.isArray(input)) {
    return input.reduce<number>((sum, item) => sum + sumNumbersDeep(item), 0);
  }
  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    return Object.values(record).reduce<number>((sum, value) => sum + sumNumbersDeep(value), 0);
  }
  return 0;
}

function getMonthlyBudgetCapUsd(providerId: string): number | null {
  const exactKey = `BUDGET_CAP_${providerId.toUpperCase()}_USD`;
  const specific = getEnvOptional(exactKey);
  if (specific !== undefined && specific !== '') {
    const parsed = Number(specific);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  const legacyKey = `${providerId.toUpperCase()}_MONTHLY_BUDGET_USD`;
  const legacy = getEnvOptional(legacyKey);
  if (legacy !== undefined && legacy !== '') {
    const parsed = Number(legacy);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  return null;
}

async function getOpenAIMonthlyCostUsd(apiKey: string): Promise<number | null> {
  const { start, end } = getMonthDateRange();
  const startTime = Math.floor(start.getTime() / 1000);
  const endTime = Math.floor(end.getTime() / 1000);

  const url = `https://api.openai.com/v1/organization/costs?start_time=${startTime}&end_time=${endTime}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const data = payload.data;
  if (!Array.isArray(data)) {
    return null;
  }

  let sum = 0;
  for (const item of data) {
    const record = item as Record<string, unknown>;
    if (record.amount !== undefined) {
      const amount = record.amount as Record<string, unknown>;
      const value = findFirstNumberDeep(amount.value);
      if (value !== null) {
        sum += value;
        continue;
      }
    }

    const fallback = findFirstNumberDeep(record.cost ?? record.total_cost ?? record.usd ?? record.value);
    if (fallback !== null) {
      sum += fallback;
    }
  }

  return sum > 0 ? sum : 0;
}

async function getAnthropicMonthlyCostUsd(apiKey: string): Promise<number | null> {
  const { start, end } = getMonthDateRange();
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const url = `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${encodeURIComponent(startIso)}&ending_at=${encodeURIComponent(endIso)}&granularity=day`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;

  const direct =
    findFirstNumberDeep(payload.total_cost_usd)
    ?? findFirstNumberDeep(payload.total_cost)
    ?? findFirstNumberDeep(payload.cost_usd);
  if (direct !== null) {
    return direct;
  }

  if (Array.isArray(payload.data)) {
    let sum = 0;
    for (const row of payload.data) {
      const record = row as Record<string, unknown>;
      const entryValue =
        findFirstNumberDeep(record.cost_usd)
        ?? findFirstNumberDeep(record.total_cost_usd)
        ?? findFirstNumberDeep(record.cost)
        ?? findFirstNumberDeep(record.total_cost);
      if (entryValue !== null) {
        sum += entryValue;
      }
    }
    return sum > 0 ? sum : 0;
  }

  const deep = sumNumbersDeep(payload);
  return deep > 0 ? deep : null;
}

async function getDeepSeekRemainingBudgetUsd(apiKey: string): Promise<number | null> {
  const response = await fetch('https://api.deepseek.com/user/balance', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;

  const direct =
    findFirstNumberDeep(payload.total_balance)
    ?? findFirstNumberDeep(payload.totalBalance)
    ?? findFirstNumberDeep(payload.balance);
  if (direct !== null) return direct;

  const data = payload.data as Record<string, unknown> | undefined;
  if (data !== undefined) {
    const nested =
      findFirstNumberDeep(data.total_balance)
      ?? findFirstNumberDeep(data.totalBalance)
      ?? findFirstNumberDeep(data.balance)
      ?? (Array.isArray(data.balance_infos)
        ? data.balance_infos
            .map((item) => findFirstNumberDeep(item))
            .find((value): value is number => value !== null) ?? null
        : null);
    if (nested !== null) return nested;
  }

  if (Array.isArray(payload.balance_infos)) {
    const infoValue = payload.balance_infos
      .map((item) => findFirstNumberDeep(item))
      .find((value): value is number => value !== null) ?? null;
    if (infoValue !== null) return infoValue;
  }

  return null;
}

async function getProviderRemainingBudgetUsd(providerId: string, apiKey: string): Promise<number | null> {
  if (providerId === 'deepseek') {
    return getDeepSeekRemainingBudgetUsd(apiKey);
  }

  const cap = getMonthlyBudgetCapUsd(providerId);
  if (cap === null) {
    return null;
  }

  if (providerId === 'openai') {
    const spend = await getOpenAIMonthlyCostUsd(apiKey);
    if (spend === null) return null;
    return Math.max(0, cap - spend);
  }

  if (providerId === 'anthropic') {
    const spend = await getAnthropicMonthlyCostUsd(apiKey);
    if (spend === null) return null;
    return Math.max(0, cap - spend);
  }

  return null;
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
      remainingBudgetUsd: null,
      lastChecked: new Date(),
    };
  }

  const apiKey = getEnvOptional(envKey);
  if (apiKey === undefined || apiKey === '') {
    return {
      id: providerId,
      name,
      configured: false,
      connected: false,
      remainingBudgetUsd: null,
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
      remainingBudgetUsd: null,
      lastChecked: new Date(),
    };
  }

  const result = await checker(apiKey);
  let remainingBudgetUsd: number | null = null;
  if (result.connected) {
    try {
      remainingBudgetUsd = await getProviderRemainingBudgetUsd(providerId, apiKey);
    } catch (err) {
      log.debug({ providerId, err }, 'Failed to fetch provider remaining budget');
      remainingBudgetUsd = null;
    }
  }

  return {
    id: providerId,
    name,
    configured: true,
    connected: result.connected,
    error: result.error,
    remainingBudgetUsd,
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
