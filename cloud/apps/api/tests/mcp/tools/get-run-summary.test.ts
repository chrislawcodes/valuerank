/**
 * get_run_summary Tool Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@valuerank/db';
import { formatRunSummary } from '../../../src/services/mcp/formatters.js';

describe('get_run_summary tool', () => {
  let testDefinitionId: string;
  let testRunId: string;
  let testAnalysisId: string;

  beforeAll(async () => {
    // Create test definition
    const definition = await db.definition.create({
      data: {
        name: 'test-mcp-run-summary-definition',
        content: { scenario: 'test' },
      },
    });
    testDefinitionId = definition.id;

    // Create test run
    const run = await db.run.create({
      data: {
        definitionId: testDefinitionId,
        status: 'COMPLETED',
        config: { models: ['openai:gpt-4', 'anthropic:claude-3'], samplePercentage: 100 },
      },
    });
    testRunId = run.id;

    // Create analysis result
    const analysis = await db.analysisResult.create({
      data: {
        runId: testRunId,
        analysisType: 'basic',
        inputHash: 'test-hash',
        codeVersion: '1.0.0',
        status: 'CURRENT',
        output: {
          perModel: {
            'openai:gpt-4': { sampleSize: 50, meanScore: 0.72, stdDev: 0.15 },
            'anthropic:claude-3': { sampleSize: 50, meanScore: 0.68, stdDev: 0.12 },
          },
          modelAgreement: {
            averageCorrelation: 0.85,
            outlierModels: [],
          },
          mostContestedScenarios: [
            { scenarioId: 'scenario-1', variance: 0.45 },
            { scenarioId: 'scenario-2', variance: 0.38 },
          ],
          insights: ['GPT-4 prioritizes safety 15% more', 'Models agree on 85% of scenarios'],
          llmSummary: 'The run shows high model agreement with some variance in safety scenarios.',
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

  describe('formatRunSummary', () => {
    it('formats run with analysis correctly', async () => {
      const run = await db.run.findUnique({
        where: { id: testRunId },
      });
      const analysis = await db.analysisResult.findUnique({
        where: { id: testAnalysisId },
      });

      const summary = formatRunSummary(run!, analysis, 100);

      expect(summary.runId).toBe(testRunId);
      expect(summary.status).toBe('completed');
      expect(summary.basicStats.modelCount).toBe(2);
      expect(summary.basicStats.transcriptCount).toBe(100);
      expect(summary.analysisStatus).toBe('completed');
    });

    it('includes per-model stats', async () => {
      const run = await db.run.findUnique({ where: { id: testRunId } });
      const analysis = await db.analysisResult.findUnique({ where: { id: testAnalysisId } });

      const summary = formatRunSummary(run!, analysis, 100);

      expect(summary.basicStats.perModel['openai:gpt-4']).toBeDefined();
      expect(summary.basicStats.perModel['openai:gpt-4'].sampleSize).toBe(50);
      expect(summary.basicStats.perModel['openai:gpt-4'].meanScore).toBe(0.72);
    });

    it('includes model agreement', async () => {
      const run = await db.run.findUnique({ where: { id: testRunId } });
      const analysis = await db.analysisResult.findUnique({ where: { id: testAnalysisId } });

      const summary = formatRunSummary(run!, analysis, 100);

      expect(summary.modelAgreement.averageCorrelation).toBe(0.85);
      expect(summary.modelAgreement.outlierModels).toEqual([]);
    });

    it('includes most contested scenarios', async () => {
      const run = await db.run.findUnique({ where: { id: testRunId } });
      const analysis = await db.analysisResult.findUnique({ where: { id: testAnalysisId } });

      const summary = formatRunSummary(run!, analysis, 100);

      expect(summary.mostContestedScenarios.length).toBe(2);
      expect(summary.mostContestedScenarios[0].scenarioId).toBe('scenario-1');
    });

    it('includes insights and llmSummary', async () => {
      const run = await db.run.findUnique({ where: { id: testRunId } });
      const analysis = await db.analysisResult.findUnique({ where: { id: testAnalysisId } });

      const summary = formatRunSummary(run!, analysis, 100);

      expect(summary.insights).toBeDefined();
      expect(summary.insights?.length).toBe(2);
      expect(summary.llmSummary).toBeDefined();
    });

    it('returns pending status when no analysis', async () => {
      const run = await db.run.findUnique({ where: { id: testRunId } });

      const summary = formatRunSummary(run!, null, 0);

      expect(summary.analysisStatus).toBe('pending');
      expect(summary.basicStats.perModel).toEqual({});
    });
  });
});
