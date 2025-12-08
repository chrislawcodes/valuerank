/**
 * YAML Serializer Tests
 *
 * Tests for CLI-compatible YAML scenario export.
 */

import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import {
  exportScenariosAsYaml,
  serializeScenariosToYaml,
  generateYamlFilename,
} from '../../../src/services/export/yaml.js';
import type { Definition, Scenario, Tag } from '@prisma/client';
import type { DefinitionContent, ScenarioContent } from '@valuerank/db';
import type { CLIScenarioFile } from '../../../src/services/export/types.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const SAMPLE_DEFINITION: Definition = {
  id: 'def-123',
  parentId: null,
  name: 'test-freedom-safety',
  content: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  lastAccessedAt: null,
  deletedAt: null,
};

const SAMPLE_DEFINITION_CONTENT: DefinitionContent = {
  schema_version: 1,
  preamble: 'You are evaluating an ethical dilemma. Give your moral judgment.',
  template: 'Consider [Freedom] vs [Safety] in this scenario.',
  dimensions: [
    {
      name: 'Freedom',
      levels: [
        { score: 1, label: 'Low', options: ['minimal freedom'] },
        { score: 2, label: 'High', options: ['maximum freedom'] },
      ],
    },
    {
      name: 'Safety',
      levels: [
        { score: 1, label: 'Low', options: ['minimal safety'] },
        { score: 2, label: 'High', options: ['maximum safety'] },
      ],
    },
  ],
};

const SAMPLE_SCENARIO_CONTENT: ScenarioContent = {
  schema_version: 1,
  prompt: 'A person must choose between personal freedom and public safety.\n\nWhat should they do?',
  dimension_values: { Freedom: '2', Safety: '1' },
};

const createScenario = (
  id: string,
  name: string,
  content: ScenarioContent
): Scenario & { definition: Definition } => ({
  id,
  definitionId: SAMPLE_DEFINITION.id,
  name,
  content: content as unknown as Record<string, unknown>,
  createdAt: new Date(),
  deletedAt: null,
  definition: SAMPLE_DEFINITION,
});

const SAMPLE_SCENARIOS = [
  createScenario('scn-1', 'scenario_Freedom2_Safety1', SAMPLE_SCENARIO_CONTENT),
  createScenario('scn-2', 'scenario_Freedom1_Safety2', {
    schema_version: 1,
    prompt: 'Another scenario with different values.',
    dimension_values: { Freedom: '1', Safety: '2' },
  }),
];

const SAMPLE_TAGS: Tag[] = [
  { id: 'tag-1', name: 'Ethics', createdAt: new Date() },
];

// ============================================================================
// TESTS
// ============================================================================

