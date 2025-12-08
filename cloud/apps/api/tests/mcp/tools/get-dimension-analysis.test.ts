/**
 * get_dimension_analysis Tool Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@valuerank/db';
import { formatDimensionAnalysis } from '../../../src/mcp/tools/get-dimension-analysis.js';

describe('get_dimension_analysis tool', () => {
  let testDefinitionId: string;
  let testRunId: string;
  let testAnalysisId: string;

  beforeAll(async () => {
    // Create test definition
    const definition = await db.definition.create({
      data: {
        name: 'test-mcp-dimension-analysis-definition',
        content: { scenario: 'test' },
      },
    });
    testDefinitionId = definition.id;

    // Create test run
    const run = await db.run.create({
      data: {
        definitionId: testDefinitionId,
        status: 'COMPLETED',
        config: { models: ['gpt-4', 'claude-3'], samplePercentage: 100 },
      },
    });
    testRunId = run.id;

    // Create analysis result with dimension data
    const analysis = await db.analysisResult.create({
      data: {
        runId: testRunId,
        analysisType: 'basic',
        inputHash: 'test-hash',
        codeVersion: '1.0.0',
        status: 'CURRENT',
        output: {
          dimensionAnalysis: {
            rankedDimensions: [
              { dimension: 'safety', importance: 0.85, divergenceScore: 0.42 },
              { dimension: 'ethics', importance: 0.72, divergenceScore: 0.35 },
              { dimension: 'capability', importance: 0.65, divergenceScore: 0.28 },
            ],
            correlations: [
              { dimension1: 'safety', dimension2: 'ethics', correlation: 0.78 },
              { dimension1: 'safety', dimension2: 'capability', correlation: -0.15 },
            ],
            mostDivisive: [
              {
                dimension: 'safety',
                variance: 0.45,
                modelRange: { min: 0.55, max: 0.92 },
              },
              {
                dimension: 'ethics',
                variance: 0.32,
                modelRange: { min: 0.48, max: 0.85 },
              },
            ],
          },
        },
      },
    });
    testAnalysisId = analysis.id;
  });

  afterAll(async () => {
    // Clean up
    if (testAnalysisId) {
      await db.analysisResult.delete({ where: { id: testAnalysisId } });
    }
    if (testRunId) {
      await db.run.delete({ where: { id: testRunId } });
    }
    if (testDefinitionId) {
      await db.definition.delete({ where: { id: testDefinitionId } });
    }
  });

  describe('formatDimensionAnalysis', () => {
    it('formats analysis with dimension data correctly', async () => {
      const analysis = await db.analysisResult.findUnique({
        where: { id: testAnalysisId },
      });

      const result = formatDimensionAnalysis(testRunId, analysis);

      expect(result.runId).toBe(testRunId);
      expect(result.analysisStatus).toBe('completed');
      expect(result.rankedDimensions.length).toBe(3);
      expect(result.correlations.length).toBe(2);
      expect(result.mostDivisive.length).toBe(2);
    });

    it('includes correct ranked dimensions', async () => {
      const analysis = await db.analysisResult.findUnique({
        where: { id: testAnalysisId },
      });

      const result = formatDimensionAnalysis(testRunId, analysis);

      expect(result.rankedDimensions[0].dimension).toBe('safety');
      expect(result.rankedDimensions[0].importance).toBe(0.85);
      expect(result.rankedDimensions[0].divergenceScore).toBe(0.42);
    });

    it('includes correlations', async () => {
      const analysis = await db.analysisResult.findUnique({
        where: { id: testAnalysisId },
      });

      const result = formatDimensionAnalysis(testRunId, analysis);

      expect(result.correlations[0].dimension1).toBe('safety');
      expect(result.correlations[0].dimension2).toBe('ethics');
      expect(result.correlations[0].correlation).toBe(0.78);
    });

    it('includes most divisive dimensions', async () => {
      const analysis = await db.analysisResult.findUnique({
        where: { id: testAnalysisId },
      });

      const result = formatDimensionAnalysis(testRunId, analysis);

      expect(result.mostDivisive[0].dimension).toBe('safety');
      expect(result.mostDivisive[0].variance).toBe(0.45);
      expect(result.mostDivisive[0].modelRange).toEqual({ min: 0.55, max: 0.92 });
    });

    it('returns pending status when no analysis', () => {
      const result = formatDimensionAnalysis(testRunId, null);

      expect(result.analysisStatus).toBe('pending');
      expect(result.rankedDimensions).toEqual([]);
      expect(result.correlations).toEqual([]);
      expect(result.mostDivisive).toEqual([]);
    });

    it('truncates large dimension lists', () => {
      const manyDimensions = Array(20)
        .fill(null)
        .map((_, i) => ({
          dimension: `dim-${i}`,
          importance: 0.5,
          divergenceScore: 0.3,
        }));

      const mockAnalysis = {
        status: 'CURRENT',
        output: {
          dimensionAnalysis: {
            rankedDimensions: manyDimensions,
            correlations: [],
            mostDivisive: [],
          },
        },
      };

      const result = formatDimensionAnalysis(testRunId, mockAnalysis);

      // Should be truncated to 10
      expect(result.rankedDimensions.length).toBe(10);
    });
  });
});
