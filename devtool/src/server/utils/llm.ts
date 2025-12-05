/**
 * Shared LLM utility for calling various AI providers.
 * Supports Anthropic and OpenAI with automatic fallback.
 */

import fs from 'fs/promises';
import path from 'path';
import { createLogger } from './logger.js';

const log = createLogger('llm');

const PROJECT_ROOT = path.resolve(process.cwd(), '..');

interface LLMProvider {
  name: string;
  envKey: string;
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

const providers: LLMProvider[] = [
  {
    name: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    generate: async (prompt: string, apiKey: string, options?: LLMOptions) => {
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

      const data = await response.json();
      return data.content[0].text;
    },
  },
  {
    name: 'openai',
    envKey: 'OPENAI_API_KEY',
    generate: async (prompt: string, apiKey: string, options?: LLMOptions) => {
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

      const data = await response.json();
      return data.choices[0].message.content;
    },
  },
];

/**
 * Call an LLM with the given prompt, trying available providers in order.
 */
export async function callLLM(prompt: string, options?: LLMOptions): Promise<string> {
  const envVars = await loadEnvFile();
  const allEnv = { ...process.env, ...envVars };

  let lastError: string | null = null;

  for (const provider of providers) {
    const apiKey = allEnv[provider.envKey];
    if (apiKey) {
      try {
        log.info(`Using ${provider.name} for LLM call`);
        const result = await provider.generate(prompt, apiKey, options);
        log.info(`${provider.name} call successful`, { responseLength: result.length });
        return result;
      } catch (e) {
        lastError = String(e);
        log.error(`${provider.name} failed`, { error: lastError });
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
    .map((p) => p.name);
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
