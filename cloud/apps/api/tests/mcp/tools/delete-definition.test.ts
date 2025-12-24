/**
 * delete_definition Tool Tests
 *
 * Tests the delete_definition MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock db before importing the tool
vi.mock('@valuerank/db', () => ({
  softDeleteDefinition: vi.fn(),
  getDefinitionById: vi.fn(),
}));

// Mock MCP services
vi.mock('../../../src/services/mcp/index.js', () => ({
  logAuditEvent: vi.fn(),
  createDeleteAudit: vi.fn().mockReturnValue({ action: 'delete_definition' }),
}));

// Import after mocks
import { softDeleteDefinition, getDefinitionById } from '@valuerank/db';
import { NotFoundError, ValidationError } from '@valuerank/shared';

describe('delete_definition tool', () => {
  const testDefinitionId = 'cmtest123456789012345678';

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
    const { registerDeleteDefinitionTool } = await import(
      '../../../src/mcp/tools/delete-definition.js'
    );
    registerDeleteDefinitionTool(mockServer);
  });

  it('registers the tool with correct name and schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'delete_definition',
      expect.objectContaining({
        description: expect.stringContaining('Soft-delete'),
        inputSchema: expect.objectContaining({
          definition_id: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('successfully deletes a definition', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
    };

    vi.mocked(getDefinitionById).mockResolvedValue(mockDefinition as never);
    vi.mocked(softDeleteDefinition).mockResolvedValue({
      deletedAt: new Date('2024-01-15T10:00:00Z'),
      deletedCount: {
        scenarios: 10,
        runs: 2,
        transcripts: 50,
      },
    });

    const result = await toolHandler(
      { definition_id: testDefinitionId },
      { requestId: 'req-1' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.definition_id).toBe(testDefinitionId);
    expect(response.name).toBe('Test Definition');
    expect(response.deleted_count).toEqual({
      scenarios: 10,
      runs: 2,
      transcripts: 50,
    });
  });

  it('returns NOT_FOUND when definition does not exist', async () => {
    vi.mocked(getDefinitionById).mockRejectedValue(
      new NotFoundError('Definition', testDefinitionId)
    );

    const result = await toolHandler(
      { definition_id: testDefinitionId },
      { requestId: 'req-2' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('NOT_FOUND');
    expect(response.message).toContain(testDefinitionId);
  });

  it('returns HAS_RUNNING_RUNS when definition has running runs', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
    };

    vi.mocked(getDefinitionById).mockResolvedValue(mockDefinition as never);

    // Create error with context structure that matches what the tool expects
    // The tool checks err.context.runningRunCount directly
    const error = new ValidationError('Cannot delete with running runs', {});
    (error as unknown as { context: Record<string, unknown> }).context = { runningRunCount: 3 };
    vi.mocked(softDeleteDefinition).mockRejectedValue(error);

    const result = await toolHandler(
      { definition_id: testDefinitionId },
      { requestId: 'req-3' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('HAS_RUNNING_RUNS');
    expect(response.message).toContain('running runs');
    expect(response.details.runningRunCount).toBe(3);
  });

  it('returns ALREADY_DELETED when definition is already deleted', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
    };

    vi.mocked(getDefinitionById).mockResolvedValue(mockDefinition as never);
    vi.mocked(softDeleteDefinition).mockRejectedValue(
      new ValidationError('Definition already deleted', {})
    );

    const result = await toolHandler(
      { definition_id: testDefinitionId },
      { requestId: 'req-4' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('ALREADY_DELETED');
  });

  it('returns VALIDATION_ERROR for other validation errors', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
    };

    vi.mocked(getDefinitionById).mockResolvedValue(mockDefinition as never);
    vi.mocked(softDeleteDefinition).mockRejectedValue(
      new ValidationError('Some other validation issue', {})
    );

    const result = await toolHandler(
      { definition_id: testDefinitionId },
      { requestId: 'req-5' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('VALIDATION_ERROR');
  });

  it('returns NOT_FOUND when softDeleteDefinition throws NotFoundError', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
    };

    vi.mocked(getDefinitionById).mockResolvedValue(mockDefinition as never);
    vi.mocked(softDeleteDefinition).mockRejectedValue(
      new NotFoundError('Definition', testDefinitionId)
    );

    const result = await toolHandler(
      { definition_id: testDefinitionId },
      { requestId: 'req-6' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('NOT_FOUND');
  });

  it('returns INTERNAL_ERROR on database failure', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
    };

    vi.mocked(getDefinitionById).mockResolvedValue(mockDefinition as never);
    vi.mocked(softDeleteDefinition).mockRejectedValue(
      new Error('Database connection failed')
    );

    const result = await toolHandler(
      { definition_id: testDefinitionId },
      { requestId: 'req-7' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toContain('Database connection failed');
  });

  it('handles non-Error exception', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
    };

    vi.mocked(getDefinitionById).mockResolvedValue(mockDefinition as never);
    vi.mocked(softDeleteDefinition).mockRejectedValue('string error');

    const result = await toolHandler(
      { definition_id: testDefinitionId },
      { requestId: 'req-8' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toBe('Failed to delete definition');
  });

  it('generates requestId when not provided', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
    };

    vi.mocked(getDefinitionById).mockResolvedValue(mockDefinition as never);
    vi.mocked(softDeleteDefinition).mockResolvedValue({
      deletedAt: new Date('2024-01-15T10:00:00Z'),
      deletedCount: {
        scenarios: 5,
        runs: 1,
        transcripts: 25,
      },
    });

    const result = await toolHandler(
      { definition_id: testDefinitionId },
      {}
    );

    expect(result).not.toHaveProperty('isError');
  });

  it('propagates non-NotFoundError from getDefinitionById', async () => {
    vi.mocked(getDefinitionById).mockRejectedValue(
      new Error('Database timeout')
    );

    const result = await toolHandler(
      { definition_id: testDefinitionId },
      { requestId: 'req-9' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toContain('Database timeout');
  });

  it('includes deleted_at timestamp in response', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
    };

    vi.mocked(getDefinitionById).mockResolvedValue(mockDefinition as never);
    vi.mocked(softDeleteDefinition).mockResolvedValue({
      deletedAt: new Date('2024-01-15T10:00:00Z'),
      deletedCount: {
        scenarios: 0,
        runs: 0,
        transcripts: 0,
      },
    });

    const result = await toolHandler(
      { definition_id: testDefinitionId },
      { requestId: 'req-10' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.deleted_at).toBeDefined();
    // Should be a valid ISO date string
    expect(new Date(response.deleted_at).toISOString()).toBe(response.deleted_at);
  });
});
