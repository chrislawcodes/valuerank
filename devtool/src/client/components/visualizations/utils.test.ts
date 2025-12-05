import { describe, it, expect } from 'vitest';
import { parseCSVLine, parseCSVToAggregate } from './utils';

describe('visualization utils', () => {
  describe('parseCSVLine', () => {
    it('should parse simple comma-separated values', () => {
      const result = parseCSVLine('a,b,c');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should handle quoted values containing commas', () => {
      const result = parseCSVLine('hello,"world, with comma",test');
      expect(result).toEqual(['hello', 'world, with comma', 'test']);
    });

    it('should handle escaped quotes within quoted strings', () => {
      const result = parseCSVLine('a,"say ""hello""",c');
      expect(result).toEqual(['a', 'say "hello"', 'c']);
    });

    it('should trim whitespace from values', () => {
      const result = parseCSVLine('  a  ,  b  ,  c  ');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should handle empty values', () => {
      const result = parseCSVLine('a,,c');
      expect(result).toEqual(['a', '', 'c']);
    });

    it('should handle single value', () => {
      const result = parseCSVLine('single');
      expect(result).toEqual(['single']);
    });

    it('should handle empty string', () => {
      const result = parseCSVLine('');
      expect(result).toEqual(['']);
    });

    it('should handle quoted empty strings', () => {
      const result = parseCSVLine('a,"",c');
      expect(result).toEqual(['a', '', 'c']);
    });

    it('should handle newlines in quoted values', () => {
      const result = parseCSVLine('a,"line1\nline2",c');
      expect(result).toEqual(['a', 'line1\nline2', 'c']);
    });
  });

  describe('parseCSVToAggregate', () => {
    const sampleCSV = `Scenario,AI Model Name,Decision Code,Decision Text,Severity,Cost
scenario_001,GPT-4,3,Moderate response,High,Low
scenario_001,Claude,4,Strong response,High,Low
scenario_002,GPT-4,2,Weak response,Low,High
scenario_002,Claude,2,Weak response,Low,High
scenario_003,GPT-4,5,Very strong,Medium,Medium
scenario_003,Claude,3,Moderate response,Medium,Medium`;

    it('should extract unique models', () => {
      const result = parseCSVToAggregate(sampleCSV);
      expect(result.models).toContain('GPT-4');
      expect(result.models).toContain('Claude');
      expect(result.models).toHaveLength(2);
    });

    it('should extract unique scenarios', () => {
      const result = parseCSVToAggregate(sampleCSV);
      expect(result.scenarios).toContain('scenario_001');
      expect(result.scenarios).toContain('scenario_002');
      expect(result.scenarios).toContain('scenario_003');
      expect(result.scenarios).toHaveLength(3);
    });

    it('should identify dimension columns', () => {
      const result = parseCSVToAggregate(sampleCSV);
      expect(result.dimensionColumns).toContain('Severity');
      expect(result.dimensionColumns).toContain('Cost');
      expect(result.dimensionColumns).not.toContain('Scenario');
      expect(result.dimensionColumns).not.toContain('AI Model Name');
      expect(result.dimensionColumns).not.toContain('Decision Code');
      expect(result.dimensionColumns).not.toContain('Decision Text');
    });

    it('should count total rows correctly', () => {
      const result = parseCSVToAggregate(sampleCSV);
      expect(result.totalRows).toBe(6);
    });

    it('should compute decision distribution per model', () => {
      const result = parseCSVToAggregate(sampleCSV);

      // GPT-4 decisions: 3, 2, 5
      expect(result.modelDecisionDist['GPT-4']['2']).toBe(1);
      expect(result.modelDecisionDist['GPT-4']['3']).toBe(1);
      expect(result.modelDecisionDist['GPT-4']['5']).toBe(1);

      // Claude decisions: 4, 2, 3
      expect(result.modelDecisionDist['Claude']['2']).toBe(1);
      expect(result.modelDecisionDist['Claude']['3']).toBe(1);
      expect(result.modelDecisionDist['Claude']['4']).toBe(1);
    });

    it('should compute average decision per model', () => {
      const result = parseCSVToAggregate(sampleCSV);

      // GPT-4: (3 + 2 + 5) / 3 = 3.333...
      expect(result.modelAvgDecision['GPT-4']).toBeCloseTo(3.333, 2);

      // Claude: (4 + 2 + 3) / 3 = 3
      expect(result.modelAvgDecision['Claude']).toBeCloseTo(3, 2);
    });

    it('should compute variance (std dev) per model', () => {
      const result = parseCSVToAggregate(sampleCSV);

      // GPT-4 has more variance (2, 3, 5) than Claude (2, 3, 4)
      expect(result.modelVariance['GPT-4']).toBeGreaterThan(0);
      expect(result.modelVariance['Claude']).toBeGreaterThan(0);
    });

    it('should compute model-scenario matrix', () => {
      const result = parseCSVToAggregate(sampleCSV);

      expect(result.modelScenarioMatrix['GPT-4']['scenario_001']).toBe(3);
      expect(result.modelScenarioMatrix['Claude']['scenario_001']).toBe(4);
      expect(result.modelScenarioMatrix['GPT-4']['scenario_002']).toBe(2);
      expect(result.modelScenarioMatrix['Claude']['scenario_002']).toBe(2);
    });

    it('should store raw rows', () => {
      const result = parseCSVToAggregate(sampleCSV);

      expect(result.rawRows).toHaveLength(6);
      expect(result.rawRows[0]['AI Model Name']).toBe('GPT-4');
      expect(result.rawRows[0]['Decision Code']).toBe('3');
    });

    it('should handle empty input', () => {
      const result = parseCSVToAggregate('');

      expect(result.models).toEqual([]);
      expect(result.scenarios).toEqual([]);
      expect(result.totalRows).toBe(0);
      expect(result.rawRows).toEqual([]);
    });

    it('should handle header-only input', () => {
      const result = parseCSVToAggregate('Scenario,AI Model Name,Decision Code');

      expect(result.models).toEqual([]);
      expect(result.scenarios).toEqual([]);
      expect(result.totalRows).toBe(0);
    });

    it('should handle models with no decisions', () => {
      const csvWithMissing = `Scenario,AI Model Name,Decision Code,Decision Text
scenario_001,Model_A,,No decision`;

      const result = parseCSVToAggregate(csvWithMissing);

      // Should handle gracefully without crashing
      expect(result.models).toContain('Model_A');
      expect(result.modelAvgDecision['Model_A']).toBe(0);
    });

    it('should initialize all decision codes 1-5 in distribution', () => {
      const simpleCSV = `Scenario,AI Model Name,Decision Code,Decision Text
scenario_001,TestModel,3,Test`;

      const result = parseCSVToAggregate(simpleCSV);

      // Should have all codes initialized
      expect(result.modelDecisionDist['TestModel']['1']).toBe(0);
      expect(result.modelDecisionDist['TestModel']['2']).toBe(0);
      expect(result.modelDecisionDist['TestModel']['3']).toBe(1);
      expect(result.modelDecisionDist['TestModel']['4']).toBe(0);
      expect(result.modelDecisionDist['TestModel']['5']).toBe(0);
    });

    it('should handle multiple rows for same scenario/model', () => {
      const csvWithDuplicates = `Scenario,AI Model Name,Decision Code,Decision Text
scenario_001,Model_A,2,First
scenario_001,Model_A,4,Second`;

      const result = parseCSVToAggregate(csvWithDuplicates);

      // Average should be computed
      expect(result.modelScenarioMatrix['Model_A']['scenario_001']).toBe(3);
    });

    it('should handle quoted values in CSV', () => {
      const csvWithQuotes = `Scenario,AI Model Name,Decision Code,Decision Text
"scenario, with comma",Model_A,3,"Response with ""quotes""."`;

      const result = parseCSVToAggregate(csvWithQuotes);

      expect(result.scenarios).toContain('scenario, with comma');
      expect(result.rawRows[0]['Decision Text']).toContain('quotes');
    });
  });
});
