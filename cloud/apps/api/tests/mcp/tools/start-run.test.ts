/**
 * start_run Tool Tests
 *
 * Tests the start_run MCP tool handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock db before importing the tool
vi.mock('@valuerank/db', () => ({
  db: {
    definition: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock run service (from index.js not start.js)
vi.mock('../../../src/services/run/index.js', () => ({
  startRun: vi.fn(),
}));

// Mock audit logging
vi.mock('../../../src/services/mcp/index.js', () => ({
  logAuditEvent: vi.fn(),
  createRunAudit: vi.fn().mockReturnValue({ action: 'start_run' }),
}));

// Import after mock
import { db } from '@valuerank/db';
import { startRun } from '../../../src/services/run/index.js';
import { NotFoundError, ValidationError } from '@valuerank/shared';

describe('start_run tool', () => {
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
    const { registerStartRunTool } = await import(
      '../../../src/mcp/tools/start-run.js'
    );
    registerStartRunTool(mockServer);
  });

  it('registers the tool with correct name and schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'start_run',
      expect.objectContaining({
        description: expect.stringContaining('Start an evaluation run'),
        inputSchema: expect.objectContaining({
          definition_id: expect.any(Object),
          models: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('successfully starts a run', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
      deletedAt: null,
      scenarios: [{ id: 'scenario-1' }, { id: 'scenario-2' }],
    };

    const mockRunResult = {
      run: {
        id: 'run-123',
        progress: { total: 10, completed: 0, failed: 0 },
      },
      jobCount: 10,
      estimatedCosts: {
        total: 0.50,
        scenarioCount: 10,
        perModel: [
          {
            modelId: 'openai:gpt-4',
            displayName: 'GPT-4',
            totalCost: 0.50,
            inputTokens: 1000,
            outputTokens: 9000,
            isUsingFallback: false,
          },
        ],
        isUsingFallback: false,
        basedOnSampleCount: 100,
      },
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);
    vi.mocked(startRun).mockResolvedValue(mockRunResult as never);

    const result = await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
      },
      { requestId: 'req-1' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.success).toBe(true);
    expect(response.run_id).toBe('run-123');
    expect(response.queued_task_count).toBe(10);
    expect(response.estimated_cost).toBeDefined();
  });

  it('starts run with sample percentage', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
      deletedAt: null,
      scenarios: [{ id: 'scenario-1' }],
    };

    const mockRunResult = {
      run: { id: 'run-123', progress: { total: 1, completed: 0, failed: 0 } },
      jobCount: 1,
      estimatedCosts: {
        total: 0.05,
        scenarioCount: 1,
        perModel: [],
        isUsingFallback: false,
        basedOnSampleCount: 10,
      },
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);
    vi.mocked(startRun).mockResolvedValue(mockRunResult as never);

    await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
        sample_percentage: 10,
      },
      { requestId: 'req-2' }
    );

    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        samplePercentage: 10,
      })
    );
  });

  it('starts run with priority', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
      deletedAt: null,
      scenarios: [{ id: 'scenario-1' }],
    };

    const mockRunResult = {
      run: { id: 'run-123', progress: { total: 1, completed: 0, failed: 0 } },
      jobCount: 1,
      estimatedCosts: {
        total: 0.50,
        scenarioCount: 1,
        perModel: [],
        isUsingFallback: false,
        basedOnSampleCount: 10,
      },
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);
    vi.mocked(startRun).mockResolvedValue(mockRunResult as never);

    await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
        priority: 'HIGH',
      },
      { requestId: 'req-3' }
    );

    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: 'HIGH',
      })
    );
  });

  it('starts run with sample seed', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
      deletedAt: null,
      scenarios: [{ id: 'scenario-1' }],
    };

    const mockRunResult = {
      run: { id: 'run-123', progress: { total: 1, completed: 0, failed: 0 } },
      jobCount: 1,
      estimatedCosts: {
        total: 0.05,
        scenarioCount: 1,
        perModel: [],
        isUsingFallback: false,
        basedOnSampleCount: 10,
      },
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);
    vi.mocked(startRun).mockResolvedValue(mockRunResult as never);

    await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
        sample_percentage: 10,
        sample_seed: 42,
      },
      { requestId: 'req-4' }
    );

    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleSeed: 42,
      })
    );
  });

  it('returns NOT_FOUND when definition does not exist', async () => {
    vi.mocked(db.definition.findUnique).mockResolvedValue(null);

    const result = await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
      },
      { requestId: 'req-5' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('NOT_FOUND');
  });

  it('returns NOT_FOUND when definition is soft-deleted', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Deleted Definition',
      deletedAt: new Date(),
      scenarios: [],
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);

    const result = await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
      },
      { requestId: 'req-6' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('NOT_FOUND');
  });

  it('returns VALIDATION_ERROR when no scenarios exist', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
      deletedAt: null,
      scenarios: [], // No scenarios
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);

    const result = await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
      },
      { requestId: 'req-7' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('VALIDATION_ERROR');
    expect(response.message).toContain('no scenarios');
  });

  it('handles startRun validation errors', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
      deletedAt: null,
      scenarios: [{ id: 'scenario-1' }],
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);
    vi.mocked(startRun).mockRejectedValue(
      new ValidationError('Invalid model configuration', {})
    );

    const result = await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['invalid:model'],
      },
      { requestId: 'req-8' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('VALIDATION_ERROR');
  });

  it('handles startRun NotFoundError', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
      deletedAt: null,
      scenarios: [{ id: 'scenario-1' }],
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);
    vi.mocked(startRun).mockRejectedValue(
      new NotFoundError('Model', 'openai:gpt-5')
    );

    const result = await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-5'],
      },
      { requestId: 'req-9' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('NOT_FOUND');
  });

  it('returns INTERNAL_ERROR on database failure', async () => {
    vi.mocked(db.definition.findUnique).mockRejectedValue(
      new Error('DB connection failed')
    );

    const result = await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
      },
      { requestId: 'req-10' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('INTERNAL_ERROR');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(db.definition.findUnique).mockRejectedValue('string error');

    const result = await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
      },
      { requestId: 'req-11' }
    );

    expect(result).toHaveProperty('isError', true);
    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);
    expect(response.error).toBe('INTERNAL_ERROR');
    expect(response.message).toBe('Failed to start run');
  });

  it('generates requestId when not provided', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
      deletedAt: null,
      scenarios: [{ id: 'scenario-1' }],
    };

    const mockRunResult = {
      run: { id: 'run-123', progress: { total: 1, completed: 0, failed: 0 } },
      jobCount: 1,
      estimatedCosts: {
        total: 0.50,
        scenarioCount: 1,
        perModel: [],
        isUsingFallback: false,
        basedOnSampleCount: 10,
      },
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);
    vi.mocked(startRun).mockResolvedValue(mockRunResult as never);

    const result = await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
      },
      {}
    );

    expect(result).not.toHaveProperty('isError');
  });

  it('passes undefined sample percentage to service (service handles defaults)', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
      deletedAt: null,
      scenarios: [{ id: 'scenario-1' }],
    };

    const mockRunResult = {
      run: { id: 'run-123', progress: { total: 1, completed: 0, failed: 0 } },
      jobCount: 1,
      estimatedCosts: {
        total: 0.50,
        scenarioCount: 1,
        perModel: [],
        isUsingFallback: false,
        basedOnSampleCount: 10,
      },
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);
    vi.mocked(startRun).mockResolvedValue(mockRunResult as never);

    await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
      },
      { requestId: 'req-12' }
    );

    // Tool passes values through to service, service handles defaults
    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        samplePercentage: undefined,
      })
    );
  });

  it('passes undefined priority to service (service handles defaults)', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
      deletedAt: null,
      scenarios: [{ id: 'scenario-1' }],
    };

    const mockRunResult = {
      run: { id: 'run-123', progress: { total: 1, completed: 0, failed: 0 } },
      jobCount: 1,
      estimatedCosts: {
        total: 0.50,
        scenarioCount: 1,
        perModel: [],
        isUsingFallback: false,
        basedOnSampleCount: 10,
      },
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);
    vi.mocked(startRun).mockResolvedValue(mockRunResult as never);

    await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
      },
      { requestId: 'req-13' }
    );

    // Tool passes values through to service, service handles defaults
    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: undefined,
      })
    );
  });

  it('includes cost estimate with fallback reason when using fallback', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
      deletedAt: null,
      scenarios: [{ id: 'scenario-1' }],
    };

    const mockRunResult = {
      run: { id: 'run-123', progress: { total: 1, completed: 0, failed: 0 } },
      jobCount: 1,
      estimatedCosts: {
        total: 0.10,
        scenarioCount: 1,
        perModel: [
          {
            modelId: 'openai:gpt-4',
            displayName: 'GPT-4',
            totalCost: 0.10,
            inputTokens: 100,
            outputTokens: 900,
            isUsingFallback: true,
          },
        ],
        isUsingFallback: true,
        basedOnSampleCount: 0, // No historical data
      },
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);
    vi.mocked(startRun).mockResolvedValue(mockRunResult as never);

    const result = await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
      },
      { requestId: 'req-14' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.estimated_cost.using_fallback).toBe(true);
    expect(response.estimated_cost.fallback_reason).toContain('No historical token data');
  });

  it('includes partial fallback reason when some models lack data', async () => {
    const mockDefinition = {
      id: testDefinitionId,
      name: 'Test Definition',
      deletedAt: null,
      scenarios: [{ id: 'scenario-1' }],
    };

    const mockRunResult = {
      run: { id: 'run-123', progress: { total: 1, completed: 0, failed: 0 } },
      jobCount: 1,
      estimatedCosts: {
        total: 0.10,
        scenarioCount: 1,
        perModel: [],
        isUsingFallback: true,
        basedOnSampleCount: 50, // Some historical data, but fallback for some models
      },
    };

    vi.mocked(db.definition.findUnique).mockResolvedValue(mockDefinition as never);
    vi.mocked(startRun).mockResolvedValue(mockRunResult as never);

    const result = await toolHandler(
      {
        definition_id: testDefinitionId,
        models: ['openai:gpt-4'],
      },
      { requestId: 'req-15' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.estimated_cost.using_fallback).toBe(true);
    expect(response.estimated_cost.fallback_reason).toContain('Some models lack');
  });
});
