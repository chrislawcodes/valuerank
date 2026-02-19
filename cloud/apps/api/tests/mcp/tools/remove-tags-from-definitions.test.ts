/**
 * remove_tags_from_definitions Tool Tests
 *
 * Tests the remove_tags_from_definitions MCP tool handler.
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
      findMany: vi.fn(),
    },
    definitionTag: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// Mock MCP services
vi.mock('../../../src/services/mcp/index.js', () => ({
  logAuditEvent: vi.fn(),
}));

// Import after mocks
import { db } from '@valuerank/db';

describe('remove_tags_from_definitions tool', () => {
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

    const { registerRemoveTagsFromDefinitionsTool } = await import(
      '../../../src/mcp/tools/remove-tags-from-definitions.js'
    );
    registerRemoveTagsFromDefinitionsTool(mockServer);
  });

  it('registers the tool with correct name and schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'remove_tags_from_definitions',
      expect.objectContaining({
        description: expect.stringContaining('Bulk-remove tags'),
        inputSchema: expect.objectContaining({
          definition_ids: expect.any(Object),
          tag_names: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('removes tags from definitions successfully', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue(
      [{ id: 'def-1' }, { id: 'def-2' }] as never
    );
    vi.mocked(db.tag.findMany).mockResolvedValue(
      [{ id: 'tag-1', name: 'job' }] as never
    );
    vi.mocked(db.definitionTag.findMany).mockResolvedValue(
      [{ id: 'dt-1' }, { id: 'dt-2' }] as never
    );
    vi.mocked(db.definitionTag.updateMany).mockResolvedValue({ count: 2 } as never);

    const result = await toolHandler(
      { definition_ids: ['def-1', 'def-2'], tag_names: ['job'] },
      { requestId: 'req-1' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.definitions_processed).toBe(2);
    expect(response.associations_removed).toBe(2);

    // Verify soft-delete was used
    expect(db.definitionTag.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
  });

  it('handles tags that are not assigned (silently skips)', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue(
      [{ id: 'def-1' }] as never
    );
    vi.mocked(db.tag.findMany).mockResolvedValue(
      [{ id: 'tag-1', name: 'job' }] as never
    );
    // No existing associations
    vi.mocked(db.definitionTag.findMany).mockResolvedValue([] as never);

    const result = await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['job'] },
      { requestId: 'req-2' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.associations_removed).toBe(0);
    expect(response.associations_not_assigned).toBe(1);
    expect(db.definitionTag.updateMany).not.toHaveBeenCalled();
  });

  it('handles tags that do not exist in the system', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue(
      [{ id: 'def-1' }] as never
    );
    // No matching tags found
    vi.mocked(db.tag.findMany).mockResolvedValue([] as never);

    const result = await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['nonexistent'] },
      { requestId: 'req-3' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.tags_not_found).toEqual(['nonexistent']);
    expect(response.associations_removed).toBe(0);
  });

  it('normalizes tag names to lowercase', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue(
      [{ id: 'def-1' }] as never
    );
    vi.mocked(db.tag.findMany).mockResolvedValue(
      [{ id: 'tag-1', name: 'job' }] as never
    );
    vi.mocked(db.definitionTag.findMany).mockResolvedValue(
      [{ id: 'dt-1' }] as never
    );
    vi.mocked(db.definitionTag.updateMany).mockResolvedValue({ count: 1 } as never);

    const result = await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['JOB'] },
      { requestId: 'req-4' }
    );

    expect(result).not.toHaveProperty('isError');
    // The tag query should have used lowercase
    expect(db.tag.findMany).toHaveBeenCalledWith({
      where: { name: { in: ['job'] } },
    });
  });

  it('returns VALIDATION_ERROR for invalid tag names', async () => {
    const result = await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['invalid tag!'] },
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
      [{ id: 'def-1' }] as never
    );

    const result = await toolHandler(
      { definition_ids: ['def-1', 'def-missing'], tag_names: ['job'] },
      { requestId: 'req-6' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('NOT_FOUND');
    expect(response.details.missing_ids).toEqual(['def-missing']);
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
    expect(response.message).toBe('Failed to remove tags from definitions');
  });

  it('generates requestId when not provided', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue(
      [{ id: 'def-1' }] as never
    );
    vi.mocked(db.tag.findMany).mockResolvedValue([] as never);

    const result = await toolHandler(
      { definition_ids: ['def-1'], tag_names: ['job'] },
      {}
    );

    expect(result).not.toHaveProperty('isError');
  });
});
