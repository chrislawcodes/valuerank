/**
 * Integration tests for CSV export endpoint
 *
 * Tests GET /api/export/runs/:id/csv
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

describe('CSV Export Endpoint', () => {
  let testRunId: string | undefined;
  let testDefinitionId: string | undefined;

  beforeEach(async () => {
    // Create a test definition
    const definition = await db.definition.create({
      data: {
        name: 'Test Definition for Export',
        content: { test: true },
      },
    });
    testDefinitionId = definition.id;

    // Create a test run
    const run = await db.run.create({
      data: {
        definitionId: testDefinitionId,
        status: 'COMPLETED',
        config: { models: ['test-model'] },
        progress: { total: 2, completed: 2, failed: 0 },
      },
    });
    testRunId = run.id;

    // Create a test scenario
    const scenario = await db.scenario.create({
      data: {
        definitionId: testDefinitionId,
        name: 'Test Scenario',
        content: { prompt: 'test' },
      },
    });

    // Create test transcripts
    await db.transcript.createMany({
      data: [
        {
          runId: testRunId,
          scenarioId: scenario.id,
          modelId: 'gpt-4o',
          modelVersion: 'gpt-4o-2024-11-20',
          content: { transcript: 'Test transcript content 1', decision: 'Option A' },
          turnCount: 3,
          tokenCount: 150,
          durationMs: 1500,
        },
        {
          runId: testRunId,
          scenarioId: scenario.id,
          modelId: 'claude-3-5-sonnet',
          modelVersion: 'claude-3-5-sonnet-20241022',
          content: { transcript: 'Test transcript content 2', decision: 'Option B' },
          turnCount: 4,
          tokenCount: 200,
          durationMs: 2000,
        },
      ],
    });
  });

  afterEach(async () => {
    // Cleanup - handle undefined cases
    if (testRunId) {
      await db.transcript.deleteMany({ where: { runId: testRunId } });
      await db.run.deleteMany({ where: { id: testRunId } });
    }
    if (testDefinitionId) {
      await db.scenario.deleteMany({ where: { definitionId: testDefinitionId } });
      await db.definition.delete({ where: { id: testDefinitionId } });
    }
  });

  it('returns CSV with correct headers', async () => {
    const response = await request(app)
      .get(`/api/export/runs/${testRunId}/csv`)
      .set('Authorization', getAuthHeader());

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);

    const lines = response.text.split('\n');
    // First line after BOM is header
    const headerLine = lines[0]?.replace('\uFEFF', '');
    expect(headerLine).toBe(
      'run_id,scenario_id,model_id,model_version,turn_count,token_count,duration_ms,created_at'
    );
  });

  it('returns CSV with correct data rows', async () => {
    const response = await request(app)
      .get(`/api/export/runs/${testRunId}/csv`)
      .set('Authorization', getAuthHeader());

    expect(response.status).toBe(200);

    const lines = response.text.split('\n').filter((l) => l.trim());
    // Header + 2 data rows
    expect(lines.length).toBe(3);

    // Check that data rows contain expected values
    const dataLines = lines.slice(1);
    expect(dataLines.some((l) => l.includes('gpt-4o'))).toBe(true);
    expect(dataLines.some((l) => l.includes('claude-3-5-sonnet'))).toBe(true);
  });

  it('sets correct Content-Disposition header', async () => {
    const response = await request(app)
      .get(`/api/export/runs/${testRunId}/csv`)
      .set('Authorization', getAuthHeader());

    expect(response.status).toBe(200);

    const contentDisposition = response.headers['content-disposition'];
    expect(contentDisposition).toMatch(/attachment/);
    expect(contentDisposition).toMatch(new RegExp(`run_${testRunId}`));
    expect(contentDisposition).toMatch(/\.csv/);
  });

  it('includes UTF-8 BOM for Excel compatibility', async () => {
    const response = await request(app)
      .get(`/api/export/runs/${testRunId}/csv`)
      .set('Authorization', getAuthHeader());

    expect(response.status).toBe(200);

    // Check for BOM at start of response
    expect(response.text.charCodeAt(0)).toBe(0xfeff);
  });

  it('requires authentication', async () => {
    const response = await request(app).get(`/api/export/runs/${testRunId}/csv`);

    expect(response.status).toBe(401);
  });

  it('returns 404 for non-existent run', async () => {
    const response = await request(app)
      .get('/api/export/runs/non-existent-run-id/csv')
      .set('Authorization', getAuthHeader());

    expect(response.status).toBe(404);
  });

  it('returns empty CSV (headers only) for run with no transcripts', async () => {
    // Create a run with no transcripts
    const emptyRun = await db.run.create({
      data: {
        definitionId: testDefinitionId,
        status: 'PENDING',
        config: { models: ['test-model'] },
        progress: { total: 0, completed: 0, failed: 0 },
      },
    });

    try {
      const response = await request(app)
        .get(`/api/export/runs/${emptyRun.id}/csv`)
        .set('Authorization', getAuthHeader());

      expect(response.status).toBe(200);

      const lines = response.text.split('\n').filter((l) => l.trim());
      // Only header, no data rows
      expect(lines.length).toBe(1);
    } finally {
      await db.run.delete({ where: { id: emptyRun.id } });
    }
  });

  it('handles special characters in model fields', async () => {
    // Create transcript with special characters in modelVersion
    const scenario = await db.scenario.findFirst({
      where: { definitionId: testDefinitionId },
    });

    const specialTranscript = await db.transcript.create({
      data: {
        runId: testRunId!,
        scenarioId: scenario!.id,
        modelId: 'test-model',
        modelVersion: 'version-with, comma',
        content: { test: 'data' },
        turnCount: 1,
        tokenCount: 10,
        durationMs: 100,
      },
    });

    try {
      const response = await request(app)
        .get(`/api/export/runs/${testRunId}/csv`)
        .set('Authorization', getAuthHeader());

      expect(response.status).toBe(200);

      // The special characters should be properly escaped
      expect(response.text).toMatch(/"version-with, comma"/);
    } finally {
      await db.transcript.delete({ where: { id: specialTranscript.id } });
    }
  });
});

describe('CSV Serialization Helper', () => {
  it('formats rows correctly', async () => {
    // Import helpers directly for unit testing
    const { formatCSVRow, transcriptToCSVRow } = await import(
      '../../src/services/export/csv.js'
    );

    const mockTranscript = {
      id: 'test-id',
      runId: 'run-123',
      scenarioId: 'scenario-456',
      modelId: 'gpt-4o',
      modelVersion: 'gpt-4o-2024-11-20',
      content: { test: 'content' },
      turnCount: 3,
      tokenCount: 150,
      durationMs: 1500,
      definitionSnapshot: null,
      createdAt: new Date('2024-01-01T12:00:00Z'),
      lastAccessedAt: null,
      contentExpiresAt: null,
    };

    const row = transcriptToCSVRow(mockTranscript);
    const formatted = formatCSVRow(row);

    expect(formatted).toContain('run-123');
    expect(formatted).toContain('scenario-456');
    expect(formatted).toContain('gpt-4o');
    expect(formatted).toContain('gpt-4o-2024-11-20');
    expect(formatted).toContain('3');
    expect(formatted).toContain('150');
    expect(formatted).toContain('1500');
  });

  it('generates correct filename', async () => {
    const { generateExportFilename } = await import('../../src/services/export/csv.js');

    const filename = generateExportFilename('test-run-id');

    expect(filename).toMatch(/^run_test-run-id_\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
