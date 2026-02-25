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

    // Create a test scenario with numeric dimension scores in content
    const scenario = await db.scenario.create({
      data: {
        definitionId: testDefinitionId,
        name: 'Test scenario description',
        content: {
          prompt: 'test',
          dimensions: { Stakes: 1, Certainty: 2 },
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
    // Headers: Model, Batch, Sample Index, Variables (alphabetical), Decision Code, Transcript ID, Probe Prompt, Target Response
    expect(headerLine).toBe(
      'AI Model Name,Batch,Sample Index,Certainty,Stakes,Decision Code,Transcript ID,Probe Prompt,Target Response'
    );
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
    // Model name should be first column followed by Batch (empty) then sample index
    expect(dataLines.some((l) => l.startsWith('gpt-4o,,0,'))).toBe(true);
    expect(dataLines.some((l) => l.startsWith('claude-3-5-sonnet,,0,'))).toBe(true);
    // Variable values come after model name, batch, and sample index: Certainty=2, Stakes=1
    expect(dataLines.some((l) => l.includes('gpt-4o,,0,2,1,'))).toBe(true);
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

      // Decision Text is no longer in CSV output - verify the transcript was included
      // and the response has valid CSV format with the expected number of data lines
      const lines = response.text.split('\n').filter((l) => l.trim());
      // Header + 3 data rows (2 from beforeEach + 1 special)
      expect(lines.length).toBe(4);
    } finally {
      await db.transcript.delete({ where: { id: specialTranscript.id } });
    }
  });
});

