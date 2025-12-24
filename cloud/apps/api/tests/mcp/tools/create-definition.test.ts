/**
 * create_definition Tool Tests
 *
 * Tests the create_definition MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock db before importing the tool
vi.mock('@valuerank/db', () => ({
  db: {
    definition: {
      create: vi.fn(),
    },
  },
}));

// Mock MCP services
vi.mock('../../../src/services/mcp/index.js', () => ({
  validateDefinitionContent: vi.fn(),
  validateContentStructure: vi.fn(),
  logAuditEvent: vi.fn(),
  createDefinitionAudit: vi.fn().mockReturnValue({ action: 'create_definition' }),
}));

// Mock scenario queue service
vi.mock('../../../src/services/scenario/index.js', () => ({
  queueScenarioExpansion: vi.fn(),
}));

// Import after mocks
import { db } from '@valuerank/db';
import {
  validateDefinitionContent,
  validateContentStructure,
} from '../../../src/services/mcp/index.js';
import { queueScenarioExpansion } from '../../../src/services/scenario/index.js';

describe('create_definition tool', () => {
  const validContent = {
    preamble: 'I want your moral judgment. Say what you would do.',
    template: 'You face a situation involving [Self_Direction_Action]. Rate 1-5.',
    dimensions: [
      {
        name: 'Self_Direction_Action',
        levels: [
          { score: 1, label: 'minimal', options: ['trivial choice'] },
          { score: 2, label: 'minor', options: ['small decision'] },
          { score: 3, label: 'moderate', options: ['meaningful choice'] },
          { score: 4, label: 'significant', options: ['important decision'] },
          { score: 5, label: 'critical', options: ['life-defining choice'] },
        ],
      },
    ],
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
    vi.mocked(validateContentStructure).mockReturnValue({ valid: true });
    vi.mocked(validateDefinitionContent).mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
      estimatedScenarioCount: 5,
    });
    vi.mocked(queueScenarioExpansion).mockResolvedValue({
      queued: true,
      jobId: 'mock-job-id',
    });

    // Dynamically import to trigger registration
    const { registerCreateDefinitionTool } = await import(
      '../../../src/mcp/tools/create-definition.js'
    );
    registerCreateDefinitionTool(mockServer);
  });

  it('registers the tool with correct name and schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'create_definition',
      expect.objectContaining({
        description: expect.stringContaining('Create a new scenario definition'),
        inputSchema: expect.objectContaining({
          name: expect.any(Object),
          content: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('creates definition successfully with valid content', async () => {
    const mockDefinition = {
      id: 'def-123',
      name: 'Test Definition',
    };

    vi.mocked(db.definition.create).mockResolvedValue(mockDefinition as never);

    const result = await toolHandler(
      {
        name: 'Test Definition',
        content: validContent,
      },
      { requestId: 'req-1' }
    );

    expect(result).not.toHaveProperty('isError');
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.definition_id).toBe('def-123');
    expect(response.name).toBe('Test Definition');
    expect(response.estimated_scenario_count).toBe(5);
    expect(response.scenario_expansion).toEqual({
      queued: true,
      job_id: 'mock-job-id',
    });
  });

  it('includes validation warnings in response', async () => {
    vi.mocked(validateDefinitionContent).mockReturnValue({
      valid: true,
      errors: [],
      warnings: ['Consider adding more dimensions'],
      estimatedScenarioCount: 3,
    });

    const mockDefinition = {
      id: 'def-456',
      name: 'Test Definition',
    };

    vi.mocked(db.definition.create).mockResolvedValue(mockDefinition as never);

    const result = await toolHandler(
      {
        name: 'Test Definition',
        content: validContent,
      },
      { requestId: 'req-2' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.validation_warnings).toEqual(['Consider adding more dimensions']);
  });

  it('returns VALIDATION_ERROR when structure is invalid', async () => {
    vi.mocked(validateContentStructure).mockReturnValue({
      valid: false,
      error: 'Missing required field: preamble',
    });

    const result = await toolHandler(
      {
        name: 'Test Definition',
        content: { template: 'Test', dimensions: [] },
      },
      { requestId: 'req-3' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('VALIDATION_ERROR');
    expect(response.message).toContain('Missing required field');
  });

  it('returns VALIDATION_ERROR when content validation fails', async () => {
    vi.mocked(validateDefinitionContent).mockReturnValue({
      valid: false,
      errors: ['Template too long', 'Too many dimensions'],
      warnings: [],
      estimatedScenarioCount: 0,
    });

    const result = await toolHandler(
      {
        name: 'Test Definition',
        content: validContent,
      },
      { requestId: 'req-4' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('VALIDATION_ERROR');
    expect(response.message).toBe('Definition content is invalid');
    expect(response.details.errors).toEqual(['Template too long', 'Too many dimensions']);
  });

  it('returns INTERNAL_ERROR on database failure', async () => {
    vi.mocked(db.definition.create).mockRejectedValue(
      new Error('Database connection failed')
    );

    const result = await toolHandler(
      {
        name: 'Test Definition',
        content: validContent,
      },
      { requestId: 'req-5' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toContain('Database connection failed');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(db.definition.create).mockRejectedValue('string error');

    const result = await toolHandler(
      {
        name: 'Test Definition',
        content: validContent,
      },
      { requestId: 'req-6' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toBe('Failed to create definition');
  });

  it('generates requestId when not provided', async () => {
    const mockDefinition = {
      id: 'def-789',
      name: 'Test Definition',
    };

    vi.mocked(db.definition.create).mockResolvedValue(mockDefinition as never);

    const result = await toolHandler(
      {
        name: 'Test Definition',
        content: validContent,
      },
      {}
    );

    expect(result).not.toHaveProperty('isError');
  });

  it('handles dimensions with simple values format (no levels)', async () => {
    const contentWithSimpleValues = {
      preamble: 'Test preamble',
      template: 'Test template with [variable]',
      dimensions: [
        {
          name: 'variable',
          values: ['a', 'b', 'c'], // Old format without levels
        },
      ],
    };

    const mockDefinition = {
      id: 'def-simple',
      name: 'Simple Definition',
    };

    vi.mocked(db.definition.create).mockResolvedValue(mockDefinition as never);

    const result = await toolHandler(
      {
        name: 'Simple Definition',
        content: contentWithSimpleValues,
      },
      { requestId: 'req-7' }
    );

    expect(result).not.toHaveProperty('isError');
  });

  it('handles queue failure gracefully', async () => {
    const mockDefinition = {
      id: 'def-queue-fail',
      name: 'Test Definition',
    };

    vi.mocked(db.definition.create).mockResolvedValue(mockDefinition as never);
    vi.mocked(queueScenarioExpansion).mockResolvedValue({
      queued: false,
      jobId: undefined as unknown as string,
    });

    const result = await toolHandler(
      {
        name: 'Test Definition',
        content: validContent,
      },
      { requestId: 'req-8' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.scenario_expansion.queued).toBe(false);
  });

  it('adds schema_version to content', async () => {
    const mockDefinition = {
      id: 'def-schema',
      name: 'Test Definition',
    };

    vi.mocked(db.definition.create).mockResolvedValue(mockDefinition as never);

    await toolHandler(
      {
        name: 'Test Definition',
        content: validContent,
      },
      { requestId: 'req-9' }
    );

    expect(db.definition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.objectContaining({
            schema_version: 2,
          }),
        }),
      })
    );
  });

  it('always uses current schema_version (ignores input schema_version)', async () => {
    // Implementation explicitly constructs content without schema_version from input
    // This ensures all definitions use the current schema version
    const contentWithVersion = {
      ...validContent,
      schema_version: 1, // This will be ignored
    };

    const mockDefinition = {
      id: 'def-version',
      name: 'Test Definition',
    };

    vi.mocked(db.definition.create).mockResolvedValue(mockDefinition as never);

    await toolHandler(
      {
        name: 'Test Definition',
        content: contentWithVersion,
      },
      { requestId: 'req-10' }
    );

    // Schema version 2 is always used (current version)
    expect(db.definition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.objectContaining({
            schema_version: 2,
          }),
        }),
      })
    );
  });

  it('includes matching_rules in content when provided', async () => {
    const contentWithRules = {
      ...validContent,
      matching_rules: 'exclude: level1 with level5',
    };

    const mockDefinition = {
      id: 'def-rules',
      name: 'Test Definition',
    };

    vi.mocked(db.definition.create).mockResolvedValue(mockDefinition as never);

    await toolHandler(
      {
        name: 'Test Definition',
        content: contentWithRules,
      },
      { requestId: 'req-11' }
    );

    expect(db.definition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.objectContaining({
            matching_rules: 'exclude: level1 with level5',
          }),
        }),
      })
    );
  });
});
