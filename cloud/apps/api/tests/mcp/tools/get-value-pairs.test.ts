import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('@valuerank/db', () => ({
  db: {
    definition: {
      findMany: vi.fn(),
    },
  },
  loadDefinitionContent: vi.fn(),
  resolveDefinitionContent: vi.fn(),
}));

import { db, loadDefinitionContent, resolveDefinitionContent } from '@valuerank/db';

describe('get_definition_value_pairs tool', () => {
  let toolHandler: (
    args: Record<string, unknown>,
    extra: Record<string, unknown>
  ) => Promise<unknown>;

  const mockServer = {
    registerTool: vi.fn((name, _config, handler) => {
      if (name === 'get_definition_value_pairs') {
        toolHandler = handler;
      }
    }),
  } as unknown as McpServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { registerGetValuePairsTool } = await import(
      '../../../src/mcp/tools/get-value-pairs.js'
    );
    registerGetValuePairsTool(mockServer);
  });

  it('registers tool with expected schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'get_definition_value_pairs',
      expect.objectContaining({
        inputSchema: expect.objectContaining({
          folder: expect.any(Object),
          tag: expect.any(Object),
          definition_ids: expect.any(Object),
          limit: expect.any(Object),
          offset: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('returns value pairs for root definitions', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue([
      {
        id: 'def-1',
        name: 'Job Ethics 1',
        content: {
          schema_version: 1,
          template: 'test',
          dimensions: [
            { name: 'Achievement' },
            { name: 'Benevolence_Caring' },
          ],
        },
        parentId: null,
      },
      {
        id: 'def-2',
        name: 'Job Ethics 2',
        content: {
          schema_version: 1,
          template: 'test',
          dimensions: [
            { name: 'Power_Dominance' },
            { name: 'Universalism_Concern' },
          ],
        },
        parentId: null,
      },
    ] as never);

    vi.mocked(loadDefinitionContent).mockImplementation((raw) => raw as never);

    const result = await toolHandler(
      { folder: 'Job', limit: 100, offset: 0 },
      { requestId: 'req-1' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.count).toBe(2);
    expect(response.data.pairs[0]).toEqual({
      definitionId: 'def-1',
      name: 'Job Ethics 1',
      value_a: 'Achievement',
      value_b: 'Benevolence_Caring',
    });
    expect(response.data.pairs[1]).toEqual({
      definitionId: 'def-2',
      name: 'Job Ethics 2',
      value_a: 'Power_Dominance',
      value_b: 'Universalism_Concern',
    });
  });

  it('resolves forked definitions via inheritance chain', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue([
      {
        id: 'fork-1',
        name: 'Forked Vignette',
        content: { schema_version: 2 },
        parentId: 'parent-1',
      },
    ] as never);

    vi.mocked(resolveDefinitionContent).mockResolvedValue({
      resolvedContent: {
        schema_version: 2,
        template: 'test',
        dimensions: [
          { name: 'Tradition' },
          { name: 'Self_Direction_Thought' },
        ],
      },
    } as never);

    const result = await toolHandler(
      { limit: 100, offset: 0 },
      { requestId: 'req-fork' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.count).toBe(1);
    expect(response.data.pairs[0].value_a).toBe('Tradition');
    expect(response.data.pairs[0].value_b).toBe('Self_Direction_Thought');
    expect(resolveDefinitionContent).toHaveBeenCalledWith('fork-1');
  });

  it('skips definitions with fewer than 2 dimensions', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue([
      {
        id: 'def-single',
        name: 'Single Dimension',
        content: {
          schema_version: 1,
          template: 'test',
          dimensions: [{ name: 'Achievement' }],
        },
        parentId: null,
      },
    ] as never);

    vi.mocked(loadDefinitionContent).mockImplementation((raw) => raw as never);

    const result = await toolHandler(
      { limit: 100, offset: 0 },
      { requestId: 'req-skip' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.count).toBe(0);
    expect(response.data.skipped).toBe(1);
  });

  it('passes definition_ids filter to query', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue([]);

    await toolHandler(
      { definition_ids: ['id-a', 'id-b'], limit: 100, offset: 0 },
      { requestId: 'req-ids' }
    );

    expect(db.definition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['id-a', 'id-b'] },
          deletedAt: null,
        }),
      })
    );
  });

  it('returns empty result when no definitions match', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue([]);

    const result = await toolHandler(
      { folder: 'nonexistent', limit: 100, offset: 0 },
      { requestId: 'req-empty' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.count).toBe(0);
    expect(response.data.pairs).toEqual([]);
  });
});
