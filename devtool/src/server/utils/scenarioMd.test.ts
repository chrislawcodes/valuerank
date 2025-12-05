import { describe, it, expect } from 'vitest';
import {
  parseScenarioMd,
  serializeScenarioMd,
  buildGenerationPrompt,
  type ScenarioDefinition,
} from './scenarioMd.js';

describe('scenarioMd utilities', () => {
  describe('parseScenarioMd', () => {
    it('should parse frontmatter correctly', () => {
      const content = `---
name: test-scenario
base_id: scenario_001
category: Test_Category
---

# Preamble

Test preamble text

# Template

Test template

# Dimensions

## TestDim

| Score | Label | Options |
|-------|-------|---------|
| 1 | Low | opt1, opt2 |
| 2 | High | opt3 |
`;

      const result = parseScenarioMd(content);

      expect(result.name).toBe('test-scenario');
      expect(result.base_id).toBe('scenario_001');
      expect(result.category).toBe('Test_Category');
    });

    it('should parse preamble section', () => {
      const content = `---
name: test
base_id: scenario_001
category: Test
---

# Preamble

This is the preamble.
It can span multiple lines.

# Template

Template content
`;

      const result = parseScenarioMd(content);

      expect(result.preamble).toContain('This is the preamble.');
      expect(result.preamble).toContain('It can span multiple lines.');
    });

    it('should parse template section', () => {
      const content = `---
name: test
base_id: scenario_001
category: Test
---

# Preamble

Preamble here

# Template

This is the [placeholder] template.
With [another] placeholder.
`;

      const result = parseScenarioMd(content);

      expect(result.template).toContain('This is the [placeholder] template.');
      expect(result.template).toContain('With [another] placeholder.');
    });

    it('should parse dimensions table correctly', () => {
      const content = `---
name: test
base_id: scenario_001
category: Test
---

# Preamble

Preamble

# Template

Template

# Dimensions

## Severity

| Score | Label | Options |
|-------|-------|---------|
| 1 | Minor | scratched paint, dented fender |
| 2 | Moderate | broken window, flat tire |
| 3 | Severe | totaled car, major collision |

## Cost

| Score | Label | Options |
|-------|-------|---------|
| 1 | Low | under $100 |
| 2 | High | over $1000 |
`;

      const result = parseScenarioMd(content);

      expect(result.dimensions).toHaveLength(2);

      const severity = result.dimensions.find((d) => d.name === 'Severity');
      expect(severity).toBeDefined();
      expect(severity!.values).toHaveLength(3);
      expect(severity!.values[0]).toEqual({
        score: 1,
        label: 'Minor',
        options: ['scratched paint', 'dented fender'],
      });
      expect(severity!.values[2]).toEqual({
        score: 3,
        label: 'Severe',
        options: ['totaled car', 'major collision'],
      });

      const cost = result.dimensions.find((d) => d.name === 'Cost');
      expect(cost).toBeDefined();
      expect(cost!.values).toHaveLength(2);
    });

    it('should sort dimension values by score', () => {
      const content = `---
name: test
base_id: scenario_001
category: Test
---

# Preamble

Preamble

# Template

Template

# Dimensions

## OutOfOrder

| Score | Label | Options |
|-------|-------|---------|
| 3 | High | three |
| 1 | Low | one |
| 2 | Medium | two |
`;

      const result = parseScenarioMd(content);
      const dim = result.dimensions[0];

      expect(dim.values[0].score).toBe(1);
      expect(dim.values[1].score).toBe(2);
      expect(dim.values[2].score).toBe(3);
    });

    it('should parse matching rules section', () => {
      const content = `---
name: test
base_id: scenario_001
category: Test
---

# Preamble

Preamble

# Template

Template

# Dimensions

## Dim

| Score | Label | Options |
|-------|-------|---------|
| 1 | Low | opt1 |

# Matching Rules

Only valid when Dim1 score >= Dim2 score.
Skip combinations where both are at maximum.
`;

      const result = parseScenarioMd(content);

      expect(result.matchingRules).toContain('Only valid when Dim1 score >= Dim2 score');
      expect(result.matchingRules).toContain('Skip combinations where both are at maximum');
    });

    it('should handle missing sections gracefully', () => {
      const content = `---
name: minimal
base_id: scenario_001
---

# Template

Just a template
`;

      const result = parseScenarioMd(content);

      expect(result.name).toBe('minimal');
      expect(result.category).toBe('');
      expect(result.preamble).toBe('');
      expect(result.template).toContain('Just a template');
      expect(result.dimensions).toEqual([]);
      expect(result.matchingRules).toBe('');
    });

    it('should use defaults when frontmatter is missing', () => {
      const content = `# Preamble

Some preamble

# Template

Some template
`;

      const result = parseScenarioMd(content);

      expect(result.name).toBe('unnamed');
      expect(result.base_id).toBe('scenario_001');
    });
  });

  describe('serializeScenarioMd', () => {
    it('should serialize frontmatter correctly', () => {
      const def: ScenarioDefinition = {
        name: 'test-scenario',
        base_id: 'scenario_042',
        category: 'Test_vs_Production',
        preamble: 'Test preamble',
        template: 'Test template',
        dimensions: [],
        matchingRules: '',
      };

      const result = serializeScenarioMd(def);

      expect(result).toContain('---');
      expect(result).toContain('name: test-scenario');
      expect(result).toContain('base_id: scenario_042');
      expect(result).toContain('category: Test_vs_Production');
    });

    it('should serialize preamble and template', () => {
      const def: ScenarioDefinition = {
        name: 'test',
        base_id: 'scenario_001',
        category: 'Test',
        preamble: 'This is the preamble text.',
        template: 'This is the template with [placeholder].',
        dimensions: [],
        matchingRules: '',
      };

      const result = serializeScenarioMd(def);

      expect(result).toContain('# Preamble');
      expect(result).toContain('This is the preamble text.');
      expect(result).toContain('# Template');
      expect(result).toContain('This is the template with [placeholder].');
    });

    it('should serialize dimensions as markdown tables', () => {
      const def: ScenarioDefinition = {
        name: 'test',
        base_id: 'scenario_001',
        category: 'Test',
        preamble: 'Preamble',
        template: 'Template',
        dimensions: [
          {
            name: 'Severity',
            values: [
              { score: 1, label: 'Low', options: ['minor', 'small'] },
              { score: 2, label: 'Medium', options: ['moderate'] },
              { score: 3, label: 'High', options: ['severe', 'critical'] },
            ],
          },
        ],
        matchingRules: '',
      };

      const result = serializeScenarioMd(def);

      expect(result).toContain('# Dimensions');
      expect(result).toContain('## Severity');
      expect(result).toContain('| Score | Label | Options |');
      expect(result).toContain('|-------|-------|---------|');
      expect(result).toContain('| 1 | Low | minor, small |');
      expect(result).toContain('| 2 | Medium | moderate |');
      expect(result).toContain('| 3 | High | severe, critical |');
    });

    it('should serialize matching rules when present', () => {
      const def: ScenarioDefinition = {
        name: 'test',
        base_id: 'scenario_001',
        category: 'Test',
        preamble: 'Preamble',
        template: 'Template',
        dimensions: [],
        matchingRules: 'Some matching rules here.',
      };

      const result = serializeScenarioMd(def);

      expect(result).toContain('# Matching Rules');
      expect(result).toContain('Some matching rules here.');
    });

    it('should omit matching rules section when empty', () => {
      const def: ScenarioDefinition = {
        name: 'test',
        base_id: 'scenario_001',
        category: 'Test',
        preamble: 'Preamble',
        template: 'Template',
        dimensions: [],
        matchingRules: '',
      };

      const result = serializeScenarioMd(def);

      expect(result).not.toContain('# Matching Rules');
    });

    it('should sort dimension values by score when serializing', () => {
      const def: ScenarioDefinition = {
        name: 'test',
        base_id: 'scenario_001',
        category: 'Test',
        preamble: 'Preamble',
        template: 'Template',
        dimensions: [
          {
            name: 'Order',
            values: [
              { score: 3, label: 'Third', options: ['c'] },
              { score: 1, label: 'First', options: ['a'] },
              { score: 2, label: 'Second', options: ['b'] },
            ],
          },
        ],
        matchingRules: '',
      };

      const result = serializeScenarioMd(def);
      const lines = result.split('\n');
      const firstRowIdx = lines.findIndex((l) => l.includes('| 1 |'));
      const secondRowIdx = lines.findIndex((l) => l.includes('| 2 |'));
      const thirdRowIdx = lines.findIndex((l) => l.includes('| 3 |'));

      expect(firstRowIdx).toBeLessThan(secondRowIdx);
      expect(secondRowIdx).toBeLessThan(thirdRowIdx);
    });
  });

  describe('round-trip parsing and serializing', () => {
    it('should preserve data through parse-serialize-parse cycle', () => {
      const original: ScenarioDefinition = {
        name: 'roundtrip-test',
        base_id: 'scenario_099',
        category: 'Integration_Test',
        preamble: 'This is a comprehensive preamble for testing.',
        template: 'The [subject] did [action] with [intensity] intensity.',
        dimensions: [
          {
            name: 'Subject',
            values: [
              { score: 1, label: 'Person', options: ['Alice', 'Bob'] },
              { score: 2, label: 'Group', options: ['team', 'committee'] },
            ],
          },
          {
            name: 'Intensity',
            values: [
              { score: 1, label: 'Low', options: ['minimal', 'slight'] },
              { score: 2, label: 'Medium', options: ['moderate'] },
              { score: 3, label: 'High', options: ['extreme', 'intense'] },
            ],
          },
        ],
        matchingRules: 'Avoid high intensity with single person.',
      };

      const serialized = serializeScenarioMd(original);
      const parsed = parseScenarioMd(serialized);

      expect(parsed.name).toBe(original.name);
      expect(parsed.base_id).toBe(original.base_id);
      expect(parsed.category).toBe(original.category);
      expect(parsed.preamble.trim()).toBe(original.preamble);
      expect(parsed.template.trim()).toBe(original.template);
      expect(parsed.matchingRules.trim()).toBe(original.matchingRules);
      expect(parsed.dimensions).toHaveLength(2);

      // Check dimensions
      const subject = parsed.dimensions.find((d) => d.name === 'Subject');
      expect(subject?.values).toHaveLength(2);
      expect(subject?.values[0].options).toContain('Alice');

      const intensity = parsed.dimensions.find((d) => d.name === 'Intensity');
      expect(intensity?.values).toHaveLength(3);
    });
  });

  describe('buildGenerationPrompt', () => {
    it('should include preamble in prompt', () => {
      const def: ScenarioDefinition = {
        name: 'test',
        base_id: 'scenario_001',
        category: 'Test',
        preamble: 'Specific preamble instructions here.',
        template: 'Template',
        dimensions: [],
        matchingRules: '',
      };

      const prompt = buildGenerationPrompt(def);

      expect(prompt).toContain('Specific preamble instructions here.');
    });

    it('should include template with placeholder info', () => {
      const def: ScenarioDefinition = {
        name: 'test',
        base_id: 'scenario_001',
        category: 'Test',
        preamble: 'Preamble',
        template: 'The [subject] performed [action].',
        dimensions: [
          { name: 'Subject', values: [{ score: 1, label: 'Person', options: ['Alice'] }] },
          { name: 'Action', values: [{ score: 1, label: 'Basic', options: ['walked'] }] },
        ],
        matchingRules: '',
      };

      const prompt = buildGenerationPrompt(def);

      expect(prompt).toContain('The [subject] performed [action].');
      expect(prompt).toContain('[subject]');
      expect(prompt).toContain('[action]');
    });

    it('should include dimension definitions with scores and options', () => {
      const def: ScenarioDefinition = {
        name: 'test',
        base_id: 'scenario_001',
        category: 'Test',
        preamble: 'Preamble',
        template: 'Template',
        dimensions: [
          {
            name: 'Severity',
            values: [
              { score: 1, label: 'Low', options: ['minor', 'trivial'] },
              { score: 2, label: 'High', options: ['major', 'critical'] },
            ],
          },
        ],
        matchingRules: '',
      };

      const prompt = buildGenerationPrompt(def);

      expect(prompt).toContain('Severity:');
      expect(prompt).toContain('Score 1 (Low): minor, trivial');
      expect(prompt).toContain('Score 2 (High): major, critical');
    });

    it('should include base_id and category in output format', () => {
      const def: ScenarioDefinition = {
        name: 'test',
        base_id: 'scenario_042',
        category: 'Ethics_vs_Law',
        preamble: 'Preamble',
        template: 'Template',
        dimensions: [],
        matchingRules: '',
      };

      const prompt = buildGenerationPrompt(def);

      expect(prompt).toContain('scenario_042');
      expect(prompt).toContain('Ethics_vs_Law');
    });

    it('should include matching rules when present', () => {
      const def: ScenarioDefinition = {
        name: 'test',
        base_id: 'scenario_001',
        category: 'Test',
        preamble: 'Preamble',
        template: 'Template',
        dimensions: [],
        matchingRules: 'Only allow valid combinations.',
      };

      const prompt = buildGenerationPrompt(def);

      expect(prompt).toContain('Matching Rules');
      expect(prompt).toContain('Only allow valid combinations.');
    });

    it('should not include matching rules section when empty', () => {
      const def: ScenarioDefinition = {
        name: 'test',
        base_id: 'scenario_001',
        category: 'Test',
        preamble: 'Preamble',
        template: 'Template',
        dimensions: [],
        matchingRules: '',
      };

      const prompt = buildGenerationPrompt(def);

      expect(prompt).not.toContain('## Matching Rules:');
    });

    it('should instruct to generate all valid combinations', () => {
      const def: ScenarioDefinition = {
        name: 'test',
        base_id: 'scenario_001',
        category: 'Test',
        preamble: 'Preamble',
        template: 'Template',
        dimensions: [],
        matchingRules: '',
      };

      const prompt = buildGenerationPrompt(def);

      expect(prompt).toContain('Generate ALL valid combinations');
    });
  });
});
