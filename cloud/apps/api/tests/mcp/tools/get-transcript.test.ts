/**
 * get_transcript Tool Tests
 *
 * Tests the full transcript retrieval including provider metadata.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock db before importing the tool
vi.mock('@valuerank/db', () => ({
  db: {
    transcript: {
      findFirst: vi.fn(),
    },
  },
}));

// Import after mock
import { db } from '@valuerank/db';

describe('get_transcript tool', () => {
  const testRunId = 'test-run-123';
  const testScenarioId = 'test-scenario-456';
  const testModel = 'openai:gpt-4';

  // Mock server and capture the registered handler
  let toolHandler: (args: Record<string, unknown>, extra: Record<string, unknown>) => Promise<unknown>;
  const mockServer = {
    registerTool: vi.fn((name, config, handler) => {
      toolHandler = handler;
    }),
  } as unknown as McpServer;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Dynamically import to trigger registration
    const { registerGetTranscriptTool } = await import(
      '../../../src/mcp/tools/get-transcript.js'
    );
    registerGetTranscriptTool(mockServer);
  });

  it('registers the tool with correct name and schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_transcript',
      expect.objectContaining({
        description: expect.stringContaining('full transcript'),
        inputSchema: expect.objectContaining({
          run_id: expect.any(Object),
          scenario_id: expect.any(Object),
          model: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('returns full transcript with turns and provider metadata', async () => {
    const mockTranscript = {
      id: 'transcript-123',
      runId: testRunId,
      scenarioId: testScenarioId,
      modelId: testModel,
      modelVersion: 'gpt-4-0613',
      turnCount: 2,
      tokenCount: 500,
      durationMs: 1500,
      estimatedCost: 0.025,
      createdAt: new Date('2024-01-15T10:00:00Z'),
      content: {
        schemaVersion: 1,
        turns: [
          {
            turnNumber: 1,
            promptLabel: 'scenario',
            probePrompt: 'What would you do in this dilemma?',
            targetResponse: 'I would prioritize safety.',
            inputTokens: 100,
            outputTokens: 150,
            providerMetadata: {
              provider: 'openai',
              finishReason: 'stop',
              raw: {
                id: 'chatcmpl-123',
                model: 'gpt-4-0613',
                usage: { prompt_tokens: 100, completion_tokens: 150 },
              },
            },
          },
          {
            turnNumber: 2,
            promptLabel: 'followup',
            probePrompt: 'Why did you make that choice?',
            targetResponse: 'Because human life has inherent value.',
            inputTokens: 80,
            outputTokens: 170,
            providerMetadata: {
              provider: 'openai',
              finishReason: 'stop',
              raw: {
                id: 'chatcmpl-124',
                model: 'gpt-4-0613',
              },
            },
          },
        ],
        costSnapshot: {
          inputTokens: 180,
          outputTokens: 320,
          estimatedCost: 0.025,
          costInputPerMillion: 30,
          costOutputPerMillion: 60,
        },
      },
    };

    vi.mocked(db.transcript.findFirst).mockResolvedValue(mockTranscript);

    const result = await toolHandler(
      { run_id: testRunId, scenario_id: testScenarioId, model: testModel },
      { requestId: 'req-1' }
    );

    expect(result).toHaveProperty('content');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.status).toBe('found');
    expect(response.data.transcript.id).toBe('transcript-123');
    expect(response.data.transcript.turnCount).toBe(2);
    expect(response.data.transcript.turns).toHaveLength(2);

    // Check provider metadata is included
    const turn1 = response.data.transcript.turns[0];
    expect(turn1.providerMetadata).toBeDefined();
    expect(turn1.providerMetadata.provider).toBe('openai');
    expect(turn1.providerMetadata.finishReason).toBe('stop');
    expect(turn1.providerMetadata.raw).toHaveProperty('id', 'chatcmpl-123');

    // Check cost snapshot
    expect(response.data.transcript.costSnapshot).toBeDefined();
    expect(response.data.transcript.costSnapshot.estimatedCost).toBe(0.025);
  });

  it('returns not_found when transcript does not exist', async () => {
    vi.mocked(db.transcript.findFirst).mockResolvedValue(null);

    const result = await toolHandler(
      { run_id: testRunId, scenario_id: testScenarioId, model: testModel },
      { requestId: 'req-2' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.status).toBe('not_found');
    expect(response.data.transcript).toBeUndefined();
  });

  it('handles transcript without provider metadata', async () => {
    const mockTranscript = {
      id: 'transcript-456',
      runId: testRunId,
      scenarioId: testScenarioId,
      modelId: testModel,
      modelVersion: null,
      turnCount: 1,
      tokenCount: 200,
      durationMs: 800,
      estimatedCost: null,
      createdAt: new Date('2024-01-15T10:00:00Z'),
      content: {
        schemaVersion: 1,
        turns: [
          {
            turnNumber: 1,
            promptLabel: 'scenario',
            probePrompt: 'A simple question',
            targetResponse: 'A simple answer',
            // No providerMetadata
          },
        ],
        // No costSnapshot
      },
    };

    vi.mocked(db.transcript.findFirst).mockResolvedValue(mockTranscript);

    const result = await toolHandler(
      { run_id: testRunId, scenario_id: testScenarioId, model: testModel },
      { requestId: 'req-3' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.status).toBe('found');
    expect(response.data.transcript.turns[0].providerMetadata).toBeUndefined();
    expect(response.data.transcript.costSnapshot).toBeUndefined();
  });

  it('handles empty turns array', async () => {
    const mockTranscript = {
      id: 'transcript-789',
      runId: testRunId,
      scenarioId: testScenarioId,
      modelId: testModel,
      modelVersion: null,
      turnCount: 0,
      tokenCount: 0,
      durationMs: 0,
      estimatedCost: null,
      createdAt: new Date(),
      content: {
        schemaVersion: 1,
        turns: [],
      },
    };

    vi.mocked(db.transcript.findFirst).mockResolvedValue(mockTranscript);

    const result = await toolHandler(
      { run_id: testRunId, scenario_id: testScenarioId, model: testModel },
      { requestId: 'req-4' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.status).toBe('found');
    expect(response.data.transcript.turns).toEqual([]);
  });

  it('handles malformed content gracefully', async () => {
    const mockTranscript = {
      id: 'transcript-bad',
      runId: testRunId,
      scenarioId: testScenarioId,
      modelId: testModel,
      modelVersion: null,
      turnCount: 0,
      tokenCount: 0,
      durationMs: 0,
      estimatedCost: null,
      createdAt: new Date(),
      content: 'not an object', // Malformed
    };

    vi.mocked(db.transcript.findFirst).mockResolvedValue(mockTranscript);

    const result = await toolHandler(
      { run_id: testRunId, scenario_id: testScenarioId, model: testModel },
      { requestId: 'req-5' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.status).toBe('found');
    expect(response.data.transcript.turns).toEqual([]);
  });

  it('filters out soft-deleted transcripts', async () => {
    vi.mocked(db.transcript.findFirst).mockResolvedValue(null);

    await toolHandler(
      { run_id: testRunId, scenario_id: testScenarioId, model: testModel },
      { requestId: 'req-6' }
    );

    expect(db.transcript.findFirst).toHaveBeenCalledWith({
      where: {
        runId: testRunId,
        scenarioId: testScenarioId,
        modelId: testModel,
        deletedAt: null,
      },
    });
  });

  it('returns error on database failure', async () => {
    vi.mocked(db.transcript.findFirst).mockRejectedValue(new Error('DB connection failed'));

    const result = await toolHandler(
      { run_id: testRunId, scenario_id: testScenarioId, model: testModel },
      { requestId: 'req-7' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('INTERNAL_ERROR');
  });
});
