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

    // Create a test scenario with cloud format: name ends with (S1-C2), dimensions in content
    const scenario = await db.scenario.create({
      data: {
        definitionId: testDefinitionId,
        name: 'Test scenario description (S1-C2)',
        content: {
          prompt: 'test',
          dimensions: { Stakes: 'low stakes', Certainty: 'uncertain' },
        },
      },
    });

    // Create test transcripts with summary data
    await db.transcript.createMany({
      data: [
        {
          runId: testRunId,
          scenarioId: scenario.id,
          modelId: 'anthropic:gpt-4o-20241120',
          modelVersion: 'gpt-4o-2024-11-20',
          content: { transcript: 'Test transcript content 1', decision: 'Option A' },
          turnCount: 3,
          tokenCount: 150,
          durationMs: 1500,
          decisionCode: '1',
          decisionText: 'AI chose option A, prioritizing safety',
          summarizedAt: new Date(),
        },
        {
          runId: testRunId,
          scenarioId: scenario.id,
          modelId: 'anthropic:claude-3-5-sonnet-20241022',
          modelVersion: 'claude-3-5-sonnet-20241022',
          content: { transcript: 'Test transcript content 2', decision: 'Option B' },
          turnCount: 4,
          tokenCount: 200,
          durationMs: 2000,
          decisionCode: '2',
          decisionText: 'AI chose option B, prioritizing efficiency',
          summarizedAt: new Date(),
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

  it('returns CSV with correct headers including variable columns', async () => {
    const response = await request(app)
      .get(`/api/export/runs/${testRunId}/csv`)
      .set('Authorization', getAuthHeader());

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);

    const lines = response.text.split('\n');
    // First line after BOM is header
    const headerLine = lines[0]?.replace('\uFEFF', '');
    // Base headers plus dimension columns from content.dimensions (alphabetically sorted)
    expect(headerLine).toBe('Scenario,AI Model Name,Decision Code,Decision Text,Certainty,Stakes');
  });

  it('returns CSV with correct data rows including variable values', async () => {
    const response = await request(app)
      .get(`/api/export/runs/${testRunId}/csv`)
      .set('Authorization', getAuthHeader());

    expect(response.status).toBe(200);

    const lines = response.text.split('\n').filter((l) => l.trim());
    // Header + 2 data rows
    expect(lines.length).toBe(3);

    // Check that data rows contain expected values (model names without provider/version)
    const dataLines = lines.slice(1);
    expect(dataLines.some((l) => l.includes('gpt-4o'))).toBe(true);
    expect(dataLines.some((l) => l.includes('claude-3-5-sonnet'))).toBe(true);
    // Check for decision codes
    expect(dataLines.some((l) => l.includes(',1,'))).toBe(true);
    expect(dataLines.some((l) => l.includes(',2,'))).toBe(true);
    // Scenario number is index-based (001, 002) since name has no number
    expect(dataLines.some((l) => l.startsWith('001,'))).toBe(true);
    expect(dataLines.some((l) => l.startsWith('002,'))).toBe(true);
    // Check for variable values at the end - parsed from (S1-C2): Certainty=2, Stakes=1
    expect(dataLines.every((l) => l.endsWith(',2,1'))).toBe(true);
  });

  it('sets correct Content-Disposition header', async () => {
    const response = await request(app)
      .get(`/api/export/runs/${testRunId}/csv`)
      .set('Authorization', getAuthHeader());

    expect(response.status).toBe(200);

    const contentDisposition = response.headers['content-disposition'];
    expect(contentDisposition).toMatch(/attachment/);
    // Filename format is summary_<8-char-id>_<date>.csv
    expect(contentDisposition).toMatch(/summary_/);
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

  it('handles special characters in decision text', async () => {
    // Create transcript with special characters in decisionText
    const scenario = await db.scenario.findFirst({
      where: { definitionId: testDefinitionId },
    });

    const specialTranscript = await db.transcript.create({
      data: {
        runId: testRunId!,
        scenarioId: scenario!.id,
        modelId: 'test-model',
        modelVersion: 'version-1',
        content: { test: 'data' },
        turnCount: 1,
        tokenCount: 10,
        durationMs: 100,
        decisionCode: '3',
        decisionText: 'Decision with, comma and "quotes"',
        summarizedAt: new Date(),
      },
    });

    try {
      const response = await request(app)
        .get(`/api/export/runs/${testRunId}/csv`)
        .set('Authorization', getAuthHeader());

      expect(response.status).toBe(200);

      // The special characters should be properly escaped with quotes
      expect(response.text).toMatch(/"Decision with, comma and ""quotes"""/);
    } finally {
      await db.transcript.delete({ where: { id: specialTranscript.id } });
    }
  });
});

describe('CSV Serialization Helper', () => {
  it('parses Python format scenario names correctly', async () => {
    const { formatCSVRow, transcriptToCSVRow } = await import(
      '../../src/services/export/csv.js'
    );

    const mockTranscript = {
      id: 'test-id',
      runId: 'run-123',
      scenarioId: 'scenario-456',
      modelId: 'anthropic:gpt-4o-20241120',
      modelVersion: 'gpt-4o-2024-11-20',
      content: { test: 'content' },
      turnCount: 3,
      tokenCount: 150,
      durationMs: 1500,
      definitionSnapshot: null,
      createdAt: new Date('2024-01-01T12:00:00Z'),
      lastAccessedAt: null,
      contentExpiresAt: null,
      decisionCode: '1',
      decisionText: 'AI chose safety',
      summarizedAt: new Date('2024-01-01T12:05:00Z'),
      // Python format: scenario_XXX_VarName1_VarName2
      scenario: {
        id: 'scenario-456',
        name: 'scenario_042_Stakes1_Certainty2',
        content: {},
      },
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0], 0);
    const formatted = formatCSVRow(row, ['Certainty', 'Stakes']);

    expect(formatted).toContain('042,');
    expect(formatted).toContain('gpt-4o');
    expect(row.variables).toEqual({ Stakes: 1, Certainty: 2 });
    expect(formatted).toMatch(/,2,1$/);
  });

  it('parses Cloud format scenario names with abbreviations', async () => {
    const { transcriptToCSVRow } = await import('../../src/services/export/csv.js');

    // Cloud format: "Description (F1-T2-H3)" with dimensions in content
    const mockTranscript = {
      modelId: 'gpt-4o',
      scenarioId: 'test',
      scenario: {
        id: 'test',
        name: 'Child wants to skip (F1-T2-H3)',
        content: { dimensions: { Freedom: 'low', Tradition: 'medium', Harmony: 'high' } },
      },
      decisionCode: '5',
      decisionText: 'Test',
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0], 0);

    // Index-based scenario number since name has no explicit number
    expect(row.scenario).toBe('001');
    // Abbreviations mapped to full names from content.dimensions
    expect(row.variables).toEqual({ Freedom: 1, Tradition: 2, Harmony: 3 });
  });

  it('uses index-based numbering when name has no number', async () => {
    const { transcriptToCSVRow } = await import('../../src/services/export/csv.js');

    const mockTranscript = {
      id: 'test-id',
      runId: 'run-123',
      scenarioId: 'scenario-456',
      modelId: 'gpt-4o',
      scenario: {
        id: 'scenario-456',
        name: 'Some description (S1-C2)',
        content: { dimensions: { Stakes: 'x', Certainty: 'y' } },
      },
      decisionCode: '2',
      decisionText: 'Test decision',
    };

    // Index 4 should produce "005" (1-based)
    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0], 4);

    expect(row.scenario).toBe('005');
    expect(row.variables).toEqual({ Stakes: 1, Certainty: 2 });
  });

  it('shows pending status when not summarized', async () => {
    const { transcriptToCSVRow } = await import('../../src/services/export/csv.js');

    const mockTranscript = {
      id: 'test-id',
      runId: 'run-123',
      scenarioId: 'scenario-456',
      modelId: 'gpt-4o',
      scenario: { id: 'scenario-456', name: 'Test', content: {} },
      decisionCode: null,
      decisionText: null,
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0], 0);

    expect(row.decisionCode).toBe('pending');
    expect(row.decisionText).toBe('Summary not yet generated');
  });

  it('generates correct filename', async () => {
    const { generateExportFilename } = await import('../../src/services/export/csv.js');

    const filename = generateExportFilename('test-run-id-12345678');

    expect(filename).toMatch(/^summary_test-run_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('extracts model name correctly', async () => {
    const { transcriptToCSVRow } = await import('../../src/services/export/csv.js');

    const mockTranscript = {
      modelId: 'anthropic:claude-3-5-sonnet-20241022',
      scenarioId: 'test',
      scenario: { id: 'test', name: 'scenario_001_Freedom3', content: {} },
      decisionCode: '1',
      decisionText: 'Test',
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0], 0);

    expect(row.modelName).toBe('claude-3-5-sonnet');
  });

  it('handles scenario name with no variables gracefully', async () => {
    const { transcriptToCSVRow, formatCSVRow } = await import('../../src/services/export/csv.js');

    const mockTranscript = {
      modelId: 'gpt-4o',
      scenarioId: 'test',
      scenario: { id: 'test', name: 'Simple description', content: {} },
      decisionCode: '1',
      decisionText: 'Test',
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0], 0);
    const formatted = formatCSVRow(row, ['Stakes', 'Certainty']);

    // Variable values should be empty when not parseable
    expect(formatted).toMatch(/,,$/);
    expect(row.variables).toEqual({});
  });
});
