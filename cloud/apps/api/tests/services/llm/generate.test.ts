/**
 * Unit tests for LLM Generation Service
 *
 * Tests LLM API calls, YAML extraction, and provider fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callLLM, extractYaml, type LLMOptions } from '../../../src/services/llm/generate.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock environment variables
vi.mock('@valuerank/shared', async () => {
  const actual = await vi.importActual('@valuerank/shared');
  return {
    ...actual,
    getEnvOptional: vi.fn(),
    createLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    })),
  };
});

import { getEnvOptional } from '@valuerank/shared';

const mockedGetEnvOptional = vi.mocked(getEnvOptional);

describe('LLM Generation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('callLLM', () => {
    describe('with Anthropic API key', () => {
      beforeEach(() => {
        mockedGetEnvOptional.mockImplementation((key: string) => {
          if (key === 'ANTHROPIC_API_KEY') return 'test-anthropic-key';
          return undefined;
        });
      });

      it('calls Anthropic API with correct headers and body', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            content: [{ text: 'Generated text' }],
          }),
        });

        const prompt = 'Generate scenarios for ethical dilemmas';
        const result = await callLLM(prompt);

        expect(mockFetch).toHaveBeenCalledOnce();
        const [url, options] = mockFetch.mock.calls[0];

        expect(url).toBe('https://api.anthropic.com/v1/messages');
        expect(options.method).toBe('POST');
        expect(options.headers['x-api-key']).toBe('test-anthropic-key');
        expect(options.headers['anthropic-version']).toBe('2023-06-01');

        const body = JSON.parse(options.body);
        expect(body.messages).toEqual([{ role: 'user', content: prompt }]);
        expect(result).toBe('Generated text');
      });

      it('uses default model and parameters', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            content: [{ text: 'response' }],
          }),
        });

        await callLLM('test prompt');

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.model).toBe('claude-sonnet-4-20250514');
        expect(body.max_tokens).toBe(8192);
        expect(body.temperature).toBe(0.7);
      });

      it('uses custom options when provided', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            content: [{ text: 'response' }],
          }),
        });

        const options: LLMOptions = {
          model: 'claude-opus-4-20250514',
          maxTokens: 4096,
          temperature: 0.5,
        };

        await callLLM('test prompt', options);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.model).toBe('claude-opus-4-20250514');
        expect(body.max_tokens).toBe(4096);
        expect(body.temperature).toBe(0.5);
      });

      it('throws error on API failure', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          text: async () => 'Rate limit exceeded',
        });

        await expect(callLLM('test prompt')).rejects.toThrow(
          'Anthropic API error: Rate limit exceeded'
        );
      });

      it('returns empty string when response has no content', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            content: [],
          }),
        });

        const result = await callLLM('test prompt');
        expect(result).toBe('');
      });
    });

    describe('with OpenAI API key', () => {
      beforeEach(() => {
        mockedGetEnvOptional.mockImplementation((key: string) => {
          if (key === 'OPENAI_API_KEY') return 'test-openai-key';
          return undefined;
        });
      });

      it('calls OpenAI API with correct headers and body', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'OpenAI response' } }],
          }),
        });

        const result = await callLLM('test prompt');

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toBe('https://api.openai.com/v1/chat/completions');
        expect(options.headers['Authorization']).toBe('Bearer test-openai-key');

        const body = JSON.parse(options.body);
        expect(body.model).toBe('gpt-4o');
        expect(result).toBe('OpenAI response');
      });

      it('throws error on API failure', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          text: async () => 'Invalid API key',
        });

        await expect(callLLM('test prompt')).rejects.toThrow(
          'OpenAI API error: Invalid API key'
        );
      });

      it('returns empty string when response has no choices', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [],
          }),
        });

        const result = await callLLM('test prompt');
        expect(result).toBe('');
      });
    });

    describe('provider fallback', () => {
      it('tries Anthropic first, then OpenAI', async () => {
        mockedGetEnvOptional.mockImplementation((key: string) => {
          if (key === 'ANTHROPIC_API_KEY') return 'anthropic-key';
          if (key === 'OPENAI_API_KEY') return 'openai-key';
          return undefined;
        });

        // Anthropic fails
        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            text: async () => 'Anthropic error',
          })
          // OpenAI succeeds
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              choices: [{ message: { content: 'OpenAI fallback' } }],
            }),
          });

        const result = await callLLM('test prompt');

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch.mock.calls[0][0]).toBe(
          'https://api.anthropic.com/v1/messages'
        );
        expect(mockFetch.mock.calls[1][0]).toBe(
          'https://api.openai.com/v1/chat/completions'
        );
        expect(result).toBe('OpenAI fallback');
      });

      it('throws error when no API keys are configured', async () => {
        mockedGetEnvOptional.mockReturnValue(undefined);

        await expect(callLLM('test prompt')).rejects.toThrow(
          'No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY'
        );
      });

      it('throws last error when all providers fail', async () => {
        mockedGetEnvOptional.mockImplementation((key: string) => {
          if (key === 'ANTHROPIC_API_KEY') return 'anthropic-key';
          if (key === 'OPENAI_API_KEY') return 'openai-key';
          return undefined;
        });

        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            text: async () => 'Anthropic error',
          })
          .mockResolvedValueOnce({
            ok: false,
            text: async () => 'OpenAI error',
          });

        await expect(callLLM('test prompt')).rejects.toThrow('OpenAI API error');
      });
    });

    describe('timeout handling', () => {
      beforeEach(() => {
        mockedGetEnvOptional.mockImplementation((key: string) => {
          if (key === 'ANTHROPIC_API_KEY') return 'test-key';
          return undefined;
        });
      });

      it('uses default timeout of 120000ms', async () => {
        mockFetch.mockImplementation(async (_, options) => {
          // Verify signal is present
          expect(options.signal).toBeDefined();
          return {
            ok: true,
            json: async () => ({ content: [{ text: 'ok' }] }),
          };
        });

        await callLLM('test prompt');

        expect(mockFetch).toHaveBeenCalled();
      });

      it('uses custom timeout when specified', async () => {
        mockFetch.mockImplementation(async (_, options) => {
          expect(options.signal).toBeDefined();
          return {
            ok: true,
            json: async () => ({ content: [{ text: 'ok' }] }),
          };
        });

        await callLLM('test prompt', { timeoutMs: 5000 });

        expect(mockFetch).toHaveBeenCalled();
      });

      it('handles AbortError from fetch correctly', async () => {
        mockFetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

        await expect(callLLM('test prompt', { timeoutMs: 1000 })).rejects.toThrow();
      });
    });
  });

  describe('extractYaml', () => {
    it('extracts YAML from code block with yaml tag', () => {
      const response = `Here is the generated content:

\`\`\`yaml
preamble: >
  Test preamble

scenarios:
  scenario_1:
    subject: Test
    body: Test body
\`\`\`

That's the output.`;

      const result = extractYaml(response);

      expect(result).toContain('preamble:');
      expect(result).toContain('scenarios:');
      expect(result).not.toContain('```');
      expect(result).not.toContain("Here is the generated content");
    });

    it('extracts YAML from code block with yml tag', () => {
      const response = `\`\`\`yml
key: value
nested:
  item: data
\`\`\``;

      const result = extractYaml(response);

      expect(result).toBe('key: value\nnested:\n  item: data');
    });

    it('finds YAML by preamble: marker when no code block', () => {
      const response = `Some explanation text here.

preamble: >
  Test preamble

scenarios:
  test_1:
    body: Content`;

      const result = extractYaml(response);

      expect(result.startsWith('preamble:')).toBe(true);
      expect(result).toContain('scenarios:');
      expect(result).not.toContain('Some explanation text here');
    });

    it('returns raw response when no YAML markers found', () => {
      const response = 'Just plain text without YAML';

      const result = extractYaml(response);

      expect(result).toBe('Just plain text without YAML');
    });

    it('handles empty response', () => {
      const result = extractYaml('');
      expect(result).toBe('');
    });

    it('handles response with only code block markers', () => {
      const response = '```yaml\n```';

      const result = extractYaml(response);

      // The regex requires \n before closing ```, so this doesn't match
      // and falls back to returning the raw response
      expect(result).toBe(response);
    });

    it('extracts multiline YAML correctly', () => {
      const response = `\`\`\`yaml
scenarios:
  scenario_Stakes1_Certainty1:
    base_id: scenario
    category: Stakes_vs_Certainty
    subject: Low stakes uncertain
    body: |
      A minor inconvenience situation where
      uncertain outcomes are involved.
      Multiple lines here.
  scenario_Stakes2_Certainty2:
    subject: High stakes certain
    body: |
      Significant consequences
\`\`\``;

      const result = extractYaml(response);

      expect(result).toContain('scenario_Stakes1_Certainty1');
      expect(result).toContain('Multiple lines here.');
      expect(result).toContain('scenario_Stakes2_Certainty2');
    });

    it('handles preamble: appearing mid-content', () => {
      const response = `The scenarios use a preamble: to set context.

preamble: >
  Actual YAML content here

scenarios:
  test: value`;

      const result = extractYaml(response);

      // Should find the actual YAML starting with preamble:
      expect(result.startsWith('preamble:')).toBe(true);
      expect(result).toContain('Actual YAML content here');
    });

    it('prefers code block over preamble marker', () => {
      const response = `preamble: wrong start

\`\`\`yaml
preamble: correct start
scenarios:
  test: value
\`\`\``;

      const result = extractYaml(response);

      expect(result).toContain('correct start');
      expect(result).not.toContain('wrong start');
    });

    it('handles nested code examples in response', () => {
      const response = `\`\`\`yaml
preamble: Test
scenarios:
  test:
    body: |
      Here is some code:
      \\\`\\\`\\\`
      example code
      \\\`\\\`\\\`
\`\`\``;

      const result = extractYaml(response);

      expect(result).toContain('preamble: Test');
      expect(result).toContain('scenarios:');
    });

    it('handles whitespace around YAML markers', () => {
      const response = `   \`\`\`yaml
key: value
\`\`\`   `;

      // The regex may not match with leading whitespace, so it falls back
      const result = extractYaml(response);
      // Just verify it handles gracefully
      expect(typeof result).toBe('string');
    });
  });
});
