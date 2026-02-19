/**
 * add_tags_to_definitions Tool Tests
 *
 * Tests the add_tags_to_definitions MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock db before importing the tool
vi.mock('@valuerank/db', () => ({
  db: {
    definition: {
      findMany: vi.fn(),
    },
    tag: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    definitionTag: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock MCP services
vi.mock('../../../src/services/mcp/index.js', () => ({
  logAuditEvent: vi.fn(),
}));

// Import after mocks
import { db } from '@valuerank/db';

describe('add_tags_to_definitions tool', () => {
  const defIds = ['def-1', 'def-2', 'def-3'];

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

    const { registerAddTagsToDefinitionsTool } = await import(
      '../../../src/mcp/tools/add-tags-to-definitions.js'
    );
    registerAddTagsToDefinitionsTool(mockServer);
  });

  it('registers the tool with correct name and schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'add_tags_to_definitions',
      expect.objectContaining({
        description: expect.stringContaining('Bulk-add tags'),
        inputSchema: expect.objectContaining({
          definition_ids: expect.any(Object),
          tag_names: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('adds new tags to definitions successfully', async () => {
    // All definitions exist
    vi.mocked(db.definition.findMany).mockResolvedValue(
      defIds.map((id) => ({ id })) as never
    );

    // Tags don't exist yet - will be created
    vi.mocked(db.tag.findUnique).mockResolvedValue(null);
    vi.mocked(db.tag.create)
      .mockResolvedValueOnce({ id: 'tag-1', name: 'job', createdAt: new Date() } as never)
      .mockResolvedValueOnce({ id: 'tag-2', name: 'generated', createdAt: new Date() } as never);

    // No existing associations
    vi.mocked(db.definitionTag.findUnique).mockResolvedValue(null);
    vi.mocked(db.definitionTag.create).mockResolvedValue({} as never);

    const result = await toolHandler(
      { definition_ids: defIds, tag_names: ['job', 'generated'] },
      { requestId: 'req-1' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.definitions_processed).toBe(3);
    expect(response.tags_processed).toEqual(['job', 'generated']);
    expect(response.associations_added).toBe(6); // 3 defs * 2 tags
    expect(response.associations_skipped).toBe(0);
  });

  it('skips already-assigned tags', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue(
      [{ id: 'def-1' }] as never
    );
    vi.mocked(db.tag.findUnique).mockResolvedValue(
      { id: 'tag-1', name: 'job', createdAt: new Date() } as never
    );

    // Already assigned (not soft-deleted)
    vi.mocked(db.definitionTag.findUnique).mockResolvedValue({
      id: 'dt-1',
      definitionId: 'def-1',
      tagId: 'tag-1',
      deletedAt: null,
    } as never);

    const result = await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['job'] },
      { requestId: 'req-2' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.associations_added).toBe(0);
    expect(response.associations_skipped).toBe(1);
  });

  it('restores soft-deleted associations', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue(
      [{ id: 'def-1' }] as never
    );
    vi.mocked(db.tag.findUnique).mockResolvedValue(
      { id: 'tag-1', name: 'job', createdAt: new Date() } as never
    );

    // Exists but soft-deleted
    vi.mocked(db.definitionTag.findUnique).mockResolvedValue({
      id: 'dt-1',
      definitionId: 'def-1',
      tagId: 'tag-1',
      deletedAt: new Date(),
    } as never);
    vi.mocked(db.definitionTag.update).mockResolvedValue({} as never);

    const result = await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['job'] },
      { requestId: 'req-3' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.associations_added).toBe(1);
    expect(response.associations_skipped).toBe(0);
    expect(db.definitionTag.update).toHaveBeenCalledWith({
      where: { id: 'dt-1' },
      data: { deletedAt: null },
    });
  });

  it('normalizes tag names to lowercase', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue(
      [{ id: 'def-1' }] as never
    );
    vi.mocked(db.tag.findUnique).mockResolvedValue(
      { id: 'tag-1', name: 'job', createdAt: new Date() } as never
    );
    vi.mocked(db.definitionTag.findUnique).mockResolvedValue(null);
    vi.mocked(db.definitionTag.create).mockResolvedValue({} as never);

    const result = await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['JOB'] },
      { requestId: 'req-4' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.tags_processed).toEqual(['job']);
  });

  it('returns VALIDATION_ERROR for invalid tag names', async () => {
    const result = await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['invalid tag!', 'ok-tag'] },
      { requestId: 'req-5' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('VALIDATION_ERROR');
    expect(response.details.invalid_tags).toContain('invalid tag!');
  });

  it('returns NOT_FOUND when definitions are missing', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue(
      [{ id: 'def-1' }] as never // Only 1 of 3 found
    );

    const result = await toolHandler(
      { definition_ids: ['def-1', 'def-missing-1', 'def-missing-2'], tag_names: ['job'] },
      { requestId: 'req-6' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('NOT_FOUND');
    expect(response.details.missing_ids).toEqual(['def-missing-1', 'def-missing-2']);
  });

  it('returns INTERNAL_ERROR on database failure', async () => {
    vi.mocked(db.definition.findMany).mockRejectedValue(
      new Error('Database connection failed')
    );

    const result = await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['job'] },
      { requestId: 'req-7' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toContain('Database connection failed');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(db.definition.findMany).mockRejectedValue('string error');

    const result = await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['job'] },
      { requestId: 'req-8' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toBe('Failed to add tags to definitions');
  });

  it('generates requestId when not provided', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue(
      [{ id: 'def-1' }] as never
    );
    vi.mocked(db.tag.findUnique).mockResolvedValue(
      { id: 'tag-1', name: 'job', createdAt: new Date() } as never
    );
    vi.mocked(db.definitionTag.findUnique).mockResolvedValue(null);
    vi.mocked(db.definitionTag.create).mockResolvedValue({} as never);

    const result = await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['job'] },
      {}
    );

    expect(result).not.toHaveProperty('isError');
  });

  it('reuses existing tags instead of creating duplicates', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue(
      [{ id: 'def-1' }] as never
    );

    // Tag already exists
    vi.mocked(db.tag.findUnique).mockResolvedValue(
      { id: 'existing-tag', name: 'job', createdAt: new Date() } as never
    );
    vi.mocked(db.definitionTag.findUnique).mockResolvedValue(null);
    vi.mocked(db.definitionTag.create).mockResolvedValue({} as never);

    await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['job'] },
      { requestId: 'req-9' }
    );

    // Should NOT create the tag
    expect(db.tag.create).not.toHaveBeenCalled();
    // Should still create the association
    expect(db.definitionTag.create).toHaveBeenCalled();
  });
});
