/**
 * LLM Generation Service
 *
 * Calls LLM providers for scenario generation and other infrastructure tasks.
 * Supports all configured providers: Anthropic, OpenAI, DeepSeek, Google, xAI, Mistral.
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
  /** Specific provider to use (bypasses provider iteration) */
  provider?: string;
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
  const maxTokens = Math.min(options?.maxTokens || 8192, 16384); // OpenAI GPT-4o max

  log.debug({ promptLength: prompt.length, timeoutMs, maxTokens }, 'Calling OpenAI API');

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
        max_tokens: maxTokens,
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
 * Call DeepSeek API (OpenAI-compatible)
 */
async function generateDeepSeek(
  prompt: string,
  apiKey: string,
  options?: LLMOptions
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTokens = Math.min(options?.maxTokens || 8192, 8192); // DeepSeek optimal max

  log.debug({ promptLength: prompt.length, timeoutMs, maxTokens }, 'Calling DeepSeek API');

  const response = await fetchWithTimeout(
    'https://api.deepseek.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || 'deepseek-chat',
        max_tokens: maxTokens,
        temperature: options?.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek API error: ${error}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content || '';
}

/**
 * Call Google Gemini API
 */
async function generateGoogle(
  prompt: string,
  apiKey: string,
  options?: LLMOptions
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = options?.model || 'gemini-1.5-flash';

  log.debug({ promptLength: prompt.length, timeoutMs, model }, 'Calling Google Gemini API');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxTokens || 8192,
        },
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Gemini API error: ${error}`);
  }

  const data = (await response.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text).join('\n') || '';
}

/**
 * Call xAI Grok API (OpenAI-compatible)
 */
async function generateXAI(
  prompt: string,
  apiKey: string,
  options?: LLMOptions
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  log.debug({ promptLength: prompt.length, timeoutMs }, 'Calling xAI API');

  const response = await fetchWithTimeout(
    'https://api.x.ai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || 'grok-2-1212',
        max_tokens: options?.maxTokens || 8192,
        temperature: options?.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`xAI API error: ${error}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content || '';
}

/**
 * Call Mistral API (OpenAI-compatible)
 */
async function generateMistral(
  prompt: string,
  apiKey: string,
  options?: LLMOptions
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  log.debug({ promptLength: prompt.length, timeoutMs }, 'Calling Mistral API');

  const response = await fetchWithTimeout(
    'https://api.mistral.ai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || 'mistral-large-latest',
        max_tokens: options?.maxTokens || 8192,
        temperature: options?.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${error}`);
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
  {
    id: 'deepseek',
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    generate: generateDeepSeek,
  },
  {
    id: 'google',
    name: 'Google',
    envKey: 'GOOGLE_API_KEY',
    defaultModel: 'gemini-1.5-flash',
    generate: generateGoogle,
  },
  {
    id: 'xai',
    name: 'xAI',
    envKey: 'XAI_API_KEY',
    defaultModel: 'grok-2-1212',
    generate: generateXAI,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    envKey: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-large-latest',
    generate: generateMistral,
  },
];

/**
 * Call an LLM with the given prompt.
 * If options.provider is specified, use that provider directly.
 * Otherwise, try available providers in order until one succeeds.
 */
export async function callLLM(prompt: string, options?: LLMOptions): Promise<string> {
  // If a specific provider is requested, use it directly
  if (options?.provider) {
    const provider = providers.find((p) => p.id === options.provider);
    if (!provider) {
      throw new Error(`Unknown provider: ${options.provider}`);
    }

    const apiKey = getEnvOptional(provider.envKey);
    if (!apiKey) {
      throw new Error(
        `Provider ${options.provider} not configured. Set ${provider.envKey} environment variable.`
      );
    }

    log.info({ provider: provider.id, model: options.model }, 'Calling LLM with specific provider');
    const result = await provider.generate(prompt, apiKey, options);
    log.info(
      { provider: provider.id, responseLength: result.length },
      'LLM call successful'
    );
    return result;
  }

  // Otherwise, try providers in order
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
    lastError || 'No LLM API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, etc.'
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
