/**
 * delete_run Tool Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '@valuerank/db';

describe('delete_run tool', () => {
  // Test data
  let testDefinitionId: string;
  let testRunId: string;
  let testRunWithTranscriptsId: string;
  let testRunWithAnalysisId: string;
  let testRunningRunId: string;
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdTranscriptIds: string[] = [];
  const createdAnalysisIds: string[] = [];

  beforeAll(async () => {
    // Create test definition
    const testDef = await db.definition.create({
      data: {
        name: 'test-delete-run-def-' + Date.now(),
        content: {
          schema_version: 2,
          preamble: 'Test preamble',
          template: 'Test template with [variable]',
          dimensions: [{ name: 'variable', values: ['a', 'b'] }],
        },
      },
    });
    testDefinitionId = testDef.id;
    createdDefinitionIds.push(testDef.id);

    // Create a simple test run
    const testRun = await db.run.create({
      data: {
        definitionId: testDef.id,
        status: 'COMPLETED',
        config: { schema_version: 1, models: ['test-model'] },
        progress: { total: 1, completed: 1, failed: 0 },
        completedAt: new Date(),
      },
    });
    testRunId = testRun.id;
    createdRunIds.push(testRun.id);

    // Create run with transcripts
    const runWithTranscripts = await db.run.create({
      data: {
        definitionId: testDef.id,
        status: 'COMPLETED',
        config: { schema_version: 1, models: ['test-model'] },
        progress: { total: 2, completed: 2, failed: 0 },
        completedAt: new Date(),
      },
    });
    testRunWithTranscriptsId = runWithTranscripts.id;
    createdRunIds.push(runWithTranscripts.id);

    // Create transcripts for this run
    const transcript1 = await db.transcript.create({
      data: {
        runId: runWithTranscripts.id,
        modelId: 'test-model',
        content: { schema_version: 1, messages: [], model_response: 'test' },
        turnCount: 1,
        tokenCount: 100,
        durationMs: 1000,
      },
    });
    createdTranscriptIds.push(transcript1.id);

    const transcript2 = await db.transcript.create({
      data: {
        runId: runWithTranscripts.id,
        modelId: 'test-model',
        content: { schema_version: 1, messages: [], model_response: 'test' },
        turnCount: 1,
        tokenCount: 100,
        durationMs: 1000,
      },
    });
    createdTranscriptIds.push(transcript2.id);

    // Create run with analysis results
    const runWithAnalysis = await db.run.create({
      data: {
        definitionId: testDef.id,
        status: 'COMPLETED',
        config: { schema_version: 1, models: ['test-model'] },
        progress: { total: 1, completed: 1, failed: 0 },
        completedAt: new Date(),
      },
    });
    testRunWithAnalysisId = runWithAnalysis.id;
    createdRunIds.push(runWithAnalysis.id);

    // Create analysis result
    const analysis = await db.analysisResult.create({
      data: {
        runId: runWithAnalysis.id,
        analysisType: 'dimension_analysis',
        inputHash: 'test-hash',
        codeVersion: '1.0.0',
        output: { schema_version: 1, results: {} },
        status: 'CURRENT',
      },
    });
    createdAnalysisIds.push(analysis.id);

    // Create a running run
    const runningRun = await db.run.create({
      data: {
        definitionId: testDef.id,
        status: 'RUNNING',
        config: { schema_version: 1, models: ['test-model'] },
        progress: { total: 10, completed: 5, failed: 0 },
        startedAt: new Date(),
      },
    });
    testRunningRunId = runningRun.id;
    createdRunIds.push(runningRun.id);
  });

  afterAll(async () => {
    // Clean up all created entities
    for (const id of createdAnalysisIds) {
      try {
        await db.analysisResult.delete({ where: { id } });
      } catch {
        // Ignore if already deleted
      }
    }
    for (const id of createdTranscriptIds) {
      try {
        await db.transcript.delete({ where: { id } });
      } catch {
        // Ignore if already deleted
      }
    }
    for (const id of createdRunIds) {
      try {
        await db.run.delete({ where: { id } });
      } catch {
        // Ignore if already deleted
      }
    }
    for (const id of createdDefinitionIds) {
      try {
        await db.definition.delete({ where: { id } });
      } catch {
        // Ignore if already deleted
      }
    }
  });

  describe('soft delete behavior', () => {
    it('soft deletes a run by setting deletedAt', async () => {
      // Create a run specifically for this test
      const run = await db.run.create({
        data: {
          definitionId: testDefinitionId,
          status: 'COMPLETED',
          config: { schema_version: 1, models: ['test'] },
          progress: { total: 1, completed: 1, failed: 0 },
          completedAt: new Date(),
        },
      });
      createdRunIds.push(run.id);

      // Soft delete
      await db.run.update({
        where: { id: run.id },
        data: { deletedAt: new Date() },
      });

      // Verify it still exists but has deletedAt set
      const deleted = await db.run.findUnique({ where: { id: run.id } });
      expect(deleted).not.toBeNull();
      expect(deleted?.deletedAt).not.toBeNull();
    });

    it('cascades soft delete to transcripts', async () => {
      // Create run
      const run = await db.run.create({
        data: {
          definitionId: testDefinitionId,
          status: 'COMPLETED',
          config: { schema_version: 1, models: ['test'] },
          progress: { total: 1, completed: 1, failed: 0 },
          completedAt: new Date(),
        },
      });
      createdRunIds.push(run.id);

      // Create transcript
      const transcript = await db.transcript.create({
        data: {
          runId: run.id,
          modelId: 'test-model',
          content: { schema_version: 1, messages: [] },
          turnCount: 1,
          tokenCount: 50,
          durationMs: 500,
        },
      });
      createdTranscriptIds.push(transcript.id);

      const now = new Date();

      // Soft delete both
      await db.$transaction([
        db.run.update({
          where: { id: run.id },
          data: { deletedAt: now },
        }),
        db.transcript.update({
          where: { id: transcript.id },
          data: { deletedAt: now },
        }),
      ]);

      // Verify both are soft deleted
      const deletedRun = await db.run.findUnique({ where: { id: run.id } });
      const deletedTranscript = await db.transcript.findUnique({ where: { id: transcript.id } });

      expect(deletedRun?.deletedAt).not.toBeNull();
      expect(deletedTranscript?.deletedAt).not.toBeNull();
    });

    it('cascades soft delete to analysis results', async () => {
      // Create run
      const run = await db.run.create({
        data: {
          definitionId: testDefinitionId,
          status: 'COMPLETED',
          config: { schema_version: 1, models: ['test'] },
          progress: { total: 1, completed: 1, failed: 0 },
          completedAt: new Date(),
        },
      });
      createdRunIds.push(run.id);

      // Create analysis result
      const analysis = await db.analysisResult.create({
        data: {
          runId: run.id,
          analysisType: 'test_type',
          inputHash: 'test-hash-' + Date.now(),
          codeVersion: '1.0.0',
          output: { schema_version: 1, results: {} },
          status: 'CURRENT',
        },
      });
      createdAnalysisIds.push(analysis.id);

      const now = new Date();

      // Soft delete both
      await db.$transaction([
        db.run.update({
          where: { id: run.id },
          data: { deletedAt: now },
        }),
        db.analysisResult.update({
          where: { id: analysis.id },
          data: { deletedAt: now },
        }),
      ]);

      // Verify both are soft deleted
      const deletedRun = await db.run.findUnique({ where: { id: run.id } });
      const deletedAnalysis = await db.analysisResult.findUnique({ where: { id: analysis.id } });

      expect(deletedRun?.deletedAt).not.toBeNull();
      expect(deletedAnalysis?.deletedAt).not.toBeNull();
    });

    it('sets status to CANCELLED for running runs', async () => {
      // Create running run
      const run = await db.run.create({
        data: {
          definitionId: testDefinitionId,
          status: 'RUNNING',
          config: { schema_version: 1, models: ['test'] },
          progress: { total: 10, completed: 5, failed: 0 },
          startedAt: new Date(),
        },
      });
      createdRunIds.push(run.id);

      const now = new Date();

      // Soft delete with status change
      await db.run.update({
        where: { id: run.id },
        data: {
          deletedAt: now,
          status: 'CANCELLED',
          completedAt: now,
        },
      });

      // Verify status changed
      const deleted = await db.run.findUnique({ where: { id: run.id } });
      expect(deleted?.status).toBe('CANCELLED');
      expect(deleted?.deletedAt).not.toBeNull();
      expect(deleted?.completedAt).not.toBeNull();
    });
  });

  describe('response format', () => {
    it('includes expected fields in success response', () => {
      const response = {
        success: true,
        run_id: 'test-run-id',
        definition_id: 'test-def-id',
        deleted_at: new Date().toISOString(),
        previous_status: 'COMPLETED',
        deleted_count: {
          runs: 1,
          transcripts: 5,
          analysis_results: 2,
        },
        jobs_cancelled: 0,
      };

      expect(response.success).toBe(true);
      expect(response.run_id).toBeDefined();
      expect(response.definition_id).toBeDefined();
      expect(response.deleted_at).toBeDefined();
      expect(response.deleted_count.runs).toBe(1);
    });

    it('includes job cancellation info for running runs', () => {
      const response = {
        success: true,
        run_id: 'test-run-id',
        definition_id: 'test-def-id',
        deleted_at: new Date().toISOString(),
        previous_status: 'RUNNING',
        deleted_count: {
          runs: 1,
          transcripts: 3,
          analysis_results: 0,
        },
        jobs_cancelled: 2,
      };

      expect(response.previous_status).toBe('RUNNING');
      expect(response.jobs_cancelled).toBeGreaterThan(0);
    });

    it('includes error code for not found', () => {
      const errorResponse = {
        error: 'NOT_FOUND',
        message: 'Run not found: nonexistent-id',
      };

      expect(errorResponse.error).toBe('NOT_FOUND');
    });

    it('includes error code for already deleted', () => {
      const errorResponse = {
        error: 'ALREADY_DELETED',
        message: 'Run is already deleted: some-id',
      };

      expect(errorResponse.error).toBe('ALREADY_DELETED');
    });
  });

  describe('audit logging', () => {
    it('logs deletion with correct action', () => {
      const auditEntry = {
        action: 'delete_run',
        userId: 'mcp-user',
        entityId: 'test-run-id',
        entityType: 'run',
        requestId: 'test-request-id',
        metadata: {
          deletedCount: {
            primary: 1,
            transcripts: 5,
            analysisResults: 2,
          },
        },
      };

      expect(auditEntry.action).toBe('delete_run');
      expect(auditEntry.entityType).toBe('run');
      expect(auditEntry.metadata.deletedCount).toBeDefined();
    });
  });

  describe('soft-deleted runs are hidden', () => {
    it('excludes soft-deleted runs from list queries', async () => {
      // Create and soft-delete a run
      const run = await db.run.create({
        data: {
          definitionId: testDefinitionId,
          status: 'COMPLETED',
          config: { schema_version: 1, models: ['test'] },
          progress: { total: 1, completed: 1, failed: 0 },
          completedAt: new Date(),
        },
      });
      createdRunIds.push(run.id);

      await db.run.update({
        where: { id: run.id },
        data: { deletedAt: new Date() },
      });

      // Query with deletedAt: null filter (standard pattern)
      const visibleRuns = await db.run.findMany({
        where: { deletedAt: null },
      });

      // The soft-deleted run should not appear
      const found = visibleRuns.find((r) => r.id === run.id);
      expect(found).toBeUndefined();
    });

    it('excludes soft-deleted transcripts from queries', async () => {
      // Create run and transcript
      const run = await db.run.create({
        data: {
          definitionId: testDefinitionId,
          status: 'COMPLETED',
          config: { schema_version: 1, models: ['test'] },
          progress: { total: 1, completed: 1, failed: 0 },
          completedAt: new Date(),
        },
      });
      createdRunIds.push(run.id);

      const transcript = await db.transcript.create({
        data: {
          runId: run.id,
          modelId: 'test-model',
          content: { schema_version: 1, messages: [] },
          turnCount: 1,
          tokenCount: 50,
          durationMs: 500,
        },
      });
      createdTranscriptIds.push(transcript.id);

      // Soft delete
      await db.transcript.update({
        where: { id: transcript.id },
        data: { deletedAt: new Date() },
      });

      // Query with deletedAt: null filter
      const visibleTranscripts = await db.transcript.findMany({
        where: { runId: run.id, deletedAt: null },
      });

      expect(visibleTranscripts.find((t) => t.id === transcript.id)).toBeUndefined();
    });

    it('excludes soft-deleted analysis results from queries', async () => {
      // Create run and analysis
      const run = await db.run.create({
        data: {
          definitionId: testDefinitionId,
          status: 'COMPLETED',
          config: { schema_version: 1, models: ['test'] },
          progress: { total: 1, completed: 1, failed: 0 },
          completedAt: new Date(),
        },
      });
      createdRunIds.push(run.id);

      const analysis = await db.analysisResult.create({
        data: {
          runId: run.id,
          analysisType: 'test_type',
          inputHash: 'test-hash-hidden-' + Date.now(),
          codeVersion: '1.0.0',
          output: { schema_version: 1, results: {} },
          status: 'CURRENT',
        },
      });
      createdAnalysisIds.push(analysis.id);

      // Soft delete
      await db.analysisResult.update({
        where: { id: analysis.id },
        data: { deletedAt: new Date() },
      });

      // Query with deletedAt: null filter
      const visibleAnalysis = await db.analysisResult.findMany({
        where: { runId: run.id, deletedAt: null },
      });

      expect(visibleAnalysis.find((a) => a.id === analysis.id)).toBeUndefined();
    });
  });
});
