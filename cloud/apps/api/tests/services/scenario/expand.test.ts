/**
 * Unit tests for Scenario Expansion Service
 *
 * Tests LLM-based scenario generation from definitions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@valuerank/db';
import { expandScenarios, type ExpandScenariosResult } from '../../../src/services/scenario/expand.js';

// Mock the LLM generate module
vi.mock('../../../src/services/llm/generate.js', () => ({
  callLLM: vi.fn(),
  extractYaml: vi.fn(),
}));

// Import mocked functions
import { callLLM, extractYaml } from '../../../src/services/llm/generate.js';

const mockedCallLLM = vi.mocked(callLLM);
const mockedExtractYaml = vi.mocked(extractYaml);

describe('Scenario Expansion Service', () => {
  // Track created test data for cleanup
  let testDefinitionId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create test definition
    const definition = await db.definition.create({
      data: {
        name: `test-expand-${Date.now()}`,
        content: {},
      },
    });
    testDefinitionId = definition.id;
  });

  afterEach(async () => {
    // Clean up test data
    await db.scenario.deleteMany({
      where: { definitionId: testDefinitionId },
    });
    await db.definition.deleteMany({
      where: { id: testDefinitionId },
    });
  });

  describe('expandScenarios', () => {
    describe('when content has no dimensions', () => {
      it('creates a single default scenario with template as prompt', async () => {
        const content = {
          template: 'A doctor must decide whether to save one patient or another.',
          preamble: 'You are participating in a research study.',
        };

        const result = await expandScenarios(testDefinitionId, content);

        expect(result.created).toBe(1);
        expect(mockedCallLLM).not.toHaveBeenCalled();

        // Verify scenario was created
        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });
        expect(scenarios).toHaveLength(1);
        expect(scenarios[0].name).toBe('Default Scenario');
        expect((scenarios[0].content as { prompt: string }).prompt).toBe(content.template);
        expect((scenarios[0].content as { preamble: string }).preamble).toBe(content.preamble);
      });

      it('creates default scenario when dimensions array is empty', async () => {
        const content = {
          template: 'A trolley is heading towards five people.',
          dimensions: [],
        };

        const result = await expandScenarios(testDefinitionId, content);

        expect(result.created).toBe(1);
        expect(mockedCallLLM).not.toHaveBeenCalled();
      });

      it('creates default scenario when template is empty', async () => {
        const content = {
          template: '',
          dimensions: [{ name: 'Stakes', levels: [{ score: 1, label: 'Low' }] }],
        };

        const result = await expandScenarios(testDefinitionId, content);

        expect(result.created).toBe(1);
        expect(mockedCallLLM).not.toHaveBeenCalled();
      });
    });

    describe('when content has dimensions with levels', () => {
      const contentWithDimensions = {
        template: 'A [Stakes] situation where [Certainty] outcomes are involved.',
        preamble: 'Ethical dilemma study',
        dimensions: [
          {
            name: 'Stakes',
            levels: [
              { score: 1, label: 'Low', options: ['minor inconvenience', 'small loss'] },
              { score: 2, label: 'Medium', options: ['significant harm', 'major loss'] },
              { score: 3, label: 'High', options: ['life-threatening', 'catastrophic'] },
            ],
          },
          {
            name: 'Certainty',
            levels: [
              { score: 1, label: 'Uncertain', options: ['uncertain', 'possible'] },
              { score: 2, label: 'Certain', options: ['certain', 'definite'] },
            ],
          },
        ],
      };

      it('calls LLM with generated prompt and parses YAML response', async () => {
        const mockYamlResponse = `
preamble: >
  Ethical dilemma study

scenarios:
  scenario_Stakes1_Certainty1:
    base_id: scenario
    category: Stakes_vs_Certainty
    subject: Low stakes with uncertain outcomes
    body: |
      A minor inconvenience situation where uncertain outcomes are involved.
  scenario_Stakes1_Certainty2:
    base_id: scenario
    category: Stakes_vs_Certainty
    subject: Low stakes with certain outcomes
    body: |
      A small loss situation where definite outcomes are involved.
  scenario_Stakes2_Certainty1:
    base_id: scenario
    category: Stakes_vs_Certainty
    subject: Medium stakes with uncertain outcomes
    body: |
      A significant harm situation where possible outcomes are involved.
`;

        mockedCallLLM.mockResolvedValue(mockYamlResponse);
        mockedExtractYaml.mockReturnValue(mockYamlResponse.trim());

        const result = await expandScenarios(testDefinitionId, contentWithDimensions);

        // Verify LLM was called
        expect(mockedCallLLM).toHaveBeenCalledOnce();
        const prompt = mockedCallLLM.mock.calls[0][0];
        expect(prompt).toContain('Stakes');
        expect(prompt).toContain('Certainty');
        expect(prompt).toContain('Score 1 (Low)');
        expect(prompt).toContain('Score 3 (High)');

        // Verify options passed
        expect(mockedCallLLM.mock.calls[0][1]).toEqual({
          temperature: 0.7,
          maxTokens: 64000,
          timeoutMs: 300000,
        });

        // Verify scenarios created
        expect(result.created).toBe(3);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });
        expect(scenarios).toHaveLength(3);
      });

      it('extracts dimension scores from scenario keys', async () => {
        const mockYamlResponse = `
preamble: Test preamble

scenarios:
  scenario_Stakes2_Certainty1:
    subject: Medium uncertain
    body: |
      Test scenario body
`;

        mockedCallLLM.mockResolvedValue(mockYamlResponse);
        mockedExtractYaml.mockReturnValue(mockYamlResponse.trim());

        await expandScenarios(testDefinitionId, contentWithDimensions);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });
        expect(scenarios).toHaveLength(1);

        const content = scenarios[0].content as { dimensions: Record<string, number> };
        expect(content.dimensions.Stakes).toBe(2);
        expect(content.dimensions.Certainty).toBe(1);
      });
    });

    describe('when content has dimensions with values (DB format)', () => {
      it('converts values to levels with incremental scores', async () => {
        const content = {
          template: 'A [Risk] decision with [Impact] consequences.',
          dimensions: [
            { name: 'Risk', values: ['low risk', 'high risk'] },
            { name: 'Impact', values: ['minor', 'major', 'severe'] },
          ],
        };

        const mockYamlResponse = `
scenarios:
  scenario_Risk1_Impact1:
    subject: Low risk minor impact
    body: A low risk decision with minor consequences.
`;

        mockedCallLLM.mockResolvedValue(mockYamlResponse);
        mockedExtractYaml.mockReturnValue(mockYamlResponse.trim());

        await expandScenarios(testDefinitionId, content);

        expect(mockedCallLLM).toHaveBeenCalledOnce();
        const prompt = mockedCallLLM.mock.calls[0][0];
        // Values format should be converted to score-based format
        expect(prompt).toContain('Risk');
        expect(prompt).toContain('Impact');
      });
    });

    describe('soft delete behavior', () => {
      it('soft deletes existing scenarios before creating new ones', async () => {
        // Create existing scenario
        await db.scenario.create({
          data: {
            definitionId: testDefinitionId,
            name: 'Existing Scenario',
            content: { prompt: 'Old scenario' },
          },
        });

        const content = {
          template: 'New template',
          preamble: 'New preamble',
        };

        const result = await expandScenarios(testDefinitionId, content);

        expect(result.deleted).toBe(1);
        expect(result.created).toBe(1);

        // Old scenario should be soft deleted
        const allScenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId },
        });
        expect(allScenarios).toHaveLength(2);

        const activeScenarios = allScenarios.filter((s) => s.deletedAt === null);
        expect(activeScenarios).toHaveLength(1);
        expect(activeScenarios[0].name).toBe('Default Scenario');

        const deletedScenarios = allScenarios.filter((s) => s.deletedAt !== null);
        expect(deletedScenarios).toHaveLength(1);
        expect(deletedScenarios[0].name).toBe('Existing Scenario');
      });
    });

    describe('error handling', () => {
      it('creates fallback scenario when LLM call fails', async () => {
        const content = {
          template: 'Template with [Dimension] placeholder.',
          dimensions: [
            {
              name: 'Dimension',
              levels: [
                { score: 1, label: 'Low' },
                { score: 2, label: 'High' },
              ],
            },
          ],
        };

        mockedCallLLM.mockRejectedValue(new Error('API timeout'));

        const result = await expandScenarios(testDefinitionId, content);

        expect(result.created).toBe(1);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });
        expect(scenarios).toHaveLength(1);
        expect(scenarios[0].name).toBe('Default Scenario');
        expect((scenarios[0].content as { prompt: string }).prompt).toBe(content.template);
      });

      it('creates fallback scenario when YAML parsing fails', async () => {
        const content = {
          template: 'Template text',
          dimensions: [
            {
              name: 'Test',
              levels: [{ score: 1, label: 'One' }],
            },
          ],
        };

        mockedCallLLM.mockResolvedValue('Invalid response without YAML');
        mockedExtractYaml.mockReturnValue('not: valid: yaml: [broken');

        const result = await expandScenarios(testDefinitionId, content);

        expect(result.created).toBe(1);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });
        expect(scenarios).toHaveLength(1);
        expect(scenarios[0].name).toBe('Default Scenario');
      });

      it('creates fallback scenario when parsed YAML has no scenarios', async () => {
        const content = {
          template: 'Template',
          dimensions: [
            {
              name: 'Dim',
              levels: [{ score: 1, label: 'L' }],
            },
          ],
        };

        mockedCallLLM.mockResolvedValue('preamble: test');
        mockedExtractYaml.mockReturnValue('preamble: test');

        const result = await expandScenarios(testDefinitionId, content);

        expect(result.created).toBe(1);
      });
    });

    describe('edge cases', () => {
      it('handles dimensions with no values', async () => {
        const content = {
          template: 'Template with [Empty] dimension.',
          dimensions: [
            { name: 'Empty', levels: [] },
            { name: 'HasValues', levels: [{ score: 1, label: 'One' }] },
          ],
        };

        const mockYamlResponse = `
scenarios:
  scenario_HasValues1:
    subject: Test
    body: Test body
`;
        mockedCallLLM.mockResolvedValue(mockYamlResponse);
        mockedExtractYaml.mockReturnValue(mockYamlResponse.trim());

        const result = await expandScenarios(testDefinitionId, content);

        // Should only use dimension with values
        expect(mockedCallLLM).toHaveBeenCalled();
        const prompt = mockedCallLLM.mock.calls[0][0];
        expect(prompt).toContain('HasValues');
        expect(prompt).not.toContain('Empty:');
      });

      it('handles dimensions where all have no values', async () => {
        const content = {
          template: 'Template',
          dimensions: [
            { name: 'Empty1', levels: [] },
            { name: 'Empty2', values: [] },
          ],
        };

        const result = await expandScenarios(testDefinitionId, content);

        expect(result.created).toBe(1);
        expect(mockedCallLLM).not.toHaveBeenCalled();
      });

      it('preserves preamble from parsed YAML over definition content', async () => {
        const content = {
          template: 'Template',
          preamble: 'Original preamble',
          dimensions: [
            {
              name: 'Test',
              levels: [{ score: 1, label: 'One' }],
            },
          ],
        };

        const mockYamlResponse = `
preamble: >
  LLM generated preamble

scenarios:
  scenario_Test1:
    subject: Test scenario
    body: Body text
`;
        mockedCallLLM.mockResolvedValue(mockYamlResponse);
        mockedExtractYaml.mockReturnValue(mockYamlResponse.trim());

        await expandScenarios(testDefinitionId, content);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });

        const scenarioContent = scenarios[0].content as { preamble: string };
        expect(scenarioContent.preamble).toContain('LLM generated preamble');
      });

      it('uses subject from YAML as scenario name', async () => {
        const content = {
          template: 'Template',
          dimensions: [
            {
              name: 'Test',
              levels: [{ score: 1, label: 'One' }],
            },
          ],
        };

        const mockYamlResponse = `
scenarios:
  scenario_Test1:
    subject: Custom Scenario Title
    body: Body text
`;
        mockedCallLLM.mockResolvedValue(mockYamlResponse);
        mockedExtractYaml.mockReturnValue(mockYamlResponse.trim());

        await expandScenarios(testDefinitionId, content);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });

        expect(scenarios[0].name).toBe('Custom Scenario Title');
      });

      it('falls back to scenario key when subject is missing', async () => {
        const content = {
          template: 'Template',
          dimensions: [
            {
              name: 'Test',
              levels: [{ score: 1, label: 'One' }],
            },
          ],
        };

        const mockYamlResponse = `
scenarios:
  scenario_Test1:
    body: Body text only
`;
        mockedCallLLM.mockResolvedValue(mockYamlResponse);
        mockedExtractYaml.mockReturnValue(mockYamlResponse.trim());

        await expandScenarios(testDefinitionId, content);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });

        expect(scenarios[0].name).toBe('scenario_Test1');
      });

      it('omits preamble from scenarios when definition has empty preamble', async () => {
        const content = {
          template: 'Template with [Test] value.',
          preamble: '', // Empty preamble
          dimensions: [
            {
              name: 'Test',
              levels: [{ score: 1, label: 'One' }],
            },
          ],
        };

        const mockYamlResponse = `
scenarios:
  scenario_Test1:
    subject: Test scenario
    body: Template with One value.
`;
        mockedCallLLM.mockResolvedValue(mockYamlResponse);
        mockedExtractYaml.mockReturnValue(mockYamlResponse.trim());

        await expandScenarios(testDefinitionId, content);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });

        expect(scenarios).toHaveLength(1);
        const scenarioContent = scenarios[0].content as { preamble?: string };
        expect(scenarioContent.preamble).toBeUndefined();
      });

      it('omits preamble when definition has whitespace-only preamble', async () => {
        const content = {
          template: 'Template',
          preamble: '   \n  ', // Whitespace-only preamble
          dimensions: [
            {
              name: 'Test',
              levels: [{ score: 1, label: 'One' }],
            },
          ],
        };

        const mockYamlResponse = `
scenarios:
  scenario_Test1:
    subject: Test scenario
    body: Body text
`;
        mockedCallLLM.mockResolvedValue(mockYamlResponse);
        mockedExtractYaml.mockReturnValue(mockYamlResponse.trim());

        await expandScenarios(testDefinitionId, content);

        const scenarios = await db.scenario.findMany({
          where: { definitionId: testDefinitionId, deletedAt: null },
        });

        const scenarioContent = scenarios[0].content as { preamble?: string };
        expect(scenarioContent.preamble).toBeUndefined();
      });

      it('does not include preamble section in LLM prompt when preamble is empty', async () => {
        const content = {
          template: 'Template with [Test] placeholder.',
          preamble: '', // Empty preamble
          dimensions: [
            {
              name: 'Test',
              levels: [{ score: 1, label: 'One' }],
            },
          ],
        };

        const mockYamlResponse = `
scenarios:
  scenario_Test1:
    subject: Test
    body: Template with One placeholder.
`;
        mockedCallLLM.mockResolvedValue(mockYamlResponse);
        mockedExtractYaml.mockReturnValue(mockYamlResponse.trim());

        await expandScenarios(testDefinitionId, content);

        // Check that the LLM prompt does not include preamble instructions
        const prompt = mockedCallLLM.mock.calls[0][0];
        expect(prompt).not.toContain('## Preamble');
        expect(prompt).not.toContain('preamble: >');
      });
    });
  });
});
