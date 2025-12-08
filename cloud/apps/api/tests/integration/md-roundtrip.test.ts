/**
 * MD Round-Trip Integration Test
 *
 * Tests that definitions can be exported to MD and re-imported
 * with content preserved (export → import → compare).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db, type DefinitionContent } from '@valuerank/db';
import { exportDefinitionAsMd } from '../../src/services/export/md';
import { parseMdToDefinition } from '../../src/services/import/md';
import { resolveDefinitionContent } from '@valuerank/db';

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

describe('MD Round-Trip Integration', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    // Clean up test definitions
    for (const id of createdIds) {
      await db.definitionTag.deleteMany({ where: { definitionId: id } }).catch(() => {});
      await db.definition.delete({ where: { id } }).catch(() => {});
    }
    createdIds.length = 0;
  });

  describe('export → import → compare', () => {
    it('preserves content through export/import cycle', async () => {
      // Create a test definition with full content
      const originalContent: DefinitionContent = {
        schema_version: 1,
        preamble: 'This is a test preamble for round-trip testing.',
        template: 'Consider this scenario: [Stakeholder] faces [Dilemma].',
        dimensions: [
          {
            name: 'Stakeholder',
            levels: [
              { score: 1, label: 'Individual', options: ['single person', 'lone actor'] },
              { score: 2, label: 'Group', options: ['team', 'community'] },
              { score: 3, label: 'Society', options: ['entire population'] },
            ],
          },
          {
            name: 'Dilemma',
            levels: [
              { score: 1, label: 'Minor', options: ['small issue'] },
              { score: 2, label: 'Major', options: ['critical problem'] },
            ],
          },
        ],
        matching_rules: 'Individual stakeholders should match minor dilemmas.',
      };

      const definition = await db.definition.create({
        data: {
          name: 'roundtrip-test-def',
          content: originalContent,
        },
      });
      createdIds.push(definition.id);

      // Create a tag for category testing
      const tag = await db.tag.upsert({
        where: { name: 'RoundTripCategory' },
        update: {},
        create: { name: 'RoundTripCategory' },
      });
      await db.definitionTag.create({
        data: {
          definitionId: definition.id,
          tagId: tag.id,
        },
      });

      // Export to MD
      const resolvedDef = await resolveDefinitionContent(definition.id);
      const exportResult = exportDefinitionAsMd(
        resolvedDef,
        resolvedDef.resolvedContent,
        [tag]
      );

      // Import from MD
      const parseResult = parseMdToDefinition(exportResult.content);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) return;

      const imported = parseResult.data;

      // Compare core content
      expect(imported.name).toBe('roundtrip-test-def');
      expect(imported.category).toBe('RoundTripCategory');
      expect(imported.content.preamble).toBe(originalContent.preamble);
      expect(imported.content.template).toBe(originalContent.template);
      expect(imported.content.matching_rules).toBe(originalContent.matching_rules);

      // Compare dimensions
      expect(imported.content.dimensions).toHaveLength(2);

      const stakeholderDim = imported.content.dimensions.find(d => d.name === 'Stakeholder');
      expect(stakeholderDim).toBeDefined();
      expect(stakeholderDim!.levels).toHaveLength(3);
      expect(stakeholderDim!.levels![0]!.score).toBe(1);
      expect(stakeholderDim!.levels![0]!.label).toBe('Individual');
      expect(stakeholderDim!.levels![0]!.options).toContain('single person');
      expect(stakeholderDim!.levels![0]!.options).toContain('lone actor');

      const dilemmaDim = imported.content.dimensions.find(d => d.name === 'Dilemma');
      expect(dilemmaDim).toBeDefined();
      expect(dilemmaDim!.levels).toHaveLength(2);
    });

    it('handles special characters in content', async () => {
      const originalContent: DefinitionContent = {
        schema_version: 1,
        preamble: 'Content with "quotes" and special chars: <>&',
        template: 'Template with [Placeholder] and | pipes | in text.',
        dimensions: [
          {
            name: 'Placeholder',
            levels: [
              { score: 1, label: 'Option "A"', options: ['choice 1, with comma'] },
              { score: 2, label: 'Option B', options: ['choice 2'] },
            ],
          },
        ],
      };

      const definition = await db.definition.create({
        data: {
          name: 'special-chars-test',
          content: originalContent,
        },
      });
      createdIds.push(definition.id);

      // Export and reimport
      const resolvedDef = await resolveDefinitionContent(definition.id);
      const exportResult = exportDefinitionAsMd(
        resolvedDef,
        resolvedDef.resolvedContent,
        []
      );

      const parseResult = parseMdToDefinition(exportResult.content);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) return;

      // Verify special characters preserved (quotes and angle brackets in preamble)
      expect(parseResult.data.content.preamble).toContain('"quotes"');
      expect(parseResult.data.content.preamble).toContain('<>&');

      // Verify pipe in template
      expect(parseResult.data.content.template).toContain('| pipes |');
    });

    it('handles definitions without matching rules', async () => {
      const originalContent: DefinitionContent = {
        schema_version: 1,
        preamble: 'Simple preamble.',
        template: 'Simple [Dim] template.',
        dimensions: [
          {
            name: 'Dim',
            levels: [
              { score: 1, label: 'A', options: ['opt a'] },
              { score: 2, label: 'B', options: ['opt b'] },
            ],
          },
        ],
        // No matching_rules
      };

      const definition = await db.definition.create({
        data: {
          name: 'no-rules-test',
          content: originalContent,
        },
      });
      createdIds.push(definition.id);

      const resolvedDef = await resolveDefinitionContent(definition.id);
      const exportResult = exportDefinitionAsMd(
        resolvedDef,
        resolvedDef.resolvedContent,
        []
      );

      const parseResult = parseMdToDefinition(exportResult.content);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) return;

      // matching_rules should be undefined or empty
      expect(parseResult.data.content.matching_rules).toBeFalsy();
    });

  });
});
