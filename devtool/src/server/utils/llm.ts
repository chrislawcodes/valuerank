/**
 * Shared LLM utility for calling various AI providers.
 * Supports Anthropic and OpenAI with automatic fallback.
 */

import fs from 'fs/promises';
import path from 'path';
import { createLogger } from './logger.js';
import { getGenerationProviders, type LLMProviderConfig } from '../../shared/llmProviders.js';

const log = createLogger('llm');

const PROJECT_ROOT = path.resolve(process.cwd(), '..');

interface LLMProviderWithGenerate extends LLMProviderConfig {
  generate: (prompt: string, apiKey: string, options?: LLMOptions) => Promise<string>;
}

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

// Load API keys from environment or .env file
export async function loadEnvFile(): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  try {
    const envPath = path.join(PROJECT_ROOT, '.env');
    const content = await fs.readFile(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          let value = trimmed.slice(eqIndex + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          env[key] = value;
        }
      }
    }
  } catch {
    // .env file not found
  }
  return env;
}

// Generate functions for each supported provider
const generateFunctions: Record<string, (prompt: string, apiKey: string, options?: LLMOptions) => Promise<string>> = {
  anthropic: async (prompt: string, apiKey: string, options?: LLMOptions) => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options?.model || 'claude-sonnet-4-20250514',
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0].text;
  },

  openai: async (prompt: string, apiKey: string, options?: LLMOptions) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || 'gpt-4o',
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0].message.content;
  },
};

// Build providers list from shared config, adding generate functions
const providers: LLMProviderWithGenerate[] = getGenerationProviders()
  .filter(p => generateFunctions[p.id])
  .map(p => ({
    ...p,
    generate: generateFunctions[p.id],
  }));

/**
 * Call an LLM with the given prompt, trying available providers in order.
 * If options.model is specified in "provider:model" format, use that specific provider and model.
 */
export async function callLLM(prompt: string, options?: LLMOptions): Promise<string> {
  const envVars = await loadEnvFile();
  const allEnv = { ...process.env, ...envVars };

  // If a specific model is provided in "provider:model" format, use that directly
  if (options?.model && options.model.includes(':')) {
    const [providerId, modelId] = options.model.split(':');
    const provider = providers.find(p => p.id === providerId);

    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    const apiKey = allEnv[provider.envKey];
    if (!apiKey) {
      throw new Error(`No API key found for ${providerId}. Set ${provider.envKey} in .env`);
    }

    log.info(`Using specific model ${providerId}:${modelId} for LLM call`);
    const result = await provider.generate(prompt, apiKey, { ...options, model: modelId });
    log.info(`${providerId} call successful`, { responseLength: result.length });
    return result;
  }

  // Fall back to trying available providers in order
  let lastError: string | null = null;

  for (const provider of providers) {
    const apiKey = allEnv[provider.envKey];
    if (apiKey) {
      try {
        log.info(`Using ${provider.id} for LLM call`);
        const result = await provider.generate(prompt, apiKey, options);
        log.info(`${provider.id} call successful`, { responseLength: result.length });
        return result;
      } catch (e) {
        lastError = String(e);
        log.error(`${provider.id} failed`, { error: lastError });
      }
    }
  }

  throw new Error(lastError || 'No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env');
}

/**
 * Get list of available LLM providers based on configured API keys.
 */
export async function getAvailableProviders(): Promise<string[]> {
  const envVars = await loadEnvFile();
  const allEnv = { ...process.env, ...envVars };

  return providers
    .filter((p) => !!allEnv[p.envKey])
    .map((p) => p.id);
}

/**
 * Extract YAML content from an LLM response.
 */
export function extractYaml(result: string): string {
  const yamlMatch = result.match(/```ya?ml\n([\s\S]*?)\n```/);
  if (yamlMatch) {
    return yamlMatch[1];
  }
  const lines = result.split('\n');
  const startIndex = lines.findIndex(l => l.trim().startsWith('preamble:'));
  if (startIndex >= 0) {
    return lines.slice(startIndex).join('\n');
  }
  return result;
}
