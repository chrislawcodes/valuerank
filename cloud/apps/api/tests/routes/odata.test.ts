/**
 * Integration tests for OData endpoints
 *
 * Tests:
 * - GET /api/odata/runs/:id - Service document
 * - GET /api/odata/runs/:id/$metadata - Metadata document with dimension columns
 * - GET /api/odata/runs/:id/Transcripts - Transcript data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/server.js';
import { getAuthHeader } from '../test-utils.js';
import { db } from '@valuerank/db';

// Mock PgBoss
vi.mock('../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  })),
  createBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  startBoss: vi.fn().mockResolvedValue(undefined),
  stopBoss: vi.fn().mockResolvedValue(undefined),
  isBossRunning: vi.fn().mockReturnValue(false),
}));

const app = createServer();

describe('OData Endpoints', () => {
  let testRunId: string | undefined;
  let testDefinitionId: string | undefined;
  let testScenarioId: string | undefined;

  beforeEach(async () => {
    // Create a test definition with dimension structure
    const definition = await db.definition.create({
      data: {
        name: 'Test Definition for OData',
        content: {
          preamble: 'Test preamble',
          template: 'Test template with [Power_Dominance] and [Self_Direction_Action]',
          dimensions: [
            { name: 'Power_Dominance', levels: [{ score: 1, label: 'low' }, { score: 5, label: 'high' }] },
            { name: 'Self_Direction_Action', levels: [{ score: 1, label: 'low' }, { score: 5, label: 'high' }] },
          ],
        },
      },
    });
    testDefinitionId = definition.id;

    // Create a test run
    const run = await db.run.create({
      data: {
        definitionId: testDefinitionId,
        status: 'COMPLETED',
        config: { models: ['test-model'] },
        progress: { total: 1, completed: 1, failed: 0 },
      },
    });
    testRunId = run.id;

    // Create a test scenario with dimension values
    const scenario = await db.scenario.create({
      data: {
        definitionId: testDefinitionId,
        name: 'Power_Dominance_3 / Self_Direction_Action_2',
        content: {
          prompt: 'Test scenario prompt',
          dimensions: { Power_Dominance: 3, Self_Direction_Action: 2 },
        },
      },
    });
    testScenarioId = scenario.id;

    // Create a test transcript
    await db.transcript.create({
      data: {
        runId: testRunId,
        scenarioId: testScenarioId,
        modelId: 'anthropic:claude-3-5-sonnet',
        modelVersion: 'claude-3-5-sonnet-20241022',
        content: { transcript: 'Test transcript content' },
        turnCount: 2,
        tokenCount: 100,
        durationMs: 1000,
        decisionCode: '3',
        decisionText: 'Test decision',
        summarizedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    // Cleanup in correct order (transcripts -> scenarios -> runs -> definitions)
    if (testRunId) {
      await db.transcript.deleteMany({ where: { runId: testRunId } });
      await db.run.delete({ where: { id: testRunId } }).catch(() => {});
    }
    if (testScenarioId) {
      await db.scenario.delete({ where: { id: testScenarioId } }).catch(() => {});
    }
    if (testDefinitionId) {
      await db.definition.delete({ where: { id: testDefinitionId } }).catch(() => {});
    }
  });

  describe('GET /api/odata/runs/:id', () => {
    it('returns service document with Transcripts entity set', async () => {
      const res = await request(app)
        .get(`/api/odata/runs/${testRunId}`)
        .set('Authorization', getAuthHeader());

      expect(res.status).toBe(200);
      expect(res.headers['odata-version']).toBe('4.0');
      expect(res.body['@odata.context']).toContain('$metadata');
      expect(res.body.value).toHaveLength(1);
      expect(res.body.value[0].name).toBe('Transcripts');
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(app).get(`/api/odata/runs/${testRunId}`);
      expect(res.status).toBe(401);
    });

    it('returns 404 for non-existent run', async () => {
      const res = await request(app)
        .get('/api/odata/runs/nonexistent-run-id')
        .set('Authorization', getAuthHeader());

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/odata/runs/:id/$metadata', () => {
    it('returns XML metadata with dimension columns from definition', async () => {
      const res = await request(app)
        .get(`/api/odata/runs/${testRunId}/$metadata`)
        .set('Authorization', getAuthHeader());

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/xml');
      expect(res.headers['odata-version']).toBe('4.0');

      // Check that dimension columns are declared
      expect(res.text).toContain('<Property Name="Power_Dominance" Type="Edm.Int32"/>');
      expect(res.text).toContain('<Property Name="Self_Direction_Action" Type="Edm.Int32"/>');

      // Check base properties are present
      expect(res.text).toContain('<Property Name="id" Type="Edm.String" Nullable="false"/>');
      expect(res.text).toContain('<Property Name="modelId" Type="Edm.String" Nullable="false"/>');
      expect(res.text).toContain('<Property Name="decisionCode" Type="Edm.String"/>');
    });

    it('handles XML special characters in dimension names', async () => {
      // Update the definition with a dimension name that needs escaping
      await db.definition.update({
        where: { id: testDefinitionId },
        data: {
          content: {
            preamble: 'Test',
            template: 'Test',
            dimensions: [
              { name: 'Test<Dimension>', levels: [{ score: 1, label: 'test' }] },
            ],
          },
        },
      });

      const res = await request(app)
        .get(`/api/odata/runs/${testRunId}/$metadata`)
        .set('Authorization', getAuthHeader());

      expect(res.status).toBe(200);
      // The < should be escaped as &lt;
      expect(res.text).toContain('Test&lt;Dimension&gt;');
    });

    it('handles definition with no dimensions gracefully', async () => {
      // Update definition to have no dimensions array
      await db.definition.update({
        where: { id: testDefinitionId },
        data: {
          content: {
            preamble: 'Test',
            template: 'Test',
            // No dimensions field
          },
        },
      });

      const res = await request(app)
        .get(`/api/odata/runs/${testRunId}/$metadata`)
        .set('Authorization', getAuthHeader());

      expect(res.status).toBe(200);
      // Should still have base properties but no dimension properties
      expect(res.text).toContain('<Property Name="id" Type="Edm.String"');
      // Should not have any dimension-specific properties
      expect(res.text).not.toContain('Power_Dominance');
    });

    it('deduplicates dimension names', async () => {
      // Update definition with duplicate dimension names
      await db.definition.update({
        where: { id: testDefinitionId },
        data: {
          content: {
            preamble: 'Test',
            template: 'Test',
            dimensions: [
              { name: 'DuplicateDim', levels: [{ score: 1, label: 'a' }] },
              { name: 'DuplicateDim', levels: [{ score: 2, label: 'b' }] },
              { name: 'UniqueDim', levels: [{ score: 1, label: 'c' }] },
            ],
          },
        },
      });

      const res = await request(app)
        .get(`/api/odata/runs/${testRunId}/$metadata`)
        .set('Authorization', getAuthHeader());

      expect(res.status).toBe(200);
      // DuplicateDim should only appear once
      const duplicateMatches = res.text.match(/Name="DuplicateDim"/g);
      expect(duplicateMatches).toHaveLength(1);
      expect(res.text).toContain('Name="UniqueDim"');
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(app).get(`/api/odata/runs/${testRunId}/$metadata`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/odata/runs/:id/Transcripts', () => {
    it('returns transcript data with dimension columns', async () => {
      const res = await request(app)
        .get(`/api/odata/runs/${testRunId}/Transcripts`)
        .set('Authorization', getAuthHeader());

      expect(res.status).toBe(200);
      expect(res.headers['odata-version']).toBe('4.0');
      expect(res.body['@odata.context']).toContain('$metadata#Transcripts');
      expect(res.body['@odata.count']).toBe(1);

      const transcript = res.body.value[0];
      expect(transcript.modelId).toBe('anthropic:claude-3-5-sonnet');
      expect(transcript.decisionCode).toBe('3');

      // Check dimension values are included
      expect(transcript.Power_Dominance).toBe(3);
      expect(transcript.Self_Direction_Action).toBe(2);
    });

    it('requires COMPLETED status', async () => {
      // Update run to non-completed status
      await db.run.update({
        where: { id: testRunId },
        data: { status: 'RUNNING' },
      });

      const res = await request(app)
        .get(`/api/odata/runs/${testRunId}/Transcripts`)
        .set('Authorization', getAuthHeader());

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('COMPLETED');
    });

    it('supports $top pagination', async () => {
      const res = await request(app)
        .get(`/api/odata/runs/${testRunId}/Transcripts?$top=0`)
        .set('Authorization', getAuthHeader());

      expect(res.status).toBe(200);
      expect(res.body.value).toHaveLength(0);
      expect(res.body['@odata.count']).toBe(1); // Total count still reported
    });

    it('supports $select for specific fields', async () => {
      const res = await request(app)
        .get(`/api/odata/runs/${testRunId}/Transcripts?$select=id,modelId,Power_Dominance`)
        .set('Authorization', getAuthHeader());

      expect(res.status).toBe(200);
      const transcript = res.body.value[0];

      // Should only have selected fields
      expect(transcript.id).toBeDefined();
      expect(transcript.modelId).toBeDefined();
      expect(transcript.Power_Dominance).toBe(3);

      // Should not have non-selected fields
      expect(transcript.decisionCode).toBeUndefined();
      expect(transcript.Self_Direction_Action).toBeUndefined();
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(app).get(`/api/odata/runs/${testRunId}/Transcripts`);
      expect(res.status).toBe(401);
    });
  });
});