describe('CSV Serialization Helper', () => {
  it('reads dimension scores directly from content.dimensions', async () => {
    const { formatCSVRow, transcriptToCSVRow } = await import(
      '../../src/services/export/csv.js'
    );

    const mockTranscript = {
      id: 'test-id',
      runId: 'run-123',
      scenarioId: 'scenario-456',
      modelId: 'anthropic:gpt-4o-20241120',
      modelVersion: 'gpt-4o-2024-11-20',
      sampleIndex: 0,
      content: {
        turns: [{ targetResponse: 'I choose option A' }],
      },
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
      scenario: {
        id: 'scenario-456',
        name: 'scenario_042_test',
        // Numeric scores stored directly in content.dimensions
        content: { dimensions: { Stakes: 1, Certainty: 2 } },
      },
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0]);
    const formatted = formatCSVRow(row, ['Certainty', 'Stakes']);

    expect(row.transcriptId).toBe('test-id');
    expect(row.sampleIndex).toBe(0);
    expect(formatted).toContain('gpt-4o');
    // Scores read directly from content.dimensions
    expect(row.variables).toEqual({ Stakes: 1, Certainty: 2 });
    // Format: Model, Batch, SampleIndex, Certainty, Stakes, DecisionCode, TranscriptId, TargetResponse
    expect(formatted).toContain('gpt-4o,,0,2,1,1,test-id');
    expect(row.targetResponse).toBe('I choose option A');
  });

  it('handles full dimension names correctly', async () => {
    const { transcriptToCSVRow } = await import('../../src/services/export/csv.js');

    // Full dimension names stored in content.dimensions
    const mockTranscript = {
      id: 'transcript-123',
      modelId: 'gpt-4o',
      scenarioId: 'test',
      sampleIndex: 0,
      content: { turns: [] },
      scenario: {
        id: 'test',
        name: 'Child wants to skip bat mitzvah',
        content: { dimensions: { Freedom: 1, Tradition: 2, Harmony: 3 } },
      },
      decisionCode: '5',
      decisionText: 'Test',
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0]);

    expect(row.transcriptId).toBe('transcript-123');
    expect(row.sampleIndex).toBe(0);
    // Full names with numeric scores from content.dimensions
    expect(row.variables).toEqual({ Freedom: 1, Tradition: 2, Harmony: 3 });
  });

  it('includes transcript ID in output', async () => {
    const { transcriptToCSVRow } = await import('../../src/services/export/csv.js');

    const mockTranscript = {
      id: 'test-transcript-id',
      runId: 'run-123',
      scenarioId: 'scenario-456',
      modelId: 'gpt-4o',
      sampleIndex: 2,
      content: { turns: [] },
      scenario: {
        id: 'scenario-456',
        name: 'Some description',
        content: { dimensions: { Stakes: 1, Certainty: 2 } },
      },
      decisionCode: '2',
      decisionText: 'Test decision',
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0]);

    expect(row.transcriptId).toBe('test-transcript-id');
    expect(row.sampleIndex).toBe(2);
    expect(row.variables).toEqual({ Stakes: 1, Certainty: 2 });
  });

  it('shows pending status when not summarized', async () => {
    const { transcriptToCSVRow } = await import('../../src/services/export/csv.js');

    const mockTranscript = {
      id: 'test-id',
      runId: 'run-123',
      scenarioId: 'scenario-456',
      modelId: 'gpt-4o',
      sampleIndex: 0,
      content: { turns: [] },
      scenario: { id: 'scenario-456', name: 'Test', content: {} },
      decisionCode: null,
      decisionText: null,
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0]);

    expect(row.decisionCode).toBe('pending');
  });

  it('generates correct filename', async () => {
    const { generateExportFilename } = await import('../../src/services/export/csv.js');

    const filename = generateExportFilename('test-run-id-12345678');

    expect(filename).toMatch(/^summary_test-run_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('extracts model name correctly', async () => {
    const { transcriptToCSVRow } = await import('../../src/services/export/csv.js');

    const mockTranscript = {
      id: 'transcript-id',
      modelId: 'anthropic:claude-3-5-sonnet-20241022',
      scenarioId: 'test',
      sampleIndex: 0,
      content: { turns: [] },
      scenario: { id: 'test', name: 'scenario_001', content: { dimensions: { Freedom: 3 } } },
      decisionCode: '1',
      decisionText: 'Test',
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0]);

    expect(row.modelName).toBe('claude-3-5-sonnet');
  });

  it('handles empty dimensions gracefully', async () => {
    const { transcriptToCSVRow, formatCSVRow } = await import('../../src/services/export/csv.js');

    const mockTranscript = {
      id: 'transcript-id',
      modelId: 'gpt-4o',
      scenarioId: 'test',
      sampleIndex: 0,
      content: { turns: [] },
      scenario: { id: 'test', name: 'Simple description', content: {} },
      decisionCode: '1',
      decisionText: 'Test',
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0]);
    const formatted = formatCSVRow(row, ['Stakes', 'Certainty']);

    // Variable values should be empty when no dimensions
    // Format: Model,Batch,SampleIndex,Stakes,Certainty,DecisionCode,...
    // With empty Stakes and Certainty, we get: model,,0,,,DecisionCode,...
    expect(formatted).toContain('gpt-4o,,0,,');
    expect(row.variables).toEqual({});
  });

  it('filters out non-numeric dimension values', async () => {
    const { transcriptToCSVRow } = await import('../../src/services/export/csv.js');

    // Mixed content - some numeric, some string (legacy data)
    const mockTranscript = {
      id: 'transcript-id',
      modelId: 'gpt-4o',
      scenarioId: 'test',
      sampleIndex: 0,
      content: { turns: [] },
      scenario: {
        id: 'test',
        name: 'Test',
        content: { dimensions: { Freedom: 1, OldFormat: 'text value', Harmony: 3 } },
      },
      decisionCode: '1',
      decisionText: 'Test',
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0]);

    // Only numeric values should be included
    expect(row.variables).toEqual({ Freedom: 1, Harmony: 3 });
  });

  it('extracts target response from transcript turns', async () => {
    const { transcriptToCSVRow } = await import('../../src/services/export/csv.js');

    const mockTranscript = {
      id: 'transcript-id',
      modelId: 'gpt-4o',
      scenarioId: 'test',
      sampleIndex: 0,
      content: {
        turns: [
          { targetResponse: 'First response' },
          { targetResponse: 'Second response' },
        ],
      },
      scenario: { id: 'test', name: 'Test', content: {} },
      decisionCode: '1',
      decisionText: 'Test',
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0]);

    // Multiple responses are joined with separator
    expect(row.targetResponse).toBe('First response\n\n---\n\nSecond response');
  });

  it('extracts probe prompt from transcript turns', async () => {
    const { transcriptToCSVRow, formatCSVRow } = await import('../../src/services/export/csv.js');

    const mockTranscript = {
      id: 'transcript-id',
      modelId: 'gpt-4o',
      scenarioId: 'test',
      sampleIndex: 0,
      content: {
        turns: [
          { promptLabel: 'scenario_prompt', probePrompt: 'What should I do?', targetResponse: 'Answer 1' },
          { promptLabel: 'followup_1', probePrompt: 'Are you sure?', targetResponse: 'Answer 2' },
        ],
      },
      scenario: { id: 'test', name: 'Test', content: {} },
      decisionCode: '1',
      decisionText: 'Test',
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0]);
    expect(row.probePrompt).toBe('What should I do?\n\n---\n\nAre you sure?');

    const formatted = formatCSVRow(row, []);
    // Post-variable columns include Probe Prompt before Target Response.
    expect(formatted).toContain(',1,transcript-id,');
    expect(formatted).toContain('What should I do?');
    expect(formatted).toContain('Are you sure?');
  });

  it('includes sample index in CSV row for multi-sample runs', async () => {
    const { transcriptToCSVRow, formatCSVRow } = await import('../../src/services/export/csv.js');

    const mockTranscript = {
      id: 'transcript-id',
      modelId: 'gpt-4o',
      scenarioId: 'test',
      sampleIndex: 3,
      content: { turns: [] },
      scenario: { id: 'test', name: 'Test', content: { dimensions: { Stakes: 2 } } },
      decisionCode: '1',
      decisionText: 'Test',
    };

    const row = transcriptToCSVRow(mockTranscript as Parameters<typeof transcriptToCSVRow>[0]);
    const formatted = formatCSVRow(row, ['Stakes']);

    expect(row.sampleIndex).toBe(3);
    // Format: Model,Batch,SampleIndex,Stakes,DecisionCode,...
    expect(formatted).toContain('gpt-4o,,3,2,1');
  });
});

