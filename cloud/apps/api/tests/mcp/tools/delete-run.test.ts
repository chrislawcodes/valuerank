/**
 * delete_run Tool Tests
 *
 * Tests the delete_run MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock db before importing the tool
vi.mock('@valuerank/db', () => ({
  db: {
    $executeRaw: vi.fn(),
  },
  softDeleteRun: vi.fn(),
  getRunById: vi.fn(),
}));

// Mock audit logging
vi.mock('../../../src/services/mcp/index.js', () => ({
  logAuditEvent: vi.fn(),
  createDeleteAudit: vi.fn().mockReturnValue({ action: 'delete_run' }),
}));

// Import after mock
import { db, softDeleteRun, getRunById } from '@valuerank/db';
import { NotFoundError, ValidationError } from '@valuerank/shared';

describe('delete_run tool', () => {
  const testRunId = 'cmtest123456789012345678';

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
    const { registerDeleteRunTool } = await import(
      '../../../src/mcp/tools/delete-run.js'
    );
    registerDeleteRunTool(mockServer);
  });

  it('registers the tool with correct name and schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'delete_run',
      expect.objectContaining({
        description: expect.stringContaining('Soft-delete'),
        inputSchema: expect.objectContaining({
          run_id: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('successfully deletes a completed run', async () => {
    const mockRun = {
      id: testRunId,
      definitionId: 'def-123',
      status: 'COMPLETED',
    };

    vi.mocked(getRunById).mockResolvedValue(mockRun as never);
    vi.mocked(softDeleteRun).mockResolvedValue({
      deletedAt: new Date('2024-01-15T10:00:00Z'),
      deletedCount: {
        transcripts: 5,
        analysisResults: 2,
      },
    });

    const result = await toolHandler({ run_id: testRunId }, { requestId: 'req-1' });

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.run_id).toBe(testRunId);
    expect(response.definition_id).toBe('def-123');
    expect(response.previous_status).toBe('COMPLETED');
    expect(response.deleted_count.runs).toBe(1);
    expect(response.deleted_count.transcripts).toBe(5);
    expect(response.deleted_count.analysis_results).toBe(2);
    expect(response.jobs_cancelled).toBe(0);
  });

  it('cancels jobs for running runs', async () => {
    const mockRun = {
      id: testRunId,
      definitionId: 'def-123',
      status: 'RUNNING',
    };

    vi.mocked(getRunById).mockResolvedValue(mockRun as never);
    vi.mocked(db.$executeRaw).mockResolvedValue(3); // 3 jobs cancelled
    vi.mocked(softDeleteRun).mockResolvedValue({
      deletedAt: new Date('2024-01-15T10:00:00Z'),
      deletedCount: {
        transcripts: 2,
        analysisResults: 0,
      },
    });

    const result = await toolHandler({ run_id: testRunId }, { requestId: 'req-2' });

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.previous_status).toBe('RUNNING');
    expect(response.jobs_cancelled).toBe(3);
    expect(db.$executeRaw).toHaveBeenCalled();
  });

  it('cancels jobs for pending runs', async () => {
    const mockRun = {
      id: testRunId,
      definitionId: 'def-123',
      status: 'PENDING',
    };

    vi.mocked(getRunById).mockResolvedValue(mockRun as never);
    vi.mocked(db.$executeRaw).mockResolvedValue(5);
    vi.mocked(softDeleteRun).mockResolvedValue({
      deletedAt: new Date('2024-01-15T10:00:00Z'),
      deletedCount: {
        transcripts: 0,
        analysisResults: 0,
      },
    });

    const result = await toolHandler({ run_id: testRunId }, { requestId: 'req-3' });

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.previous_status).toBe('PENDING');
    expect(response.jobs_cancelled).toBe(5);
  });

  it('returns NOT_FOUND when run does not exist', async () => {
    vi.mocked(getRunById).mockRejectedValue(
      new NotFoundError('Run', testRunId)
    );

    const result = await toolHandler({ run_id: testRunId }, { requestId: 'req-4' });

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('NOT_FOUND');
    expect(response.message).toContain('not found');
  });

  it('returns ALREADY_DELETED when run is already deleted', async () => {
    const mockRun = {
      id: testRunId,
      definitionId: 'def-123',
      status: 'COMPLETED',
    };

    vi.mocked(getRunById).mockResolvedValue(mockRun as never);
    vi.mocked(softDeleteRun).mockRejectedValue(
      new ValidationError('already deleted', {})
    );

    const result = await toolHandler({ run_id: testRunId }, { requestId: 'req-5' });

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('ALREADY_DELETED');
  });

  it('returns VALIDATION_ERROR for other validation errors', async () => {
    const mockRun = {
      id: testRunId,
      definitionId: 'def-123',
      status: 'COMPLETED',
    };

    vi.mocked(getRunById).mockResolvedValue(mockRun as never);
    vi.mocked(softDeleteRun).mockRejectedValue(
      new ValidationError('some other validation error', {})
    );

    const result = await toolHandler({ run_id: testRunId }, { requestId: 'req-6' });

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('VALIDATION_ERROR');
  });

  it('returns INTERNAL_ERROR on database failure', async () => {
    const mockRun = {
      id: testRunId,
      definitionId: 'def-123',
      status: 'COMPLETED',
    };

    vi.mocked(getRunById).mockResolvedValue(mockRun as never);
    vi.mocked(softDeleteRun).mockRejectedValue(new Error('Database connection failed'));

    const result = await toolHandler({ run_id: testRunId }, { requestId: 'req-7' });

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toContain('Database connection failed');
  });

  it('returns NOT_FOUND when softDeleteRun throws NotFoundError', async () => {
    const mockRun = {
      id: testRunId,
      definitionId: 'def-123',
      status: 'COMPLETED',
    };

    vi.mocked(getRunById).mockResolvedValue(mockRun as never);
    vi.mocked(softDeleteRun).mockRejectedValue(
      new NotFoundError('Run', testRunId)
    );

    const result = await toolHandler({ run_id: testRunId }, { requestId: 'req-8' });

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('NOT_FOUND');
  });

  it('handles job cancellation failure gracefully', async () => {
    const mockRun = {
      id: testRunId,
      definitionId: 'def-123',
      status: 'RUNNING',
    };

    vi.mocked(getRunById).mockResolvedValue(mockRun as never);
    vi.mocked(db.$executeRaw).mockRejectedValue(new Error('PgBoss table not found'));
    vi.mocked(softDeleteRun).mockResolvedValue({
      deletedAt: new Date('2024-01-15T10:00:00Z'),
      deletedCount: {
        transcripts: 2,
        analysisResults: 0,
      },
    });

    const result = await toolHandler({ run_id: testRunId }, { requestId: 'req-9' });

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    // Should still succeed, just with 0 jobs cancelled
    expect(response.success).toBe(true);
    expect(response.jobs_cancelled).toBe(0);
  });

  it('generates requestId when not provided', async () => {
    const mockRun = {
      id: testRunId,
      definitionId: 'def-123',
      status: 'COMPLETED',
    };

    vi.mocked(getRunById).mockResolvedValue(mockRun as never);
    vi.mocked(softDeleteRun).mockResolvedValue({
      deletedAt: new Date('2024-01-15T10:00:00Z'),
      deletedCount: {
        transcripts: 0,
        analysisResults: 0,
      },
    });

    const result = await toolHandler({ run_id: testRunId }, {});

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
  });

  it('handles non-Error objects in catch block', async () => {
    const mockRun = {
      id: testRunId,
      definitionId: 'def-123',
      status: 'COMPLETED',
    };

    vi.mocked(getRunById).mockResolvedValue(mockRun as never);
    vi.mocked(softDeleteRun).mockRejectedValue('string error');

    const result = await toolHandler({ run_id: testRunId }, { requestId: 'req-10' });

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toBe('Failed to delete run');
  });
});
