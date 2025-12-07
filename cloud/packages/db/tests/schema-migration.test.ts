/**
 * Tests for JSONB schema migration utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  loadDefinitionContent,
  parseStoredContent,
  mergeContent,
  getContentOverrides,
  createInheritingContent,
  createPartialContent,
  loadRunConfig,
  loadScenarioContent,
  loadTranscriptContent,
  loadAnalysisOutput,
  loadRubricContent,
  loadCohortCriteria,
} from '../src/schema-migration.js';
import type {
  DefinitionContent,
  DefinitionContentV1,
  DefinitionContentV2,
  RunConfig,
} from '../src/types.js';

describe('Schema Migration', () => {
  describe('loadDefinitionContent', () => {
    it('migrates v0 content (no schema_version) to v1', () => {
      const v0Content = {
        preamble: 'Test preamble',
        template: 'Test template',
        dimensions: [{ name: 'test', values: ['a', 'b'] }],
      };

      const result = loadDefinitionContent(v0Content);

      expect(result.schema_version).toBe(1);
      expect(result.preamble).toBe('Test preamble');
      expect(result.template).toBe('Test template');
      expect(result.dimensions).toHaveLength(1);
    });

    it('passes through v1 content unchanged', () => {
      const v1Content: DefinitionContent = {
        schema_version: 1,
        preamble: 'V1 preamble',
        template: 'V1 template',
        dimensions: [],
        matching_rules: 'some rules',
      };

      const result = loadDefinitionContent(v1Content);

      expect(result).toEqual(v1Content);
    });

    it('handles missing fields in v0 content', () => {
      const incompleteV0 = {};

      const result = loadDefinitionContent(incompleteV0);

      expect(result.schema_version).toBe(1);
      expect(result.preamble).toBe('');
      expect(result.template).toBe('');
      expect(result.dimensions).toEqual([]);
    });

    it('throws on unknown schema version', () => {
      const unknownVersion = { schema_version: 99 };

      expect(() => loadDefinitionContent(unknownVersion)).toThrow(
        'Unknown definition content schema version: 99'
      );
    });

    it('throws on non-object input', () => {
      expect(() => loadDefinitionContent(null)).toThrow(
        'Definition content must be an object'
      );
      expect(() => loadDefinitionContent('string')).toThrow(
        'Definition content must be an object'
      );
    });

    it('handles v2 content with all fields present', () => {
      const v2Content: DefinitionContentV2 = {
        schema_version: 2,
        preamble: 'V2 preamble',
        template: 'V2 template',
        dimensions: [{ name: 'test', levels: [] }],
      };

      const result = loadDefinitionContent(v2Content);

      expect(result.schema_version).toBe(2);
      expect(result.preamble).toBe('V2 preamble');
      expect(result.template).toBe('V2 template');
    });

    it('handles v2 content with missing fields (returns defaults)', () => {
      const sparseV2: DefinitionContentV2 = {
        schema_version: 2,
        // No other fields - would inherit from parent in real use
      };

      const result = loadDefinitionContent(sparseV2);

      expect(result.schema_version).toBe(2);
      expect(result.preamble).toBe('');
      expect(result.template).toBe('');
      expect(result.dimensions).toEqual([]);
    });
  });

  describe('parseStoredContent', () => {
    it('parses v1 content', () => {
      const v1Content: DefinitionContentV1 = {
        schema_version: 1,
        preamble: 'Test',
        template: 'Template',
        dimensions: [],
      };

      const result = parseStoredContent(v1Content);

      expect(result.schema_version).toBe(1);
      expect(result.preamble).toBe('Test');
    });

    it('parses v2 content with sparse fields', () => {
      const v2Content: DefinitionContentV2 = {
        schema_version: 2,
        preamble: 'Only preamble',
        // template and dimensions are undefined (inherited)
      };

      const result = parseStoredContent(v2Content);

      expect(result.schema_version).toBe(2);
      expect(result.preamble).toBe('Only preamble');
      expect((result as DefinitionContentV2).template).toBeUndefined();
      expect((result as DefinitionContentV2).dimensions).toBeUndefined();
    });
  });

  describe('mergeContent', () => {
    it('returns v1 child content unchanged (v1 is always complete)', () => {
      const child: DefinitionContentV1 = {
        schema_version: 1,
        preamble: 'Child preamble',
        template: 'Child template',
        dimensions: [],
      };
      const parent: DefinitionContent = {
        schema_version: 1,
        preamble: 'Parent preamble',
        template: 'Parent template',
        dimensions: [{ name: 'parent-dim', levels: [] }],
      };

      const result = mergeContent(child, parent);

      expect(result.preamble).toBe('Child preamble');
      expect(result.template).toBe('Child template');
      expect(result.dimensions).toEqual([]);
    });

    it('merges v2 child with parent, child overrides parent', () => {
      const child: DefinitionContentV2 = {
        schema_version: 2,
        preamble: 'Child preamble',
        // template and dimensions inherit from parent
      };
      const parent: DefinitionContent = {
        schema_version: 1,
        preamble: 'Parent preamble',
        template: 'Parent template',
        dimensions: [{ name: 'parent-dim', levels: [] }],
      };

      const result = mergeContent(child, parent);

      expect(result.preamble).toBe('Child preamble'); // overridden
      expect(result.template).toBe('Parent template'); // inherited
      expect(result.dimensions).toEqual([{ name: 'parent-dim', levels: [] }]); // inherited
    });

    it('handles fully sparse v2 (inherits everything)', () => {
      const child: DefinitionContentV2 = {
        schema_version: 2,
        // All fields undefined - inherit everything
      };
      const parent: DefinitionContent = {
        schema_version: 1,
        preamble: 'Parent preamble',
        template: 'Parent template',
        dimensions: [{ name: 'dim1', levels: [] }],
        matching_rules: 'some rules',
      };

      const result = mergeContent(child, parent);

      expect(result.preamble).toBe('Parent preamble');
      expect(result.template).toBe('Parent template');
      expect(result.dimensions).toEqual([{ name: 'dim1', levels: [] }]);
      expect(result.matching_rules).toBe('some rules');
    });
  });

  describe('getContentOverrides', () => {
    it('returns all true for v1 content (all fields present)', () => {
      const v1Content: DefinitionContentV1 = {
        schema_version: 1,
        preamble: 'Test',
        template: 'Template',
        dimensions: [],
      };

      const overrides = getContentOverrides(v1Content);

      expect(overrides.preamble).toBe(true);
      expect(overrides.template).toBe(true);
      expect(overrides.dimensions).toBe(true);
      expect(overrides.matching_rules).toBe(false); // not present
    });

    it('returns correct overrides for v2 content with partial fields', () => {
      const v2Content: DefinitionContentV2 = {
        schema_version: 2,
        preamble: 'Local preamble',
        // template and dimensions are undefined (inherited)
      };

      const overrides = getContentOverrides(v2Content);

      expect(overrides.preamble).toBe(true); // present
      expect(overrides.template).toBe(false); // undefined = inherited
      expect(overrides.dimensions).toBe(false); // undefined = inherited
      expect(overrides.matching_rules).toBe(false);
    });

    it('returns all false for fully sparse v2', () => {
      const sparseV2: DefinitionContentV2 = {
        schema_version: 2,
      };

      const overrides = getContentOverrides(sparseV2);

      expect(overrides.preamble).toBe(false);
      expect(overrides.template).toBe(false);
      expect(overrides.dimensions).toBe(false);
      expect(overrides.matching_rules).toBe(false);
    });
  });

  describe('createInheritingContent', () => {
    it('creates v2 content with no fields (all inherited)', () => {
      const content = createInheritingContent();

      expect(content.schema_version).toBe(2);
      expect(content.preamble).toBeUndefined();
      expect(content.template).toBeUndefined();
      expect(content.dimensions).toBeUndefined();
    });
  });

  describe('createPartialContent', () => {
    it('creates v2 content with only specified fields', () => {
      const content = createPartialContent({
        preamble: 'Only preamble',
      });

      expect(content.schema_version).toBe(2);
      expect(content.preamble).toBe('Only preamble');
      expect(content.template).toBeUndefined();
      expect(content.dimensions).toBeUndefined();
    });

    it('creates v2 content with multiple fields', () => {
      const dims = [{ name: 'test', levels: [] }];
      const content = createPartialContent({
        template: 'Custom template',
        dimensions: dims,
      });

      expect(content.schema_version).toBe(2);
      expect(content.preamble).toBeUndefined();
      expect(content.template).toBe('Custom template');
      expect(content.dimensions).toEqual(dims);
    });
  });

  describe('loadRunConfig', () => {
    it('migrates v0 config (no schema_version) to v1', () => {
      const v0Config = {
        models: ['gpt-4', 'claude-3'],
        temperature: 0.7,
      };

      const result = loadRunConfig(v0Config);

      expect(result.schema_version).toBe(1);
      expect(result.models).toEqual(['gpt-4', 'claude-3']);
      expect(result.temperature).toBe(0.7);
    });

    it('passes through v1 config unchanged', () => {
      const v1Config: RunConfig = {
        schema_version: 1,
        models: ['claude-3'],
        sample_percentage: 50,
      };

      const result = loadRunConfig(v1Config);

      expect(result).toEqual(v1Config);
    });

    it('handles missing models array', () => {
      const noModels = {};

      const result = loadRunConfig(noModels);

      expect(result.schema_version).toBe(1);
      expect(result.models).toEqual([]);
    });

    it('throws on unknown schema version', () => {
      const unknownVersion = { schema_version: 99 };

      expect(() => loadRunConfig(unknownVersion)).toThrow(
        'Unknown run config schema version: 99'
      );
    });
  });

  describe('loadScenarioContent', () => {
    it('migrates v0 content to v1', () => {
      const v0Content = {
        prompt: 'Test prompt',
        dimension_values: { severity: 'high' },
      };

      const result = loadScenarioContent(v0Content);

      expect(result.schema_version).toBe(1);
      expect(result.prompt).toBe('Test prompt');
      expect(result.dimension_values).toEqual({ severity: 'high' });
    });

    it('handles missing prompt', () => {
      const noPrompt = {};

      const result = loadScenarioContent(noPrompt);

      expect(result.prompt).toBe('');
    });

    it('throws on unknown schema version', () => {
      expect(() => loadScenarioContent({ schema_version: 99 })).toThrow(
        'Unknown scenario content schema version: 99'
      );
    });
  });

  describe('loadTranscriptContent', () => {
    it('migrates v0 content to v1', () => {
      const v0Content = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ],
        model_response: 'Final response',
      };

      const result = loadTranscriptContent(v0Content);

      expect(result.schema_version).toBe(1);
      expect(result.messages).toHaveLength(2);
      expect(result.model_response).toBe('Final response');
    });

    it('handles missing messages', () => {
      const noMessages = {};

      const result = loadTranscriptContent(noMessages);

      expect(result.messages).toEqual([]);
    });

    it('throws on unknown schema version', () => {
      expect(() => loadTranscriptContent({ schema_version: 99 })).toThrow(
        'Unknown transcript content schema version: 99'
      );
    });
  });

  describe('loadAnalysisOutput', () => {
    it('migrates v0 output to v1', () => {
      const v0Output = {
        results: { value1: 0.5 },
        summary: 'Test summary',
      };

      const result = loadAnalysisOutput(v0Output);

      expect(result.schema_version).toBe(1);
      expect(result.results).toEqual({ value1: 0.5 });
      expect(result.summary).toBe('Test summary');
    });

    it('wraps raw results object as v0', () => {
      const rawResults = { value1: 0.5, value2: 0.7 };

      const result = loadAnalysisOutput(rawResults);

      expect(result.schema_version).toBe(1);
      expect(result.results).toEqual({ value1: 0.5, value2: 0.7 });
    });

    it('throws on unknown schema version', () => {
      expect(() => loadAnalysisOutput({ schema_version: 99 })).toThrow(
        'Unknown analysis output schema version: 99'
      );
    });
  });

  describe('loadRubricContent', () => {
    it('migrates v0 content to v1', () => {
      const v0Content = {
        values: [{ name: 'Safety', definition: 'Physical safety' }],
      };

      const result = loadRubricContent(v0Content);

      expect(result.schema_version).toBe(1);
      expect(result.values).toHaveLength(1);
    });

    it('handles missing values array', () => {
      const noValues = {};

      const result = loadRubricContent(noValues);

      expect(result.values).toEqual([]);
    });

    it('throws on unknown schema version', () => {
      expect(() => loadRubricContent({ schema_version: 99 })).toThrow(
        'Unknown rubric content schema version: 99'
      );
    });
  });

  describe('loadCohortCriteria', () => {
    it('migrates v0 criteria to v1', () => {
      const v0Criteria = {
        filters: [{ field: 'model', operator: 'eq', value: 'gpt-4' }],
      };

      const result = loadCohortCriteria(v0Criteria);

      expect(result.schema_version).toBe(1);
      expect(result.filters).toHaveLength(1);
    });

    it('handles missing filters array', () => {
      const noFilters = {};

      const result = loadCohortCriteria(noFilters);

      expect(result.filters).toEqual([]);
    });

    it('throws on unknown schema version', () => {
      expect(() => loadCohortCriteria({ schema_version: 99 })).toThrow(
        'Unknown cohort criteria schema version: 99'
      );
    });
  });
});
