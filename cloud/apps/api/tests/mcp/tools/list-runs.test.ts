/**
 * list_runs Tool Tests
 *
 * Tests the list_runs MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock db before importing the tool
vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findMany: vi.fn(),
    },
  },
}));

// Mock MCP services
vi.mock('../../../src/services/mcp/index.js', () => ({
  buildMcpResponse: vi.fn((opts) => ({
    data: opts.data,
    metadata: {
      truncated: false,
      executionMs: 10,
    },
  })),
  truncateArray: vi.fn((arr, limit) => arr.slice(0, limit)),
  formatRunListItem: vi.fn((run) => ({
    id: run.id,
    status: run.status.toLowerCase(),
    models: run.config?.models || [],
    samplePercentage: run.config?.samplePercentage || null,
    scenarioCount: run._count?.transcripts || 0,
    createdAt: run.createdAt?.toISOString() || new Date().toISOString(),
  })),
}));

// Import after mock
import { db } from '@valuerank/db';

describe('list_runs tool', () => {
  // Mock server and capture the registered handler
  let toolHandler: (
    args: Record<string, unknown>,
    extra: Record<string, unknown>
  ) => Promise<unknown>;
  const mockServer = {
    registerTool: vi.fn((name, config, handler) => {
      toolHandler = handler;
    }),
  } as unknown as McpServer;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Dynamically import to trigger registration
    const { registerListRunsTool } = await import(
      '../../../src/mcp/tools/list-runs.js'
    );
    registerListRunsTool(mockServer);
  });

  it('registers the tool with correct name and schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'list_runs',
      expect.objectContaining({
        description: expect.stringContaining('List evaluation runs'),
        inputSchema: expect.objectContaining({
          definition_id: expect.any(Object),
          status: expect.any(Object),
          limit: expect.any(Object),
          offset: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('returns list of runs without filters', async () => {
    const mockRuns = [
      {
        id: 'run-1',
        status: 'COMPLETED',
        config: { models: ['openai:gpt-4'], samplePercentage: 100 },
        createdAt: new Date('2024-01-15T10:00:00Z'),
        _count: { transcripts: 10 },
      },
      {
        id: 'run-2',
        status: 'RUNNING',
        config: { models: ['anthropic:claude-3'], samplePercentage: 50 },
        createdAt: new Date('2024-01-14T10:00:00Z'),
        _count: { transcripts: 5 },
      },
    ];

    vi.mocked(db.run.findMany).mockResolvedValue(mockRuns as never);

    const result = await toolHandler({}, { requestId: 'req-1' });

    expect(db.run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        skip: 0,
      })
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.data).toHaveLength(2);
  });

  it('filters by definition_id', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([]);

    await toolHandler(
      { definition_id: 'def-123' },
      { requestId: 'req-2' }
    );

    expect(db.run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          definitionId: 'def-123',
        },
      })
    );
  });

  it('filters by status', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([]);

    await toolHandler({ status: 'completed' }, { requestId: 'req-3' });

    expect(db.run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: 'COMPLETED',
        },
      })
    );
  });

  it('filters by status running', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([]);

    await toolHandler({ status: 'running' }, { requestId: 'req-4' });

    expect(db.run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: 'RUNNING',
        },
      })
    );
  });

  it('filters by status pending', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([]);

    await toolHandler({ status: 'pending' }, { requestId: 'req-5' });

    expect(db.run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: 'PENDING',
        },
      })
    );
  });

  it('filters by status failed', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([]);

    await toolHandler({ status: 'failed' }, { requestId: 'req-6' });

    expect(db.run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: 'FAILED',
        },
      })
    );
  });

  it('applies custom limit', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([]);

    await toolHandler({ limit: 50 }, { requestId: 'req-7' });

    expect(db.run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
      })
    );
  });

  it('applies custom offset', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([]);

    await toolHandler({ offset: 20 }, { requestId: 'req-8' });

    expect(db.run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
      })
    );
  });

  it('combines multiple filters', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([]);

    await toolHandler(
      {
        definition_id: 'def-123',
        status: 'completed',
        limit: 10,
        offset: 5,
      },
      { requestId: 'req-9' }
    );

    expect(db.run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          definitionId: 'def-123',
          status: 'COMPLETED',
        },
        take: 10,
        skip: 5,
      })
    );
  });

  it('returns error on database failure', async () => {
    vi.mocked(db.run.findMany).mockRejectedValue(new Error('DB connection failed'));

    const result = await toolHandler({}, { requestId: 'req-10' });

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('INTERNAL_ERROR');
  });

  it('uses default values when args are undefined', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([]);

    await toolHandler(
      { limit: undefined, offset: undefined },
      { requestId: 'req-11' }
    );

    expect(db.run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
        skip: 0,
      })
    );
  });

  it('handles empty result set', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([]);

    const result = await toolHandler({}, { requestId: 'req-12' });

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.data).toHaveLength(0);
  });

  it('generates requestId when not provided', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([]);

    const result = await toolHandler({}, {});

    expect(result).not.toHaveProperty('isError');
  });
});
