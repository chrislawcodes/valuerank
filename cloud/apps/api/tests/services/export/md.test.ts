/**
 * MD Serializer Tests
 *
 * Tests for markdown definition export functionality.
 */

import { describe, it, expect } from 'vitest';
import {
  exportDefinitionAsMd,
  serializeDefinitionToMd,
  contentToMDDefinition,
  generateMdFilename,
} from '../../../src/services/export/md.js';
import {
  SAMPLE_DEFINITION,
  SAMPLE_DEFINITION_CONTENT,
  SAMPLE_TAG,
  SAMPLE_MD_DEFINITION,
} from './fixtures.js';
import type { DefinitionContent, Dimension } from '@valuerank/db';
import type { Definition, Tag } from '@prisma/client';

describe('MD Serializer', () => {
  describe('contentToMDDefinition', () => {
    it('converts cloud definition to MD format', () => {
      const result = contentToMDDefinition(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        [SAMPLE_TAG]
      );

      expect(result.name).toBe('test-freedom-safety');
      expect(result.category).toBe('Ethics');
      expect(result.preamble).toBe(SAMPLE_DEFINITION_CONTENT.preamble);
      expect(result.template).toBe(SAMPLE_DEFINITION_CONTENT.template);
      expect(result.dimensions).toHaveLength(2);
    });

    it('uses dimension names as category when no tags', () => {
      const result = contentToMDDefinition(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        []
      );

      expect(result.category).toBe('Freedom_vs_Safety');
    });

    it('converts levels format correctly', () => {
      const result = contentToMDDefinition(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        [SAMPLE_TAG]
      );

      const freedomDim = result.dimensions.find((d) => d.name === 'Freedom');
      expect(freedomDim).toBeDefined();
      expect(freedomDim!.values).toHaveLength(3);
      expect(freedomDim!.values[0]).toEqual({
        score: 1,
        label: 'Low',
        options: ['minimal autonomy', 'restricted choice'],
      });
    });

    it('generates base_id from definition name', () => {
      const result = contentToMDDefinition(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        []
      );

      expect(result.base_id).toMatch(/^scenario_/);
    });
  });

  describe('serializeDefinitionToMd', () => {
    it('produces valid markdown with all sections', () => {
      const md = serializeDefinitionToMd(SAMPLE_MD_DEFINITION);

      // Check frontmatter
      expect(md).toContain('---');
      expect(md).toContain('name: test-freedom-safety');
      expect(md).toContain('base_id: scenario_001');
      expect(md).toContain('category: Ethics');

      // Check sections
      expect(md).toContain('# Preamble');
      expect(md).toContain('# Template');
      expect(md).toContain('# Dimensions');
      expect(md).toContain('# Matching Rules');
    });

    it('formats dimension tables correctly', () => {
      const md = serializeDefinitionToMd(SAMPLE_MD_DEFINITION);

      // Check table headers
      expect(md).toContain('| Score | Label | Options |');
      expect(md).toContain('|-------|-------|---------|');

      // Check dimension content
      expect(md).toContain('## Freedom');
      expect(md).toContain('| 1 | Low | minimal autonomy, restricted choice |');
      expect(md).toContain('## Safety');
    });

    it('omits matching rules section when empty', () => {
      const defWithoutRules = {
        ...SAMPLE_MD_DEFINITION,
        matchingRules: '',
      };

      const md = serializeDefinitionToMd(defWithoutRules);

      expect(md).not.toContain('# Matching Rules');
    });

    it('preserves special characters in content', () => {
      const defWithSpecialChars = {
        ...SAMPLE_MD_DEFINITION,
        preamble: 'Content with | pipe and > arrow and "quotes"',
      };

      const md = serializeDefinitionToMd(defWithSpecialChars);

      expect(md).toContain('| pipe');
      expect(md).toContain('> arrow');
      expect(md).toContain('"quotes"');
    });

    it('sorts dimension values by score ascending', () => {
      const defWithUnsortedScores = {
        ...SAMPLE_MD_DEFINITION,
        dimensions: [
          {
            name: 'TestDim',
            values: [
              { score: 3, label: 'High', options: ['high'] },
              { score: 1, label: 'Low', options: ['low'] },
              { score: 2, label: 'Medium', options: ['medium'] },
            ],
          },
        ],
      };

      const md = serializeDefinitionToMd(defWithUnsortedScores);

      // Find the table rows and verify order
      const tableMatch = md.match(/\| 1 \| Low[\s\S]*\| 2 \| Medium[\s\S]*\| 3 \| High/);
      expect(tableMatch).toBeTruthy();
    });
  });

  describe('exportDefinitionAsMd', () => {
    it('returns ExportResult with correct content', () => {
      const result = exportDefinitionAsMd(
        SAMPLE_DEFINITION,
        SAMPLE_DEFINITION_CONTENT,
        [SAMPLE_TAG]
      );

      expect(result.mimeType).toBe('text/markdown');
      expect(result.filename).toMatch(/\.md$/);
      expect(result.content).toContain('# Preamble');
    });

    it('generates safe filename from definition name', () => {
      const defWithSpecialName: Definition = {
        ...SAMPLE_DEFINITION,
        name: 'test/with:special*chars?',
      };

      const result = exportDefinitionAsMd(
        defWithSpecialName,
        SAMPLE_DEFINITION_CONTENT,
        []
      );

      expect(result.filename).toBe('test_with_special_chars_.md');
      expect(result.filename).not.toMatch(/[/:*?]/);
    });

    it('truncates long filenames', () => {
      const defWithLongName: Definition = {
        ...SAMPLE_DEFINITION,
        name: 'a'.repeat(100),
      };

      const result = exportDefinitionAsMd(
        defWithLongName,
        SAMPLE_DEFINITION_CONTENT,
        []
      );

      expect(result.filename.length).toBeLessThanOrEqual(54); // 50 chars + '.md'
    });
  });

  describe('generateMdFilename', () => {
    it('creates valid filename from name', () => {
      expect(generateMdFilename('simple-name')).toBe('simple-name.md');
    });

    it('sanitizes special characters', () => {
      expect(generateMdFilename('name/with:chars')).toBe('name_with_chars.md');
    });

    it('collapses multiple underscores', () => {
      expect(generateMdFilename('name   with   spaces')).toBe('name_with_spaces.md');
    });
  });

  describe('empty dimensions edge case', () => {
    it('handles definition with no dimensions', () => {
      const emptyDimContent: DefinitionContent = {
        schema_version: 1,
        preamble: 'Test preamble',
        template: 'Test template',
        dimensions: [],
      };

      const result = exportDefinitionAsMd(
        SAMPLE_DEFINITION,
        emptyDimContent,
        []
      );

      expect(result.content).toContain('# Dimensions');
      expect(result.content).not.toContain('## '); // No dimension headers
    });
  });
});
