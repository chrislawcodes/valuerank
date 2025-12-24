/**
 * fork_definition Tool Tests
 *
 * Tests the fork_definition MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock db before importing the tool
vi.mock('@valuerank/db', () => ({
  db: {
    definition: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
  createPartialContent: vi.fn((content) => ({ schema_version: 2, ...content })),
  createInheritingContent: vi.fn(() => ({ schema_version: 2 })),
}));

// Mock MCP services
vi.mock('../../../src/services/mcp/index.js', () => ({
  validateDefinitionContent: vi.fn(),
  logAuditEvent: vi.fn(),
  createDefinitionAudit: vi.fn().mockReturnValue({ action: 'fork_definition' }),
}));

// Mock scenario queue service
vi.mock('../../../src/services/scenario/index.js', () => ({
  queueScenarioExpansion: vi.fn(),
}));

// Import after mocks
import { db, createPartialContent, createInheritingContent } from '@valuerank/db';
import { validateDefinitionContent } from '../../../src/services/mcp/index.js';
import { queueScenarioExpansion } from '../../../src/services/scenario/index.js';

describe('fork_definition tool', () => {
  const testParentId = 'parent-123';

  const parentDefinition = {
    id: testParentId,
    name: 'Parent Definition',
    deletedAt: null,
    content: {
      preamble: 'Parent preamble',
      template: 'Parent template with [dimension]',
      dimensions: [
        { name: 'dimension', values: ['a', 'b'] },
      ],
      matching_rules: 'parent rules',
    },
  };

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

    // Set up default mock return values
    vi.mocked(validateDefinitionContent).mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
      estimatedScenarioCount: 4,
    });
    vi.mocked(queueScenarioExpansion).mockResolvedValue({
      queued: true,
      jobId: 'mock-job-id',
    });

    // Dynamically import to trigger registration
    const { registerForkDefinitionTool } = await import(
      '../../../src/mcp/tools/fork-definition.js'
    );
    registerForkDefinitionTool(mockServer);
  });

  it('registers the tool with correct name and schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'fork_definition',
      expect.objectContaining({
        description: expect.stringContaining('Fork an existing definition'),
        inputSchema: expect.objectContaining({
          parent_id: expect.any(Object),
          name: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('forks definition with no changes (full inheritance)', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(db.definition.create).mockResolvedValue({
      id: 'fork-123',
      name: 'Forked Definition',
    } as never);

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
      },
      { requestId: 'req-1' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.definition_id).toBe('fork-123');
    expect(response.parent_id).toBe(testParentId);
    expect(response.diff_summary).toEqual(['No changes - created exact copy']);
    expect(createInheritingContent).toHaveBeenCalled();
  });

  it('forks definition with preamble change', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(db.definition.create).mockResolvedValue({
      id: 'fork-preamble',
      name: 'Forked Definition',
    } as never);

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
        changes: {
          preamble: 'New preamble',
        },
      },
      { requestId: 'req-2' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.diff_summary).toContain('Preamble modified');
    expect(createPartialContent).toHaveBeenCalledWith(
      expect.objectContaining({
        preamble: 'New preamble',
      })
    );
  });

  it('forks definition with template change', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(db.definition.create).mockResolvedValue({
      id: 'fork-template',
      name: 'Forked Definition',
    } as never);

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
        changes: {
          template: 'New template',
        },
      },
      { requestId: 'req-3' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.diff_summary).toContain('Template modified');
  });

  it('forks definition with dimension change (same count)', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(db.definition.create).mockResolvedValue({
      id: 'fork-dims',
      name: 'Forked Definition',
    } as never);

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
        changes: {
          dimensions: [
            { name: 'new_dim', values: ['x', 'y'] },
          ],
        },
      },
      { requestId: 'req-4' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.diff_summary).toContain('Dimensions modified');
  });

  it('forks definition with dimension change (different count)', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(db.definition.create).mockResolvedValue({
      id: 'fork-dims-count',
      name: 'Forked Definition',
    } as never);

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
        changes: {
          dimensions: [
            { name: 'dim1', values: ['a', 'b'] },
            { name: 'dim2', values: ['c', 'd'] },
          ],
        },
      },
      { requestId: 'req-5' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.diff_summary).toContain('Dimensions changed: 1 → 2');
  });

  it('forks definition with matching_rules change', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(db.definition.create).mockResolvedValue({
      id: 'fork-rules',
      name: 'Forked Definition',
    } as never);

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
        changes: {
          matching_rules: 'new rules',
        },
      },
      { requestId: 'req-6' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.diff_summary).toContain('Matching rules modified');
  });

  it('includes version_label in response', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(db.definition.create).mockResolvedValue({
      id: 'fork-version',
      name: 'Forked Definition',
    } as never);

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
        version_label: 'v2-higher-stakes',
      },
      { requestId: 'req-7' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.version_label).toBe('v2-higher-stakes');
  });

  it('returns NOT_FOUND when parent does not exist', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(null);

    const result = await toolHandler(
      {
        parent_id: 'nonexistent-id',
        name: 'Forked Definition',
      },
      { requestId: 'req-8' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('NOT_FOUND');
    expect(response.message).toContain('nonexistent-id');
  });

  it('returns NOT_FOUND when parent is soft-deleted', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue({
      ...parentDefinition,
      deletedAt: new Date(),
    } as never);

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
      },
      { requestId: 'req-9' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('NOT_FOUND');
  });

  it('returns VALIDATION_ERROR when merged content is invalid', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(validateDefinitionContent).mockReturnValue({
      valid: false,
      errors: ['Template too long', 'Invalid dimension'],
      warnings: [],
      estimatedScenarioCount: 0,
    });

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
        changes: {
          template: 'A very long template...',
        },
      },
      { requestId: 'req-10' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('VALIDATION_ERROR');
    expect(response.message).toBe('Merged content is invalid');
    expect(response.details.errors).toEqual(['Template too long', 'Invalid dimension']);
  });

  it('returns INTERNAL_ERROR on database failure', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(db.definition.create).mockRejectedValue(
      new Error('Database connection failed')
    );

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
      },
      { requestId: 'req-11' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toContain('Database connection failed');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(db.definition.findUnique).mockRejectedValue('string error');

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
      },
      { requestId: 'req-12' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toBe('Failed to fork definition');
  });

  it('generates requestId when not provided', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(db.definition.create).mockResolvedValue({
      id: 'fork-no-req',
      name: 'Forked Definition',
    } as never);

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
      },
      {}
    );

    expect(result).not.toHaveProperty('isError');
  });

  it('queues scenario expansion after fork', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(db.definition.create).mockResolvedValue({
      id: 'fork-queue',
      name: 'Forked Definition',
    } as never);

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
      },
      { requestId: 'req-13' }
    );

    expect(queueScenarioExpansion).toHaveBeenCalledWith('fork-queue', 'fork');

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.scenario_expansion).toEqual({
      queued: true,
      job_id: 'mock-job-id',
    });
  });

  it('creates definition with parent_id link', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(db.definition.create).mockResolvedValue({
      id: 'fork-link',
      name: 'Forked Definition',
    } as never);

    await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
      },
      { requestId: 'req-14' }
    );

    expect(db.definition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentId: testParentId,
        }),
      })
    );
  });

  it('handles empty changes object as no changes', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(parentDefinition as never);
    vi.mocked(db.definition.create).mockResolvedValue({
      id: 'fork-empty-changes',
      name: 'Forked Definition',
    } as never);

    const result = await toolHandler(
      {
        parent_id: testParentId,
        name: 'Forked Definition',
        changes: {},
      },
      { requestId: 'req-15' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.diff_summary).toEqual(['No changes - created exact copy']);
    expect(createInheritingContent).toHaveBeenCalled();
  });
});