describe('Domain Transcript CSV Export Endpoint', () => {
  let testDomainId: string | undefined;
  let testDefinitionId: string | undefined;
  let testRunId: string | undefined;
  let testScenarioId: string | undefined;

  beforeEach(async () => {
    const domain = await db.domain.create({
      data: { name: 'Test Domain For CSV', normalizedName: 'test_domain_for_csv_' + Date.now() },
    });
    testDomainId = domain.id;

    const definition = await db.definition.create({
      data: { name: 'Domain CSV Def ' + Date.now(), content: {}, domainId: testDomainId },
    });
    testDefinitionId = definition.id;

    const scenario = await db.scenario.create({
      data: {
        definitionId: testDefinitionId,
        name: 'Domain CSV Scenario',
        content: { dimensions: { Stakes: 3, Certainty: 1 } },
      },
    });
    testScenarioId = scenario.id;

    const run = await db.run.create({
      data: {
        definitionId: testDefinitionId,
        status: 'COMPLETED',
        config: { temperature: 0 },
        progress: { total: 2, completed: 2, failed: 0 },
      },
    });
    testRunId = run.id;

    await db.transcript.createMany({
      data: [
        {
          runId: testRunId,
          scenarioId: testScenarioId,
          modelId: 'anthropic:claude-3-5-sonnet-20241022',
          sampleIndex: 0,
          content: {},
          turnCount: 2,
          tokenCount: 100,
          durationMs: 1000,
          decisionCode: '1',
        },
        {
          runId: testRunId,
          scenarioId: testScenarioId,
          modelId: 'openai:gpt-4o-20241120',
          sampleIndex: 0,
          content: {},
          turnCount: 2,
          tokenCount: 100,
          durationMs: 1000,
          decisionCode: '3',
        },
        // This transcript has decisionCode '0' — should be excluded
        {
          runId: testRunId,
          scenarioId: testScenarioId,
          modelId: 'openai:gpt-4o-20241120',
          sampleIndex: 1,
          content: {},
          turnCount: 1,
          tokenCount: 50,
          durationMs: 500,
          decisionCode: '0',
        },
      ],
    });
  });

  afterEach(async () => {
    if (testRunId) {
      await db.transcript.deleteMany({ where: { runId: testRunId } });
      await db.run.deleteMany({ where: { id: testRunId } });
    }
    if (testDefinitionId) {
      await db.scenario.deleteMany({ where: { definitionId: testDefinitionId } });
      await db.definition.delete({ where: { id: testDefinitionId } });
    }
    if (testDomainId) {
      await db.domain.delete({ where: { id: testDomainId } });
    }
  });

  it('requires authentication', async () => {
    const response = await request(app).get(`/api/export/domains/${testDomainId}/transcripts.csv`);
    expect(response.status).toBe(401);
  });

  it('returns 404 for unknown domain', async () => {
    const response = await request(app)
      .get('/api/export/domains/non-existent-domain-id/transcripts.csv')
      .set('Authorization', getAuthHeader());
    expect(response.status).toBe(404);
  });

  it('returns CSV with correct content-type and attachment header', async () => {
    const response = await request(app)
      .get(`/api/export/domains/${testDomainId}/transcripts.csv`)
      .set('Authorization', getAuthHeader());

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.headers['content-disposition']).toMatch(/attachment/);
    expect(response.headers['content-disposition']).toMatch(/\.csv/);
  });

  it('includes BOM and correct CSV header', async () => {
    const response = await request(app)
      .get(`/api/export/domains/${testDomainId}/transcripts.csv`)
      .set('Authorization', getAuthHeader());

    expect(response.status).toBe(200);
    expect(response.text.charCodeAt(0)).toBe(0xfeff);
    const headerLine = response.text.split('\n')[0]?.replace('\uFEFF', '');
    expect(headerLine).toContain('AI Model Name');
    expect(headerLine).toContain('Decision Code');
  });

  it('excludes transcripts with decisionCode outside 1-5', async () => {
    const response = await request(app)
      .get(`/api/export/domains/${testDomainId}/transcripts.csv`)
      .set('Authorization', getAuthHeader());

    expect(response.status).toBe(200);
    const lines = response.text.split('\n').filter((l) => l.trim());
    // header + 2 rows (codes 1 and 3); code 0 excluded
    expect(lines.length).toBe(3);
  });

  it('returns header-only CSV when domain has no runs', async () => {
    // Create a domain with a definition but no runs
    const emptyDomain = await db.domain.create({
      data: { name: 'Empty Domain ' + Date.now(), normalizedName: 'empty_domain_' + Date.now() },
    });
    const emptyDef = await db.definition.create({
      data: { name: 'Empty Def ' + Date.now(), content: {}, domainId: emptyDomain.id },
    });

    try {
      const response = await request(app)
        .get(`/api/export/domains/${emptyDomain.id}/transcripts.csv`)
        .set('Authorization', getAuthHeader());

      expect(response.status).toBe(200);
      const lines = response.text.split('\n').filter((l) => l.trim());
      expect(lines.length).toBe(1); // header only
    } finally {
      await db.definition.delete({ where: { id: emptyDef.id } });
      await db.domain.delete({ where: { id: emptyDomain.id } });
    }
  });

  it('filename omits signature segment when no signature resolves', async () => {
    // Create a domain/definition with no runs so signature cannot resolve
    const noRunDomain = await db.domain.create({
      data: { name: 'No Run Domain ' + Date.now(), normalizedName: 'no_run_domain_' + Date.now() },
    });
    await db.definition.create({
      data: { name: 'No Run Def ' + Date.now(), content: {}, domainId: noRunDomain.id },
    });

    try {
      const response = await request(app)
        .get(`/api/export/domains/${noRunDomain.id}/transcripts.csv`)
        .set('Authorization', getAuthHeader());

      expect(response.status).toBe(200);
      const cd = response.headers['content-disposition'] as string;
      // Should not contain '--' artifact from empty signature
      expect(cd).not.toContain('--');
    } finally {
      await db.definition.deleteMany({ where: { domainId: noRunDomain.id } });
      await db.domain.delete({ where: { id: noRunDomain.id } });
    }
  });
});
