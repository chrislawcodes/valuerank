/**
 * LLM Generation Service
 *
 * Calls LLM providers (Anthropic, OpenAI) for scenario generation.
 * Tries available providers based on configured API keys.
 */

import { createLogger, getEnvOptional } from '@valuerank/shared';

const log = createLogger('services:llm:generate');

// Default timeout for LLM calls (2 minutes)
const DEFAULT_TIMEOUT_MS = 120000;

export type LLMOptions = {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  timeoutMs?: number;
};

type LLMProvider = {
  id: string;
  name: string;
  envKey: string;
  defaultModel: string;
  generate: (prompt: string, apiKey: string, options?: LLMOptions) => Promise<string>;
};

/**
 * Fetch with timeout support.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call Anthropic API
 */
async function generateAnthropic(
  prompt: string,
  apiKey: string,
  options?: LLMOptions
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  log.debug({ promptLength: prompt.length, timeoutMs }, 'Calling Anthropic API');

  const response = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options?.model || 'claude-sonnet-4-20250514',
        max_tokens: options?.maxTokens || 8192,
        temperature: options?.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = (await response.json()) as { content: Array<{ text: string }> };
  return data.content[0]?.text || '';
}

/**
 * Call OpenAI API
 */
async function generateOpenAI(
  prompt: string,
  apiKey: string,
  options?: LLMOptions
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  log.debug({ promptLength: prompt.length, timeoutMs }, 'Calling OpenAI API');

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || 'gpt-4o',
        max_tokens: options?.maxTokens || 8192,
        temperature: options?.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content || '';
}

/**
 * Supported LLM providers
 */
const providers: LLMProvider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-20250514',
    generate: generateAnthropic,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    generate: generateOpenAI,
  },
];

/**
 * Call an LLM with the given prompt, trying available providers in order.
 */
export async function callLLM(prompt: string, options?: LLMOptions): Promise<string> {
  let lastError: string | null = null;

  for (const provider of providers) {
    const apiKey = getEnvOptional(provider.envKey);
    if (apiKey) {
      try {
        log.info({ provider: provider.id }, 'Calling LLM');
        const result = await provider.generate(prompt, apiKey, options);
        log.info(
          { provider: provider.id, responseLength: result.length },
          'LLM call successful'
        );
        return result;
      } catch (e) {
        lastError = String(e);
        log.error({ provider: provider.id, error: lastError }, 'LLM call failed');
      }
    }
  }

  throw new Error(
    lastError || 'No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY'
  );
}

/**
 * Extract YAML content from an LLM response.
 */
export function extractYaml(result: string): string {
  // Try to find YAML in code block
  const yamlMatch = result.match(/```ya?ml\n([\s\S]*?)\n```/);
  if (yamlMatch) {
    return yamlMatch[1] || '';
  }

  // Try to find YAML starting with preamble:
  const lines = result.split('\n');
  const startIndex = lines.findIndex((l) => l.trim().startsWith('preamble:'));
  if (startIndex >= 0) {
    return lines.slice(startIndex).join('\n');
  }

  // Return as-is
  return result;
}
