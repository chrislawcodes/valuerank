/**
 * YAML CLI Compatibility Test
 *
 * Tests that exported YAML matches the structure expected by
 * the CLI probe.py script (scenarios/*.yaml format).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { parse } from 'yaml';
import { db, type DefinitionContent, type ScenarioContent } from '@valuerank/db';
import { resolveDefinitionContent } from '@valuerank/db';
import { exportScenariosAsYaml } from '../../src/services/export/yaml.js';

// Mock PgBoss
vi.mock('../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  })),
  createBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  startBoss: vi.fn().mockResolvedValue(undefined),
  stopBoss: vi.fn().mockResolvedValue(undefined),
  isBossRunning: vi.fn().mockReturnValue(false),
}));

/**
 * Expected CLI YAML structure.
 * Matches the format in scenarios/*.yaml files.
 */
type CLIYamlFormat = {
  preamble: string;
  scenarios: Record<
    string,
    {
      base_id: string;
      category: string;
      subject: string;
      body: string;
    }
  >;
};

describe('YAML CLI Compatibility', () => {
  const createdDefinitionIds: string[] = [];
  const createdScenarioIds: string[] = [];

  afterEach(async () => {
    // Clean up scenarios first (foreign key)
    for (const id of createdScenarioIds) {
      await db.scenario.delete({ where: { id } }).catch(() => {});
    }
    // Then definitions
    for (const id of createdDefinitionIds) {
      await db.definitionTag.deleteMany({ where: { definitionId: id } }).catch(() => {});
      await db.definition.delete({ where: { id } }).catch(() => {});
    }
    createdDefinitionIds.length = 0;
    createdScenarioIds.length = 0;
  });

  describe('exported YAML structure', () => {
    it('matches CLI scenarios/*.yaml format', async () => {
      // Create definition with realistic content
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: "I'm not asking for a plan or legal advice; I want your moral judgment.",
        template: 'Consider this scenario with [Freedom] and [Safety] implications.',
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

      const definition = await db.definition.create({
        data: { name: 'cli-compat-test', content },
      });
      createdDefinitionIds.push(definition.id);

      // Create scenarios with the expected format
      const scenario1Content: ScenarioContent = {
        schema_version: 1,
        prompt: 'A person must choose between freedom and safety.\n\nWhat should they do?',
        dimension_values: { Freedom: '2', Safety: '1' },
      };

      const scenario2Content: ScenarioContent = {
        schema_version: 1,
        prompt: 'Another dilemma involving personal liberty versus public protection.',
        dimension_values: { Freedom: '1', Safety: '2' },
      };

      const scenario1 = await db.scenario.create({
        data: {
          definitionId: definition.id,
          name: 'scenario_Freedom2_Safety1',
          content: scenario1Content,
        },
      });
      createdScenarioIds.push(scenario1.id);

      const scenario2 = await db.scenario.create({
        data: {
          definitionId: definition.id,
          name: 'scenario_Freedom1_Safety2',
          content: scenario2Content,
        },
      });
      createdScenarioIds.push(scenario2.id);

      // Get scenarios with definition relation
      const scenarios = await db.scenario.findMany({
        where: { definitionId: definition.id },
        include: { definition: true },
      });

      // Get resolved content
      const resolvedDef = await resolveDefinitionContent(definition.id);

      // Export to YAML
      const result = exportScenariosAsYaml(
        resolvedDef,
        resolvedDef.resolvedContent,
        scenarios,
        []
      );

      // Parse and validate structure
      const parsed = parse(result.content) as CLIYamlFormat;

      // Must have preamble at top level
      expect(parsed).toHaveProperty('preamble');
      expect(typeof parsed.preamble).toBe('string');
      expect(parsed.preamble).toContain('moral judgment');

      // Must have scenarios map
      expect(parsed).toHaveProperty('scenarios');
      expect(typeof parsed.scenarios).toBe('object');
      expect(Object.keys(parsed.scenarios).length).toBe(2);

      // Each scenario must have required fields
      for (const [key, scenario] of Object.entries(parsed.scenarios)) {
        expect(typeof key).toBe('string');
        expect(scenario).toHaveProperty('base_id');
        expect(scenario).toHaveProperty('category');
        expect(scenario).toHaveProperty('subject');
        expect(scenario).toHaveProperty('body');

        // Field types
        expect(typeof scenario.base_id).toBe('string');
        expect(typeof scenario.category).toBe('string');
        expect(typeof scenario.subject).toBe('string');
        expect(typeof scenario.body).toBe('string');

        // base_id should follow pattern
        expect(scenario.base_id).toMatch(/^scenario_/);

        // body should contain the prompt
        expect(scenario.body.length).toBeGreaterThan(10);
      }
    });

    it('preserves multi-line body text with proper formatting', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: 'Test preamble.',
        template: 'Test [Dim].',
        dimensions: [
          {
            name: 'Dim',
            levels: [
              { score: 1, label: 'A', options: ['a'] },
            ],
          },
        ],
      };

      const definition = await db.definition.create({
        data: { name: 'multiline-test', content },
      });
      createdDefinitionIds.push(definition.id);

      const multiLinePrompt = `First paragraph with context.

Second paragraph with more details.

Give me your judgment on a scale of 1 to 5.
5 - strongly agree
4 - somewhat agree
3 - neutral
2 - somewhat disagree
1 - strongly disagree`;

      const scenario = await db.scenario.create({
        data: {
          definitionId: definition.id,
          name: 'multiline_scenario',
          content: {
            schema_version: 1,
            prompt: multiLinePrompt,
            dimension_values: { Dim: '1' },
          } as ScenarioContent,
        },
      });
      createdScenarioIds.push(scenario.id);

      const scenarios = await db.scenario.findMany({
        where: { definitionId: definition.id },
        include: { definition: true },
      });

      const resolvedDef = await resolveDefinitionContent(definition.id);
      const result = exportScenariosAsYaml(
        resolvedDef,
        resolvedDef.resolvedContent,
        scenarios,
        []
      );

      const parsed = parse(result.content) as CLIYamlFormat;
      const scenarioBody = Object.values(parsed.scenarios)[0]?.body;

      // Multi-line text should be preserved
      expect(scenarioBody).toContain('First paragraph');
      expect(scenarioBody).toContain('Second paragraph');
      expect(scenarioBody).toContain('1 - strongly disagree');
    });

    it('uses tag name as category when available', async () => {
      const content: DefinitionContent = {
        schema_version: 1,
        preamble: 'Test.',
        template: '[Test].',
        dimensions: [{ name: 'Test', levels: [{ score: 1, label: 'A', options: ['a'] }] }],
      };

      const definition = await db.definition.create({
        data: { name: 'tag-category-test', content },
      });
      createdDefinitionIds.push(definition.id);

      const tag = await db.tag.upsert({
        where: { name: 'EthicsCategory' },
        update: {},
        create: { name: 'EthicsCategory' },
      });

      await db.definitionTag.create({
        data: { definitionId: definition.id, tagId: tag.id },
      });

      const scenario = await db.scenario.create({
        data: {
          definitionId: definition.id,
          name: 'test_scenario',
          content: { schema_version: 1, prompt: 'Test.', dimension_values: {} } as ScenarioContent,
        },
      });
      createdScenarioIds.push(scenario.id);

      const scenarios = await db.scenario.findMany({
        where: { definitionId: definition.id },
        include: { definition: true },
      });

      const tags = await db.tag.findMany({
        where: { definitions: { some: { definitionId: definition.id } } },
      });

      const resolvedDef = await resolveDefinitionContent(definition.id);
      const result = exportScenariosAsYaml(
        resolvedDef,
        resolvedDef.resolvedContent,
        scenarios,
        tags
      );

      const parsed = parse(result.content) as CLIYamlFormat;
      const scenarioCategory = Object.values(parsed.scenarios)[0]?.category;

      expect(scenarioCategory).toBe('EthicsCategory');
    });
  });
});
