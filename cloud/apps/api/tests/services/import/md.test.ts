/**
 * MD Parser Tests
 *
 * Tests for markdown definition import functionality.
 */

import { describe, it, expect } from 'vitest';
import { parseMdToDefinition, isValidMdFormat } from '../../../src/services/import/md.js';
import {
  VALID_MD_FULL,
  VALID_MD_NO_RULES,
  VALID_MD_NO_CATEGORY,
  INVALID_MD_NO_PREAMBLE,
  INVALID_MD_NO_TEMPLATE,
  INVALID_MD_NO_DIMENSIONS,
  INVALID_MD_BAD_TABLE,
  INVALID_MD_NO_FRONTMATTER,
  MD_SPECIAL_CHARS,
  MD_LONG_CONTENT,
} from './fixtures.js';

describe('MD Parser', () => {
  describe('parseMdToDefinition', () => {
    describe('valid input', () => {
      it('parses complete MD with all sections', () => {
        const result = parseMdToDefinition(VALID_MD_FULL);

        expect(result.success).toBe(true);
        if (!result.success) return;

        expect(result.data.name).toBe('complete-definition');
        expect(result.data.baseId).toBe('scenario_complete');
        expect(result.data.category).toBe('FullTest');
        expect(result.data.content.preamble).toContain('ethical scenario');
        expect(result.data.content.template).toContain('[Stakeholder]');
        expect(result.data.content.dimensions).toHaveLength(2);
        expect(result.data.content.matching_rules).toContain('Individual stakeholders');
      });

      it('parses MD without matching rules', () => {
        const result = parseMdToDefinition(VALID_MD_NO_RULES);

        expect(result.success).toBe(true);
        if (!result.success) return;

        expect(result.data.name).toBe('simple-definition');
        expect(result.data.content.matching_rules).toBeFalsy();
      });

      it('parses MD without category in frontmatter', () => {
        const result = parseMdToDefinition(VALID_MD_NO_CATEGORY);

        expect(result.success).toBe(true);
        if (!result.success) return;

        expect(result.data.name).toBe('no-category-def');
        expect(result.data.category).toBeUndefined();
      });

      it('parses dimension tables correctly', () => {
        const result = parseMdToDefinition(VALID_MD_FULL);

        expect(result.success).toBe(true);
        if (!result.success) return;

        const stakeholderDim = result.data.content.dimensions.find(d => d.name === 'Stakeholder');
        expect(stakeholderDim).toBeDefined();
        expect(stakeholderDim!.levels).toHaveLength(3);

        // Check scores are sorted ascending
        expect(stakeholderDim!.levels![0]!.score).toBe(1);
        expect(stakeholderDim!.levels![0]!.label).toBe('Individual');
        expect(stakeholderDim!.levels![0]!.options).toContain('single person');

        expect(stakeholderDim!.levels![2]!.score).toBe(3);
        expect(stakeholderDim!.levels![2]!.label).toBe('Society');
      });

      it('handles special characters in content', () => {
        const result = parseMdToDefinition(MD_SPECIAL_CHARS);

        expect(result.success).toBe(true);
        if (!result.success) return;

        expect(result.data.content.preamble).toContain('"quotes"');
        expect(result.data.content.preamble).toContain('| pipes |');
      });

      it('handles long content', () => {
        const result = parseMdToDefinition(MD_LONG_CONTENT);

        expect(result.success).toBe(true);
        if (!result.success) return;

        expect(result.data.content.preamble.length).toBeGreaterThan(100);
        expect(result.data.content.template.length).toBeGreaterThan(50);
      });
    });

    describe('invalid input', () => {
      it('returns error for missing preamble', () => {
        const result = parseMdToDefinition(INVALID_MD_NO_PREAMBLE);

        expect(result.success).toBe(false);
        if (result.success) return;

        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'preamble' })
        );
      });

      it('returns error for missing template', () => {
        const result = parseMdToDefinition(INVALID_MD_NO_TEMPLATE);

        expect(result.success).toBe(false);
        if (result.success) return;

        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'template' })
        );
      });

      it('returns error for missing frontmatter name', () => {
        const result = parseMdToDefinition(INVALID_MD_NO_FRONTMATTER);

        expect(result.success).toBe(false);
        if (result.success) return;

        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'frontmatter.name' })
        );
      });

      it('returns error for malformed dimension table', () => {
        const result = parseMdToDefinition(INVALID_MD_BAD_TABLE);

        expect(result.success).toBe(false);
        if (result.success) return;

        expect(result.errors).toContainEqual(
          expect.objectContaining({ field: 'dimensions' })
        );
      });
    });

    describe('edge cases', () => {
      it('handles empty dimensions section', () => {
        const md = `---
name: no-dims
---

# Preamble

Preamble text.

# Template

Template text.

# Dimensions
`;
        const result = parseMdToDefinition(md);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.content.dimensions).toHaveLength(0);
      });

      it('handles whitespace in frontmatter values', () => {
        const md = `---
name:   spaced-name
base_id:  scenario_space
---

# Preamble

Preamble.

# Template

Template.
`;
        const result = parseMdToDefinition(md);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.name).toBe('spaced-name');
        expect(result.data.baseId).toBe('scenario_space');
      });
    });
  });

  describe('isValidMdFormat', () => {
    it('returns true for valid format', () => {
      expect(isValidMdFormat(VALID_MD_FULL)).toBe(true);
    });

    it('returns false for missing frontmatter', () => {
      expect(isValidMdFormat(INVALID_MD_NO_FRONTMATTER)).toBe(false);
    });

    it('returns false for missing required sections', () => {
      const noSections = `---
name: test
---

Some random content without headers
`;
      expect(isValidMdFormat(noSections)).toBe(false);
    });

    it('returns false for unclosed frontmatter', () => {
      const unclosed = `---
name: test
# Preamble
Content
`;
      expect(isValidMdFormat(unclosed)).toBe(false);
    });
  });
});
