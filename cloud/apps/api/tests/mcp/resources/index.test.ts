/**
 * MCP Resources Tests
 *
 * Tests for authoring guidance resources.
 */

import { describe, it, expect } from 'vitest';
import {
  AUTHORING_GUIDE_URI,
  authoringGuideContent,
} from '../../../src/mcp/resources/authoring-guide.js';
import {
  AUTHORING_EXAMPLES_URI,
  authoringExamplesContent,
} from '../../../src/mcp/resources/authoring-examples.js';
import {
  VALUE_PAIRS_URI,
  valuePairsContent,
} from '../../../src/mcp/resources/value-pairs.js';
import {
  PREAMBLE_TEMPLATES_URI,
  preambleTemplatesContent,
} from '../../../src/mcp/resources/preamble-templates.js';
import { RESOURCE_URIS } from '../../../src/mcp/resources/index.js';

describe('MCP Resources', () => {
  describe('authoring guide resource', () => {
    it('has correct URI', () => {
      expect(AUTHORING_GUIDE_URI).toBe('valuerank://authoring/guide');
    });

    it('has non-empty content', () => {
      expect(authoringGuideContent.length).toBeGreaterThan(100);
    });

    it('contains key sections', () => {
      expect(authoringGuideContent).toContain('Preamble');
      expect(authoringGuideContent).toContain('Template');
      expect(authoringGuideContent).toContain('Dimension');
      expect(authoringGuideContent).toContain('Best Practices');
    });

    it('mentions validation limits', () => {
      expect(authoringGuideContent).toContain('Maximum 10 dimensions');
      expect(authoringGuideContent).toContain('Maximum 10 values');
      expect(authoringGuideContent).toContain('Maximum 1000 total scenarios');
    });
  });

  describe('authoring examples resource', () => {
    it('has correct URI', () => {
      expect(AUTHORING_EXAMPLES_URI).toBe('valuerank://authoring/examples');
    });

    it('has non-empty content', () => {
      expect(authoringExamplesContent.length).toBeGreaterThan(100);
    });

    it('contains example definitions', () => {
      expect(authoringExamplesContent).toContain('preamble');
      expect(authoringExamplesContent).toContain('template');
      expect(authoringExamplesContent).toContain('dimensions');
    });

    it('contains annotated explanations', () => {
      expect(authoringExamplesContent).toContain('Why it works');
    });

    it('contains anti-patterns', () => {
      expect(authoringExamplesContent).toContain('Anti-Pattern');
    });
  });

  describe('value pairs resource', () => {
    it('has correct URI', () => {
      expect(VALUE_PAIRS_URI).toBe('valuerank://authoring/value-pairs');
    });

    it('has non-empty content', () => {
      expect(valuePairsContent.length).toBeGreaterThan(100);
    });

    it('lists all 14 canonical values', () => {
      const values = [
        'Physical_Safety',
        'Compassion',
        'Fair_Process',
        'Equal_Outcomes',
        'Freedom',
        'Social_Duty',
        'Harmony',
        'Loyalty',
        'Economics',
        'Human_Worthiness',
        'Childrens_Rights',
        'Animal_Rights',
        'Environmental_Rights',
        'Tradition',
      ];

      for (const value of values) {
        expect(valuePairsContent).toContain(value);
      }
    });

    it('contains value tension pairs', () => {
      expect(valuePairsContent).toContain('Physical_Safety vs Economics');
      expect(valuePairsContent).toContain('Freedom vs Social_Duty');
      expect(valuePairsContent).toContain('Compassion vs Fair_Process');
    });
  });

  describe('preamble templates resource', () => {
    it('has correct URI', () => {
      expect(PREAMBLE_TEMPLATES_URI).toBe('valuerank://authoring/preamble-templates');
    });

    it('has non-empty content', () => {
      expect(preambleTemplatesContent.length).toBeGreaterThan(100);
    });

    it('contains template examples', () => {
      expect(preambleTemplatesContent).toContain('You are an AI assistant');
    });

    it('contains domain-specific templates', () => {
      expect(preambleTemplatesContent).toContain('Healthcare');
      expect(preambleTemplatesContent).toContain('Business');
      expect(preambleTemplatesContent).toContain('Technology');
    });

    it('contains anti-patterns', () => {
      expect(preambleTemplatesContent).toContain('Anti-Pattern');
      expect(preambleTemplatesContent).toContain('Bad');
      expect(preambleTemplatesContent).toContain('Why');
    });
  });

  describe('resource URIs export', () => {
    it('exports all URIs', () => {
      expect(RESOURCE_URIS.AUTHORING_GUIDE).toBe(AUTHORING_GUIDE_URI);
      expect(RESOURCE_URIS.AUTHORING_EXAMPLES).toBe(AUTHORING_EXAMPLES_URI);
      expect(RESOURCE_URIS.VALUE_PAIRS).toBe(VALUE_PAIRS_URI);
      expect(RESOURCE_URIS.PREAMBLE_TEMPLATES).toBe(PREAMBLE_TEMPLATES_URI);
    });

    it('has 4 resources', () => {
      expect(Object.keys(RESOURCE_URIS).length).toBe(4);
    });
  });

  describe('resource content quality', () => {
    it('authoring guide is properly formatted markdown', () => {
      // Check for headers
      expect(authoringGuideContent).toMatch(/^#\s+/m);
      expect(authoringGuideContent).toMatch(/##\s+/m);
    });

    it('examples include JSON code blocks', () => {
      expect(authoringExamplesContent).toContain('```json');
    });

    it('value pairs uses tables', () => {
      expect(valuePairsContent).toContain('|');
    });

    it('preamble templates includes code blocks', () => {
      expect(preambleTemplatesContent).toContain('```');
    });
  });
});
