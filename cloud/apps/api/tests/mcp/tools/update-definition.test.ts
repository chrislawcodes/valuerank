/**
 * update_definition Tool Tests
 *
 * Tests the update_definition MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock db before importing the tool
vi.mock('@valuerank/db', () => ({
  db: {
    definition: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    preambleVersion: {
      findUnique: vi.fn(),
    },
  },
  Prisma: {},
}));

// Mock MCP services
vi.mock('../../../src/services/mcp/index.js', () => ({
  logAuditEvent: vi.fn(),
}));

// Import after mocks
import { db } from '@valuerank/db';

describe('update_definition tool', () => {
  const testDefinitionId = 'cmtest-def-update-001';

  const existingDefinition = {
    id: testDefinitionId,
    name: 'Original Name',
    version: 1,
    preambleVersionId: null,
    deletedAt: null,
    content: {},
  };

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

    const { registerUpdateDefinitionTool } = await import(
      '../../../src/mcp/tools/update-definition.js'
    );
    registerUpdateDefinitionTool(mockServer);
  });

  it('registers the tool with correct name and schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'update_definition',
      expect.objectContaining({
        description: expect.stringContaining('Update a definition'),
        inputSchema: expect.objectContaining({
          definition_id: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('updates definition name without incrementing version', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(existingDefinition as never);
    vi.mocked(db.definition.update).mockResolvedValue({
      ...existingDefinition,
      name: 'New Name',
      preambleVersion: null,
    } as never);

    const result = await toolHandler(
      { definition_id: testDefinitionId, name: 'New Name' },
      { requestId: 'req-1' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.name).toBe('New Name');
    expect(response.version.before).toBe(1);
    expect(response.version.after).toBe(1);
    expect(response.version.incremented).toBe(false);
  });

  it('updates preamble version and increments version', async () => {
    const preambleVersionId = 'preamble-v1';
    vi.mocked(db.definition.findUnique).mockResolvedValue(existingDefinition as never);
    vi.mocked(db.preambleVersion.findUnique).mockResolvedValue({
      id: preambleVersionId,
      preambleId: 'preamble-1',
      version: 'v1',
      content: 'test preamble',
      createdAt: new Date(),
    } as never);
    vi.mocked(db.definition.update).mockResolvedValue({
      ...existingDefinition,
      version: 2,
      preambleVersionId,
      preambleVersion: {
        id: preambleVersionId,
        version: 'v1',
        preamble: { name: 'No Reframe' },
      },
    } as never);

    const result = await toolHandler(
      { definition_id: testDefinitionId, preamble_version_id: preambleVersionId },
      { requestId: 'req-2' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.version.before).toBe(1);
    expect(response.version.after).toBe(2);
    expect(response.version.incremented).toBe(true);
    expect(response.preamble.version_id).toBe(preambleVersionId);
    expect(response.preamble.preamble_name).toBe('No Reframe');
  });

  it('clears preamble with null and increments version', async () => {
    const defWithPreamble = {
      ...existingDefinition,
      preambleVersionId: 'old-preamble',
    };
    vi.mocked(db.definition.findUnique).mockResolvedValue(defWithPreamble as never);
    vi.mocked(db.definition.update).mockResolvedValue({
      ...defWithPreamble,
      version: 2,
      preambleVersionId: null,
      preambleVersion: null,
    } as never);

    const result = await toolHandler(
      { definition_id: testDefinitionId, preamble_version_id: null },
      { requestId: 'req-3' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.version.incremented).toBe(true);
    expect(response.preamble.version_id).toBeNull();
  });

  it('does not increment version when preamble is already the same', async () => {
    const defWithPreamble = {
      ...existingDefinition,
      preambleVersionId: 'same-preamble',
    };
    vi.mocked(db.definition.findUnique).mockResolvedValue(defWithPreamble as never);
    vi.mocked(db.preambleVersion.findUnique).mockResolvedValue({
      id: 'same-preamble',
      preambleId: 'p1',
      version: 'v1',
      content: 'test',
      createdAt: new Date(),
    } as never);
    vi.mocked(db.definition.update).mockResolvedValue({
      ...defWithPreamble,
      preambleVersion: {
        id: 'same-preamble',
        version: 'v1',
        preamble: { name: 'Test' },
      },
    } as never);

    const result = await toolHandler(
      { definition_id: testDefinitionId, preamble_version_id: 'same-preamble' },
      { requestId: 'req-4' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.version.incremented).toBe(false);
  });

  it('returns NOT_FOUND when definition does not exist', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(null);

    const result = await toolHandler(
      { definition_id: 'nonexistent', name: 'New Name' },
      { requestId: 'req-5' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('NOT_FOUND');
    expect(response.message).toContain('nonexistent');
  });

  it('returns NOT_FOUND when definition is soft-deleted', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue({
      ...existingDefinition,
      deletedAt: new Date(),
    } as never);

    const result = await toolHandler(
      { definition_id: testDefinitionId, name: 'New Name' },
      { requestId: 'req-6' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND when preamble version does not exist', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(existingDefinition as never);
    vi.mocked(db.preambleVersion.findUnique).mockResolvedValue(null);

    const result = await toolHandler(
      { definition_id: testDefinitionId, preamble_version_id: 'bad-id' },
      { requestId: 'req-7' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('NOT_FOUND');
    expect(response.message).toContain('Preamble version not found');
  });

  it('returns VALIDATION_ERROR when no fields provided', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(existingDefinition as never);

    const result = await toolHandler(
      { definition_id: testDefinitionId },
      { requestId: 'req-8' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('VALIDATION_ERROR');
    expect(response.message).toContain('At least one');
  });

  it('returns INTERNAL_ERROR on database failure', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(existingDefinition as never);
    vi.mocked(db.definition.update).mockRejectedValue(new Error('DB connection lost'));

    const result = await toolHandler(
      { definition_id: testDefinitionId, name: 'New Name' },
      { requestId: 'req-9' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toContain('DB connection lost');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(existingDefinition as never);
    vi.mocked(db.definition.update).mockRejectedValue('string error');

    const result = await toolHandler(
      { definition_id: testDefinitionId, name: 'New Name' },
      { requestId: 'req-10' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toBe('Failed to update definition');
  });

  it('generates requestId when not provided', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(existingDefinition as never);
    vi.mocked(db.definition.update).mockResolvedValue({
      ...existingDefinition,
      name: 'New Name',
      preambleVersion: null,
    } as never);

    const result = await toolHandler(
      { definition_id: testDefinitionId, name: 'New Name' },
      {}
    );

    expect(result).not.toHaveProperty('isError');
  });

  it('updates both name and preamble simultaneously', async () => {
    const preambleVersionId = 'preamble-v1';
    vi.mocked(db.definition.findUnique).mockResolvedValue(existingDefinition as never);
    vi.mocked(db.preambleVersion.findUnique).mockResolvedValue({
      id: preambleVersionId,
      preambleId: 'p1',
      version: 'v1',
      content: 'test',
      createdAt: new Date(),
    } as never);
    vi.mocked(db.definition.update).mockResolvedValue({
      ...existingDefinition,
      name: 'Updated Name',
      version: 2,
      preambleVersionId,
      preambleVersion: {
        id: preambleVersionId,
        version: 'v1',
        preamble: { name: 'Test Preamble' },
      },
    } as never);

    const result = await toolHandler(
      {
        definition_id: testDefinitionId,
        name: 'Updated Name',
        preamble_version_id: preambleVersionId,
      },
      { requestId: 'req-11' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.name).toBe('Updated Name');
    expect(response.version.incremented).toBe(true);
    expect(response.changes).toHaveLength(2);
  });
});
