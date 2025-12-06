/**
 * Integration tests for analysis and experiment query helpers.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  createExperiment,
  getExperimentById,
  getExperimentWithRuns,
  listExperiments,
  updateExperiment,
  createRunComparison,
  getRunComparisonById,
  getComparisonsForExperiment,
  updateRunComparisonDelta,
  createAnalysisResult,
  getLatestAnalysis,
  getAnalysisResultsForRun,
  getAnalysisHistory,
  findMatchingAnalysis,
} from '../src/queries/analysis.js';
import { createDefinition } from '../src/queries/definitions.js';
import { createRun } from '../src/queries/runs.js';
import type { DefinitionContent, RunConfig, AnalysisOutput, AnalysisPlan, DeltaData } from '../src/types.js';

import type { Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Skip tests if no database URL
const skipIfNoDb = process.env.DATABASE_URL ? describe : describe.skip;

skipIfNoDb('Analysis Queries (Integration)', () => {
  let testDefinition: { id: string };
  let testRun: { id: string };

  beforeEach(async () => {
    // Clean up test data in order
    await prisma.analysisResult.deleteMany();
    await prisma.runComparison.deleteMany();
    await prisma.transcript.deleteMany();
    await prisma.run.deleteMany();
    await prisma.experiment.deleteMany();
    await prisma.definition.deleteMany();

    // Create test definition and run
    const content: DefinitionContent = {
      schema_version: 1,
      preamble: 'Test',
      template: 'Test',
      dimensions: [],
    };

    testDefinition = await createDefinition({ name: 'Test Def', content });

    const runConfig: RunConfig = {
      schema_version: 1,
      models: ['gpt-4'],
    };

    testRun = await createRun({
      definitionId: testDefinition.id,
      config: runConfig,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('createExperiment', () => {
    it('creates an experiment with valid data', async () => {
      const analysisPlan: AnalysisPlan = {
        schema_version: 1,
        test: 'chi-squared',
        alpha: 0.05,
      };

      const result = await createExperiment({
        name: 'Test Experiment',
        hypothesis: 'Model A is better than Model B',
        analysisPlan,
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test Experiment');
      expect(result.hypothesis).toBe('Model A is better than Model B');
    });

    it('throws on empty name', async () => {
      await expect(
        createExperiment({ name: '' })
      ).rejects.toThrow('Experiment name is required');
    });
  });

  describe('getExperimentById', () => {
    it('returns experiment when exists', async () => {
      const created = await createExperiment({ name: 'Fetch Test' });
      const result = await getExperimentById(created.id);

      expect(result.id).toBe(created.id);
      expect(result.name).toBe('Fetch Test');
    });

    it('throws NotFoundError when not exists', async () => {
      await expect(getExperimentById('non-existent')).rejects.toThrow(
        'Experiment not found'
      );
    });
  });

  describe('listExperiments', () => {
    it('returns all experiments', async () => {
      await createExperiment({ name: 'Exp 1' });
      await createExperiment({ name: 'Exp 2' });

      const result = await listExperiments();

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by name', async () => {
      await createExperiment({ name: 'Unique Experiment Name' });

      const result = await listExperiments({ name: 'unique' });

      expect(result.some((e) => e.name === 'Unique Experiment Name')).toBe(true);
    });

    it('supports pagination', async () => {
      await createExperiment({ name: 'Page Exp 1' });
      await createExperiment({ name: 'Page Exp 2' });
      await createExperiment({ name: 'Page Exp 3' });

      const page1 = await listExperiments({ limit: 2, offset: 0 });
      expect(page1.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getExperimentWithRuns', () => {
    it('returns experiment with runs and comparisons', async () => {
      const experiment = await createExperiment({ name: 'With Runs' });

      // Create a run linked to experiment
      const config: RunConfig = { schema_version: 1, models: ['gpt-4'] };
      await prisma.run.create({
        data: {
          definitionId: testDefinition.id,
          experimentId: experiment.id,
          config: config as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });

      const result = await getExperimentWithRuns(experiment.id);

      expect(result.id).toBe(experiment.id);
      expect(result.runs).toHaveLength(1);
    });

    it('throws NotFoundError when not exists', async () => {
      await expect(getExperimentWithRuns('non-existent')).rejects.toThrow(
        'Experiment not found'
      );
    });
  });

  describe('updateExperiment', () => {
    it('updates experiment name', async () => {
      const experiment = await createExperiment({ name: 'Original Name' });

      const result = await updateExperiment(experiment.id, { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('updates experiment hypothesis', async () => {
      const experiment = await createExperiment({ name: 'Test' });

      const result = await updateExperiment(experiment.id, { hypothesis: 'New hypothesis' });

      expect(result.hypothesis).toBe('New hypothesis');
    });

    it('updates analysis plan', async () => {
      const experiment = await createExperiment({ name: 'Test' });
      const plan: AnalysisPlan = { schema_version: 1, test: 't-test', alpha: 0.01 };

      const result = await updateExperiment(experiment.id, { analysisPlan: plan });

      expect(result.analysisPlan).toEqual(plan);
    });

    it('throws NotFoundError for non-existent experiment', async () => {
      await expect(updateExperiment('non-existent', { name: 'Test' })).rejects.toThrow(
        'Experiment not found'
      );
    });
  });

  describe('createRunComparison', () => {
    it('creates a comparison between two runs', async () => {
      const config: RunConfig = { schema_version: 1, models: ['claude-3'] };
      const run2 = await createRun({
        definitionId: testDefinition.id,
        config,
      });

      const result = await createRunComparison({
        baselineRunId: testRun.id,
        comparisonRunId: run2.id,
      });

      expect(result.id).toBeDefined();
      expect(result.baselineRunId).toBe(testRun.id);
      expect(result.comparisonRunId).toBe(run2.id);
    });

    it('throws when comparing run to itself', async () => {
      await expect(
        createRunComparison({
          baselineRunId: testRun.id,
          comparisonRunId: testRun.id,
        })
      ).rejects.toThrow('Cannot compare a run to itself');
    });

    it('can link to an experiment', async () => {
      const experiment = await createExperiment({ name: 'Linked Exp' });
      const config: RunConfig = { schema_version: 1, models: ['claude-3'] };
      const run2 = await createRun({
        definitionId: testDefinition.id,
        config,
      });

      const result = await createRunComparison({
        experimentId: experiment.id,
        baselineRunId: testRun.id,
        comparisonRunId: run2.id,
      });

      expect(result.experimentId).toBe(experiment.id);
    });

    it('throws on missing baseline run ID', async () => {
      await expect(
        createRunComparison({
          baselineRunId: '',
          comparisonRunId: testRun.id,
        })
      ).rejects.toThrow('Baseline run ID is required');
    });

    it('throws on missing comparison run ID', async () => {
      await expect(
        createRunComparison({
          baselineRunId: testRun.id,
          comparisonRunId: '',
        })
      ).rejects.toThrow('Comparison run ID is required');
    });

    it('creates comparison with delta data', async () => {
      const config: RunConfig = { schema_version: 1, models: ['claude-3'] };
      const run2 = await createRun({
        definitionId: testDefinition.id,
        config,
      });

      const deltaData: DeltaData = {
        schema_version: 1,
        value_differences: {
          safety: { baseline: 0.8, comparison: 0.9, delta: 0.1 },
        },
      };

      const result = await createRunComparison({
        baselineRunId: testRun.id,
        comparisonRunId: run2.id,
        deltaData,
      });

      expect(result.deltaData).toEqual(deltaData);
    });
  });

  describe('getRunComparisonById', () => {
    it('returns comparison when exists', async () => {
      const config: RunConfig = { schema_version: 1, models: ['claude-3'] };
      const run2 = await createRun({
        definitionId: testDefinition.id,
        config,
      });

      const created = await createRunComparison({
        baselineRunId: testRun.id,
        comparisonRunId: run2.id,
      });

      const result = await getRunComparisonById(created.id);

      expect(result.id).toBe(created.id);
    });

    it('throws NotFoundError when not exists', async () => {
      await expect(getRunComparisonById('non-existent')).rejects.toThrow(
        'RunComparison not found'
      );
    });
  });

  describe('getComparisonsForExperiment', () => {
    it('returns all comparisons for an experiment', async () => {
      const experiment = await createExperiment({ name: 'Comparison Test' });
      const config: RunConfig = { schema_version: 1, models: ['claude-3'] };
      const run2 = await createRun({
        definitionId: testDefinition.id,
        config,
      });
      const run3 = await createRun({
        definitionId: testDefinition.id,
        config,
      });

      await createRunComparison({
        experimentId: experiment.id,
        baselineRunId: testRun.id,
        comparisonRunId: run2.id,
      });
      await createRunComparison({
        experimentId: experiment.id,
        baselineRunId: testRun.id,
        comparisonRunId: run3.id,
      });

      const result = await getComparisonsForExperiment(experiment.id);

      expect(result.length).toBe(2);
    });
  });

  describe('updateRunComparisonDelta', () => {
    it('updates delta data', async () => {
      const config: RunConfig = { schema_version: 1, models: ['claude-3'] };
      const run2 = await createRun({
        definitionId: testDefinition.id,
        config,
      });

      const comparison = await createRunComparison({
        baselineRunId: testRun.id,
        comparisonRunId: run2.id,
      });

      const deltaData: DeltaData = {
        schema_version: 1,
        value_differences: {
          safety: { baseline: 0.7, comparison: 0.85, delta: 0.15 },
        },
      };

      const result = await updateRunComparisonDelta(comparison.id, deltaData);

      expect(result.deltaData).toEqual(deltaData);
    });

    it('throws NotFoundError for non-existent comparison', async () => {
      const deltaData: DeltaData = {
        schema_version: 1,
        value_differences: {},
      };

      await expect(updateRunComparisonDelta('non-existent', deltaData)).rejects.toThrow(
        'RunComparison not found'
      );
    });
  });

  describe('Analysis Result Versioning', () => {
    it('creates a new analysis result', async () => {
      const output: AnalysisOutput = {
        schema_version: 1,
        results: { value1: 0.5 },
        summary: 'Test',
      };

      const result = await createAnalysisResult({
        runId: testRun.id,
        analysisType: 'value_comparison',
        inputHash: 'abc123',
        codeVersion: '1.0.0',
        output,
      });

      expect(result.id).toBeDefined();
      expect(result.status).toBe('CURRENT');
    });

    it('throws on missing run ID', async () => {
      const output: AnalysisOutput = { schema_version: 1, results: {} };

      await expect(
        createAnalysisResult({
          runId: '',
          analysisType: 'test',
          inputHash: 'hash',
          codeVersion: '1.0.0',
          output,
        })
      ).rejects.toThrow('Run ID is required');
    });

    it('throws on missing analysis type', async () => {
      const output: AnalysisOutput = { schema_version: 1, results: {} };

      await expect(
        createAnalysisResult({
          runId: testRun.id,
          analysisType: '',
          inputHash: 'hash',
          codeVersion: '1.0.0',
          output,
        })
      ).rejects.toThrow('Analysis type is required');
    });

    it('throws on missing input hash', async () => {
      const output: AnalysisOutput = { schema_version: 1, results: {} };

      await expect(
        createAnalysisResult({
          runId: testRun.id,
          analysisType: 'test',
          inputHash: '',
          codeVersion: '1.0.0',
          output,
        })
      ).rejects.toThrow('Input hash is required');
    });

    it('supersedes old analysis when new one is created', async () => {
      const output1: AnalysisOutput = {
        schema_version: 1,
        results: { value1: 0.5 },
      };

      const output2: AnalysisOutput = {
        schema_version: 1,
        results: { value1: 0.6 },
      };

      const first = await createAnalysisResult({
        runId: testRun.id,
        analysisType: 'value_comparison',
        inputHash: 'hash1',
        codeVersion: '1.0.0',
        output: output1,
      });

      const second = await createAnalysisResult({
        runId: testRun.id,
        analysisType: 'value_comparison',
        inputHash: 'hash2',
        codeVersion: '1.0.1',
        output: output2,
      });

      // Verify first is now superseded
      const firstUpdated = await prisma.analysisResult.findUnique({
        where: { id: first.id },
      });
      expect(firstUpdated?.status).toBe('SUPERSEDED');

      // Verify second is current
      expect(second.status).toBe('CURRENT');
    });

    it('getLatestAnalysis returns current result', async () => {
      const output: AnalysisOutput = {
        schema_version: 1,
        results: { latest: true },
      };

      await createAnalysisResult({
        runId: testRun.id,
        analysisType: 'test_type',
        inputHash: 'hash',
        codeVersion: '1.0.0',
        output,
      });

      const result = await getLatestAnalysis(testRun.id, 'test_type');

      expect(result).not.toBeNull();
      expect(result?.parsedOutput.results).toEqual({ latest: true });
    });

    it('getLatestAnalysis returns null when no current result', async () => {
      const result = await getLatestAnalysis(testRun.id, 'non_existent_type');

      expect(result).toBeNull();
    });

    it('getAnalysisResultsForRun returns all results for a run', async () => {
      const output: AnalysisOutput = { schema_version: 1, results: {} };

      await createAnalysisResult({
        runId: testRun.id,
        analysisType: 'type1',
        inputHash: 'hash1',
        codeVersion: '1.0.0',
        output,
      });

      await createAnalysisResult({
        runId: testRun.id,
        analysisType: 'type2',
        inputHash: 'hash2',
        codeVersion: '1.0.0',
        output,
      });

      const results = await getAnalysisResultsForRun(testRun.id);

      expect(results.length).toBe(2);
    });

    it('getAnalysisHistory returns all versions', async () => {
      const output: AnalysisOutput = {
        schema_version: 1,
        results: {},
      };

      await createAnalysisResult({
        runId: testRun.id,
        analysisType: 'history_type',
        inputHash: 'hash1',
        codeVersion: '1.0.0',
        output,
      });

      await createAnalysisResult({
        runId: testRun.id,
        analysisType: 'history_type',
        inputHash: 'hash2',
        codeVersion: '1.0.1',
        output,
      });

      const history = await getAnalysisHistory(testRun.id, 'history_type');

      expect(history.length).toBe(2);
      expect(history.filter((h) => h.status === 'CURRENT').length).toBe(1);
      expect(history.filter((h) => h.status === 'SUPERSEDED').length).toBe(1);
    });

    it('findMatchingAnalysis returns existing result with same hash', async () => {
      const output: AnalysisOutput = {
        schema_version: 1,
        results: { cached: true },
      };

      await createAnalysisResult({
        runId: testRun.id,
        analysisType: 'cached_type',
        inputHash: 'matching_hash',
        codeVersion: '1.0.0',
        output,
      });

      const match = await findMatchingAnalysis(
        testRun.id,
        'cached_type',
        'matching_hash',
        '1.0.0'
      );

      expect(match).not.toBeNull();
      expect(match?.parsedOutput.results).toEqual({ cached: true });
    });

    it('findMatchingAnalysis returns null when hash differs', async () => {
      const output: AnalysisOutput = {
        schema_version: 1,
        results: {},
      };

      await createAnalysisResult({
        runId: testRun.id,
        analysisType: 'cached_type',
        inputHash: 'original_hash',
        codeVersion: '1.0.0',
        output,
      });

      const match = await findMatchingAnalysis(
        testRun.id,
        'cached_type',
        'different_hash',
        '1.0.0'
      );

      expect(match).toBeNull();
    });
  });
});
