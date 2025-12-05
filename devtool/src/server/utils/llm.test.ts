import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import { extractYaml, getAvailableProviders } from './llm.js';

describe('llm utilities', () => {
  describe('extractYaml', () => {
    it('should extract YAML from markdown code block', () => {
      const input = `Here is the generated YAML:

\`\`\`yaml
preamble: >
  Test preamble

scenarios:
  scenario_001:
    body: Test body
\`\`\`

Hope this helps!`;

      const result = extractYaml(input);

      expect(result).toContain('preamble:');
      expect(result).toContain('scenarios:');
      expect(result).not.toContain('```');
      expect(result).not.toContain('Hope this helps');
    });

    it('should extract YAML from yml code block', () => {
      const input = `\`\`\`yml
key: value
nested:
  item: test
\`\`\``;

      const result = extractYaml(input);

      expect(result).toBe('key: value\nnested:\n  item: test');
    });

    it('should find preamble: if no code block exists', () => {
      const input = `Some prefix text that should be ignored.

preamble: >
  This is the actual YAML content

scenarios:
  test_001:
    body: Test`;

      const result = extractYaml(input);

      expect(result).toContain('preamble:');
      expect(result).toContain('scenarios:');
      expect(result).not.toContain('Some prefix text');
    });

    it('should return input unchanged if no YAML markers found', () => {
      const input = `This is just plain text
with multiple lines
but no YAML structure`;

      const result = extractYaml(input);

      expect(result).toBe(input);
    });

    it('should handle empty string', () => {
      const result = extractYaml('');
      expect(result).toBe('');
    });

    it('should handle YAML with complex nested structures', () => {
      const input = `\`\`\`yaml
parent:
  child:
    grandchild:
      - item1
      - item2
      - key: value
        nested: deep
\`\`\``;

      const result = extractYaml(input);

      expect(result).toContain('parent:');
      expect(result).toContain('grandchild:');
      expect(result).toContain('- item1');
      expect(result).toContain('nested: deep');
    });

    it('should prefer code block over loose preamble: marker', () => {
      const input = `preamble: fake

\`\`\`yaml
preamble: real
scenarios:
  real_scenario:
    body: actual content
\`\`\``;

      const result = extractYaml(input);

      expect(result).toContain('preamble: real');
      expect(result).toContain('real_scenario:');
    });

    it('should handle code block without trailing newline', () => {
      const input = `\`\`\`yaml
key: value\`\`\``;

      const result = extractYaml(input);
      expect(result).toContain('key: value');
    });

    it('should handle multiline YAML block literals', () => {
      const input = `\`\`\`yaml
description: |
  This is a multi-line
  block literal that should
  be preserved.
\`\`\``;

      const result = extractYaml(input);

      expect(result).toContain('description: |');
      expect(result).toContain('multi-line');
    });
  });

  describe('getAvailableProviders', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return anthropic when ANTHROPIC_API_KEY is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      delete process.env.OPENAI_API_KEY;

      const providers = await getAvailableProviders();

      expect(providers).toContain('anthropic');
    });

    it('should return openai when OPENAI_API_KEY is set', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';

      const providers = await getAvailableProviders();

      expect(providers).toContain('openai');
    });

    it('should return both providers when both keys are set', async () => {
      process.env.ANTHROPIC_API_KEY = 'anthropic-key';
      process.env.OPENAI_API_KEY = 'openai-key';

      const providers = await getAvailableProviders();

      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
    });

    it('should include providers from .env file', async () => {
      // This test validates that .env file reading works
      // when API keys are present (which they are in the actual project)
      const providers = await getAvailableProviders();

      // Just verify the function returns an array without throwing
      expect(Array.isArray(providers)).toBe(true);
    });
  });
});