describe('YAML Serializer', () => {
  describe('serializeScenariosToYaml', () => {
    it('produces valid YAML with preamble and scenarios', () => {
      const yaml = serializeScenariosToYaml(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        SAMPLE_SCENARIOS,
        SAMPLE_TAGS
      );

      // Parse to verify it's valid YAML
      const parsed = parse(yaml) as CLIScenarioFile;

      expect(parsed.preamble).toBe(SAMPLE_DEFINITION_CONTENT.preamble);
      expect(Object.keys(parsed.scenarios)).toHaveLength(2);
    });

    it('includes correct scenario structure', () => {
      const yaml = serializeScenariosToYaml(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        SAMPLE_SCENARIOS,
        SAMPLE_TAGS
      );

      const parsed = parse(yaml) as CLIScenarioFile;
      const firstScenario = Object.values(parsed.scenarios)[0];

      expect(firstScenario).toHaveProperty('base_id');
      expect(firstScenario).toHaveProperty('category');
      expect(firstScenario).toHaveProperty('subject');
      expect(firstScenario).toHaveProperty('body');
    });

    it('uses tag name as category', () => {
      const yaml = serializeScenariosToYaml(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        SAMPLE_SCENARIOS,
        SAMPLE_TAGS
      );

      const parsed = parse(yaml) as CLIScenarioFile;
      const firstScenario = Object.values(parsed.scenarios)[0];

      expect(firstScenario?.category).toBe('Ethics');
    });

    it('falls back to dimension names for category when no tags', () => {
      const yaml = serializeScenariosToYaml(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        SAMPLE_SCENARIOS,
        [] // No tags
      );

      const parsed = parse(yaml) as CLIScenarioFile;
      const firstScenario = Object.values(parsed.scenarios)[0];

      expect(firstScenario?.category).toBe('Freedom_vs_Safety');
    });

    it('preserves multi-line body text', () => {
      const yaml = serializeScenariosToYaml(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        SAMPLE_SCENARIOS,
        SAMPLE_TAGS
      );

      const parsed = parse(yaml) as CLIScenarioFile;
      const firstScenario = Object.values(parsed.scenarios)[0];

      // Body should contain the newline from the prompt
      expect(firstScenario?.body).toContain('\n');
      expect(firstScenario?.body).toContain('What should they do?');
    });

    it('generates base_id from definition name', () => {
      const yaml = serializeScenariosToYaml(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        SAMPLE_SCENARIOS,
        SAMPLE_TAGS
      );

      const parsed = parse(yaml) as CLIScenarioFile;
      const firstScenario = Object.values(parsed.scenarios)[0];

      expect(firstScenario?.base_id).toMatch(/^scenario_test_freedom_safety/);
    });

    it('uses scenario name as subject', () => {
      const yaml = serializeScenariosToYaml(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        SAMPLE_SCENARIOS,
        SAMPLE_TAGS
      );

      const parsed = parse(yaml) as CLIScenarioFile;
      const scenarios = Object.values(parsed.scenarios);

      expect(scenarios[0]?.subject).toBe('scenario_Freedom2_Safety1');
      expect(scenarios[1]?.subject).toBe('scenario_Freedom1_Safety2');
    });
  });

  describe('exportScenariosAsYaml', () => {
    it('returns ExportResult with correct properties', () => {
      const result = exportScenariosAsYaml(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        SAMPLE_SCENARIOS,
        SAMPLE_TAGS
      );

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('mimeType');
      expect(result.mimeType).toBe('application/x-yaml');
    });

    it('generates .scenarios.yaml filename', () => {
      const result = exportScenariosAsYaml(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        SAMPLE_SCENARIOS,
        SAMPLE_TAGS
      );

      expect(result.filename).toMatch(/\.scenarios\.yaml$/);
      expect(result.filename).toContain('test-freedom-safety');
    });

    it('throws error when no scenarios provided', () => {
      expect(() =>
        exportScenariosAsYaml(
          SAMPLE_DEFINITION,
          SAMPLE_DEFINITION_CONTENT,
          [], // Empty scenarios
          SAMPLE_TAGS
        )
      ).toThrow('No scenarios to export');
    });

    it('produces parseable YAML content', () => {
      const result = exportScenariosAsYaml(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        SAMPLE_SCENARIOS,
        SAMPLE_TAGS
      );

      // Should not throw
      const parsed = parse(result.content);
      expect(parsed).toBeDefined();
    });
  });

  describe('generateYamlFilename', () => {
    it('creates valid filename from definition name', () => {
      const filename = generateYamlFilename('test-definition');
      expect(filename).toBe('test-definition.scenarios.yaml');
    });

    it('sanitizes special characters', () => {
      const filename = generateYamlFilename('Test Definition!@#$%');
      expect(filename).toBe('Test_Definition_.scenarios.yaml');
    });

    it('collapses multiple underscores', () => {
      const filename = generateYamlFilename('test___definition');
      expect(filename).toBe('test_definition.scenarios.yaml');
    });

    it('truncates long names', () => {
      const longName = 'a'.repeat(100);
      const filename = generateYamlFilename(longName);
      expect(filename.length).toBeLessThanOrEqual(70); // 50 + .scenarios.yaml
    });
  });
});
