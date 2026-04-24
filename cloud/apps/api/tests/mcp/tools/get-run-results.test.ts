import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    probeResult: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    transcript: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { db } from '@valuerank/db';

describe('get_run_results tool', () => {
  let toolHandler: (
    args: Record<string, unknown>,
    extra: Record<string, unknown>
  ) => Promise<unknown>;

  function buildDecisionTranscript() {
    return {
      decisionMetadata: {
        manualOverride: {
          appliedDecision: {
            favoredValueKey: 'Achievement',
            opposedValueKey: 'Benevolence_Dependability',
            direction: 'favor_first',
            strength: 'strong',
          },
          previousValue: '4',
          overriddenAt: '2026-01-01T00:00:00.000Z',
          overriddenByUserId: 'test-user',
        },
      },
      definitionSnapshot: {
        dimensions: [
          { name: 'Achievement' },
          { name: 'Benevolence_Dependability' },
        ],
        methodology: {
          presentation_order: 'A_first',
        },
      },
    };
  }

  const mockServer = {
    registerTool: vi.fn((name, _config, handler) => {
      if (name === 'get_run_results') {
        toolHandler = handler;
      }
    }),
  } as unknown as McpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { registerGetRunResultsTool } = await import('../../../src/mcp/tools/get-run-results.js');
    registerGetRunResultsTool(mockServer);
  });

  it('registers tool with expected schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_run_results',
      expect.objectContaining({
        inputSchema: expect.objectContaining({
          run_id: expect.any(Object),
          status: expect.any(Object),
          model: expect.any(Object),
          limit: expect.any(Object),
          offset: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('returns paginated results for in-progress run', async () => {
    vi.mocked(db.run.findFirst).mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      progress: { total: 10, completed: 3, failed: 1 },
    } as never);
    vi.mocked(db.run.findUnique).mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      progress: { total: 10, completed: 3, failed: 1 },
    } as never);
    vi.mocked(db.probeResult.groupBy).mockResolvedValue([
      { status: 'SUCCESS', _count: { _all: 3 } },
      { status: 'FAILED', _count: { _all: 1 } },
    ] as never);
    vi.mocked(db.transcript.count).mockResolvedValue(0);
    vi.mocked(db.probeResult.count).mockResolvedValue(2);
    vi.mocked(db.probeResult.findMany).mockResolvedValue([
      {
        scenarioId: 'scenario-1',
        modelId: 'gpt-4',
        sampleIndex: 0,
        status: 'SUCCESS',
        transcriptId: 'tx-1',
        errorCode: null,
        errorMessage: null,
        completedAt: new Date('2026-01-01T00:00:00Z'),
        scenario: { name: 'Scenario 1' },
      },
      {
        scenarioId: 'scenario-2',
        modelId: 'gpt-4',
        sampleIndex: 0,
        status: 'FAILED',
        transcriptId: null,
        errorCode: 'PROBE_FAILED',
        errorMessage: 'timeout',
        completedAt: new Date('2026-01-01T00:01:00Z'),
        scenario: { name: 'Scenario 2' },
      },
    ] as never);
    vi.mocked(db.transcript.findMany).mockResolvedValue([
      {
        id: 'tx-1',
        decisionText: 'Chose option four',
        ...buildDecisionTranscript(),
      },
    ] as never);

    const result = await toolHandler(
      { run_id: 'run-1', limit: 100, offset: 0 },
      { requestId: 'req-1' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.runStatus).toBe('RUNNING');
    expect(response.data.progress.pending).toBe(6);
    expect(response.data.pagination.totalAvailable).toBe(2);
    expect(response.data.results).toHaveLength(2);
    expect(response.data.results[0].decision).toEqual({
      direction: 'favor_first',
      strength: 'strong',
      favoredValueKey: 'Achievement',
    });
    expect(response.data.results[1].errorCode).toBe('PROBE_FAILED');
  });

  it('clamps percentComplete to 100 on inconsistent progress', async () => {
    vi.mocked(db.run.findFirst).mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      progress: { total: 10, completed: 9, failed: 5 },
    } as never);
    vi.mocked(db.run.findUnique).mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      progress: { total: 10, completed: 9, failed: 5 },
    } as never);
    vi.mocked(db.probeResult.groupBy).mockResolvedValue([
      { status: 'SUCCESS', _count: { _all: 9 } },
      { status: 'FAILED', _count: { _all: 5 } },
    ] as never);
    vi.mocked(db.transcript.count).mockResolvedValue(0);
    vi.mocked(db.probeResult.count).mockResolvedValue(0);
    vi.mocked(db.probeResult.findMany).mockResolvedValue([]);
    vi.mocked(db.transcript.findMany).mockResolvedValue([]);

    const result = await toolHandler(
      { run_id: 'run-1', limit: 100, offset: 0 },
      { requestId: 'req-clamp' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.data.progress.percentComplete).toBe(100);
  });

  it('truncates long decisionText in row payloads', async () => {
    const longText = 'x'.repeat(700);

    vi.mocked(db.run.findFirst).mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      progress: { total: 1, completed: 1, failed: 0 },
    } as never);
    vi.mocked(db.run.findUnique).mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      progress: { total: 1, completed: 1, failed: 0 },
    } as never);
    vi.mocked(db.probeResult.groupBy).mockResolvedValue([
      { status: 'SUCCESS', _count: { _all: 1 } },
    ] as never);
    vi.mocked(db.transcript.count).mockResolvedValue(0);
    vi.mocked(db.probeResult.count).mockResolvedValue(1);
    vi.mocked(db.probeResult.findMany).mockResolvedValue([
      {
        scenarioId: 'scenario-1',
        modelId: 'gpt-4',
        sampleIndex: 0,
        status: 'SUCCESS',
        transcriptId: 'tx-1',
        errorCode: null,
        errorMessage: null,
        completedAt: new Date('2026-01-01T00:00:00Z'),
        scenario: { name: 'Scenario 1' },
      },
    ] as never);
    vi.mocked(db.transcript.findMany).mockResolvedValue([
      {
        id: 'tx-1',
        decisionText: longText,
        ...buildDecisionTranscript(),
      },
    ] as never);

    const result = await toolHandler(
      { run_id: 'run-1', limit: 100, offset: 0 },
      { requestId: 'req-truncate' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.data.results[0].decisionText.length).toBe(503);
    expect(response.data.results[0].decisionText.endsWith('...')).toBe(true);
  });

  it('applies status/model filters', async () => {
    vi.mocked(db.run.findFirst).mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      progress: null,
    } as never);
    vi.mocked(db.run.findUnique).mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      progress: null,
    } as never);
    vi.mocked(db.probeResult.groupBy).mockResolvedValue([] as never);
    vi.mocked(db.transcript.count).mockResolvedValue(0);
    vi.mocked(db.probeResult.count).mockResolvedValue(0);
    vi.mocked(db.probeResult.findMany).mockResolvedValue([]);
    vi.mocked(db.transcript.findMany).mockResolvedValue([]);

    await toolHandler(
      { run_id: 'run-1', status: 'failed', model: 'gpt-4' },
      { requestId: 'req-2' }
    );

    expect(db.probeResult.count).toHaveBeenCalledWith({
      where: {
        runId: 'run-1',
        deletedAt: null,
        modelId: 'gpt-4',
        status: 'FAILED',
      },
    });
  });

  it('returns NOT_FOUND for unknown run', async () => {
    vi.mocked(db.run.findFirst).mockResolvedValue(null);
    vi.mocked(db.run.findUnique).mockResolvedValue(null);

    const result = await toolHandler(
      { run_id: 'missing' },
      { requestId: 'req-3' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('NOT_FOUND');
  });

  it('returns empty result set when offset exceeds available rows', async () => {
    vi.mocked(db.run.findFirst).mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      progress: { total: 10, completed: 3, failed: 1 },
    } as never);
    vi.mocked(db.run.findUnique).mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
      progress: { total: 10, completed: 3, failed: 1 },
    } as never);
    vi.mocked(db.probeResult.count).mockResolvedValue(2);
    vi.mocked(db.probeResult.findMany).mockResolvedValue([]);
    vi.mocked(db.transcript.findMany).mockResolvedValue([]);

    const result = await toolHandler(
      { run_id: 'run-1', limit: 100, offset: 99 },
      { requestId: 'req-offset' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.data.pagination.totalAvailable).toBe(2);
    expect(response.data.pagination.returned).toBe(0);
    expect(response.data.results).toEqual([]);
  });
});
