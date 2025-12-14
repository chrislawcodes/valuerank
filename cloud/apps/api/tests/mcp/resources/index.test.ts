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
      expect(authoringGuideContent).toContain('10 dimensions maximum');
      expect(authoringGuideContent).toContain('10 levels per dimension maximum');
      expect(authoringGuideContent).toContain('1000 generated scenarios maximum');
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

    it('lists all 19 canonical values', () => {
      const values = [
        // Openness to Change
        'Self_Direction_Thought',
        'Self_Direction_Action',
        'Stimulation',
        'Hedonism',
        // Self-Enhancement
        'Achievement',
        'Power_Dominance',
        'Power_Resources',
        'Face',
        // Conservation
        'Security_Personal',
        'Security_Societal',
        'Tradition',
        'Conformity_Rules',
        'Conformity_Interpersonal',
        'Humility',
        // Self-Transcendence
        'Benevolence_Dependability',
        'Benevolence_Caring',
        'Universalism_Concern',
        'Universalism_Nature',
        'Universalism_Tolerance',
      ];

      for (const value of values) {
        expect(valuePairsContent).toContain(value);
      }
    });

    it('contains value tension pairs', () => {
      expect(valuePairsContent).toContain('Self_Direction_Action vs Conformity_Rules');
      expect(valuePairsContent).toContain('Achievement vs Benevolence_Caring');
      expect(valuePairsContent).toContain('Power_Resources vs Universalism_Nature');
    });

    it('contains higher-order category information', () => {
      expect(valuePairsContent).toContain('Openness to Change');
      expect(valuePairsContent).toContain('Self-Enhancement');
      expect(valuePairsContent).toContain('Conservation');
      expect(valuePairsContent).toContain('Self-Transcendence');
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
