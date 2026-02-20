import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('@valuerank/db', () => ({
  db: {
    definition: {
      findMany: vi.fn(),
    },
    run: {
      findMany: vi.fn(),
    },
  },
  loadDefinitionContent: vi.fn(),
  resolveDefinitionContent: vi.fn(),
}));

import { db, loadDefinitionContent } from '@valuerank/db';

describe('export_pairwise_outcomes tool', () => {
  let toolHandler: (
    args: Record<string, unknown>,
    extra: Record<string, unknown>
  ) => Promise<unknown>;

  const mockServer = {
    registerTool: vi.fn((name, _config, handler) => {
      if (name === 'export_pairwise_outcomes') {
        toolHandler = handler;
      }
    }),
  } as unknown as McpServer;

  const makeDefinitions = () => [
    {
      id: 'def-1',
      name: 'Ethics Vignette 1',
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
      name: 'Ethics Vignette 2',
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
  ];

  const makeAnalysisOutput = (
    valueA: string,
    valueB: string,
    modelId: string
  ) => ({
    perModel: {
      [modelId]: {
        sampleSize: 5,
        values: {
          [valueA]: {
            count: { prioritized: 3, deprioritized: 1, neutral: 1 },
            winRate: 0.75,
            confidenceInterval: {
              lower: 0.5,
              upper: 0.95,
              level: 0.95,
              method: 'wilson',
            },
          },
          [valueB]: {
            count: { prioritized: 1, deprioritized: 3, neutral: 1 },
            winRate: 0.25,
            confidenceInterval: {
              lower: 0.05,
              upper: 0.5,
              level: 0.95,
              method: 'wilson',
            },
          },
        },
      },
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const { registerExportPairwiseOutcomesTool } = await import(
      '../../../src/mcp/tools/export-pairwise-outcomes.js'
    );
    registerExportPairwiseOutcomesTool(mockServer);
  });

  it('registers tool with expected schema', () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      'export_pairwise_outcomes',
      expect.objectContaining({
        inputSchema: expect.objectContaining({
          folder: expect.any(Object),
          tag: expect.any(Object),
          definition_ids: expect.any(Object),
          include_ci: expect.any(Object),
          aggregate_only: expect.any(Object),
        }),
      }),
      expect.any(Function)
    );
  });

  it('returns pairwise outcome rows from aggregate runs', async () => {
    const defs = makeDefinitions();
    vi.mocked(db.definition.findMany).mockResolvedValue(defs as never);
    vi.mocked(loadDefinitionContent).mockImplementation((raw) => raw as never);

    vi.mocked(db.run.findMany).mockResolvedValue([
      {
        id: 'run-1',
        definitionId: 'def-1',
        createdAt: new Date('2026-01-01'),
        analysisResults: [
          {
            id: 'ar-1',
            output: makeAnalysisOutput(
              'Achievement',
              'Benevolence_Caring',
              'gpt-4'
            ),
          },
        ],
      },
      {
        id: 'run-2',
        definitionId: 'def-2',
        createdAt: new Date('2026-01-01'),
        analysisResults: [
          {
            id: 'ar-2',
            output: makeAnalysisOutput(
              'Power_Dominance',
              'Universalism_Concern',
              'gpt-4'
            ),
          },
        ],
      },
    ] as never);

    const result = await toolHandler(
      { folder: 'Ethics', aggregate_only: true, include_ci: false, limit: 100, offset: 0 },
      { requestId: 'req-1' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.count).toBe(2);
    expect(response.data.definitionsMatched).toBe(2);
    expect(response.data.definitionsWithData).toBe(2);

    const row1 = response.data.rows[0];
    expect(row1.vignetteName).toBe('Ethics Vignette 1');
    expect(row1.valueA).toBe('Achievement');
    expect(row1.valueB).toBe('Benevolence_Caring');
    expect(row1.modelId).toBe('gpt-4');
    expect(row1.valueAWinRate).toBe(0.75);
    expect(row1.valueBWinRate).toBe(0.25);
    expect(row1.valueAPrioritized).toBe(3);
    expect(row1.valueBDeprioritized).toBe(3);

    // CI fields should not be present when include_ci=false
    expect(row1.valueACiLower).toBeUndefined();
    expect(row1.valueACiUpper).toBeUndefined();
  });

  it('includes confidence intervals when include_ci=true', async () => {
    const defs = makeDefinitions().slice(0, 1);
    vi.mocked(db.definition.findMany).mockResolvedValue(defs as never);
    vi.mocked(loadDefinitionContent).mockImplementation((raw) => raw as never);

    vi.mocked(db.run.findMany).mockResolvedValue([
      {
        id: 'run-1',
        definitionId: 'def-1',
        createdAt: new Date('2026-01-01'),
        analysisResults: [
          {
            id: 'ar-1',
            output: makeAnalysisOutput(
              'Achievement',
              'Benevolence_Caring',
              'claude-3'
            ),
          },
        ],
      },
    ] as never);

    const result = await toolHandler(
      { include_ci: true, aggregate_only: true, limit: 100, offset: 0 },
      { requestId: 'req-ci' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    const row = response.data.rows[0];
    expect(row.valueACiLower).toBe(0.5);
    expect(row.valueACiUpper).toBe(0.95);
    expect(row.valueBCiLower).toBe(0.05);
    expect(row.valueBCiUpper).toBe(0.5);
  });

  it('returns empty result when no definitions match', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue([]);

    const result = await toolHandler(
      { folder: 'nonexistent', aggregate_only: true, include_ci: false, limit: 100, offset: 0 },
      { requestId: 'req-empty' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.count).toBe(0);
    expect(response.data.rows).toEqual([]);
    expect(response.data.definitionsMatched).toBe(0);
  });

  it('takes most recent run per definition', async () => {
    const defs = makeDefinitions().slice(0, 1);
    vi.mocked(db.definition.findMany).mockResolvedValue(defs as never);
    vi.mocked(loadDefinitionContent).mockImplementation((raw) => raw as never);

    // Two runs for same definition - older run returned first since orderBy desc
    vi.mocked(db.run.findMany).mockResolvedValue([
      {
        id: 'run-new',
        definitionId: 'def-1',
        createdAt: new Date('2026-02-01'),
        analysisResults: [
          {
            id: 'ar-new',
            output: makeAnalysisOutput(
              'Achievement',
              'Benevolence_Caring',
              'gpt-4'
            ),
          },
        ],
      },
      {
        id: 'run-old',
        definitionId: 'def-1',
        createdAt: new Date('2026-01-01'),
        analysisResults: [
          {
            id: 'ar-old',
            output: {
              perModel: {
                'gpt-4': {
                  sampleSize: 1,
                  values: {
                    Achievement: {
                      count: { prioritized: 1, deprioritized: 0, neutral: 0 },
                      winRate: 1.0,
                      confidenceInterval: {
                        lower: 0.5,
                        upper: 1.0,
                        level: 0.95,
                        method: 'wilson',
                      },
                    },
                    Benevolence_Caring: {
                      count: { prioritized: 0, deprioritized: 1, neutral: 0 },
                      winRate: 0.0,
                      confidenceInterval: {
                        lower: 0.0,
                        upper: 0.5,
                        level: 0.95,
                        method: 'wilson',
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    ] as never);

    const result = await toolHandler(
      { aggregate_only: true, include_ci: false, limit: 100, offset: 0 },
      { requestId: 'req-dedup' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    // Should use the newer run (sampleSize: 5, not 1)
    expect(response.data.count).toBe(1);
    expect(response.data.rows[0].sampleSize).toBe(5);
  });

  it('skips runs with invalid analysis output', async () => {
    const defs = makeDefinitions().slice(0, 1);
    vi.mocked(db.definition.findMany).mockResolvedValue(defs as never);
    vi.mocked(loadDefinitionContent).mockImplementation((raw) => raw as never);

    vi.mocked(db.run.findMany).mockResolvedValue([
      {
        id: 'run-bad',
        definitionId: 'def-1',
        createdAt: new Date('2026-01-01'),
        analysisResults: [
          {
            id: 'ar-bad',
            output: { invalid: 'data' },
          },
        ],
      },
    ] as never);

    const result = await toolHandler(
      { aggregate_only: true, include_ci: false, limit: 100, offset: 0 },
      { requestId: 'req-invalid' }
    );

    const content = (result as { content: Array<{ text: string }> }).content;
    const response = JSON.parse(content[0].text);

    expect(response.data.count).toBe(0);
    expect(response.data.definitionsWithData).toBe(0);
  });

  it('queries with Aggregate tag when aggregate_only=true', async () => {
    vi.mocked(db.definition.findMany).mockResolvedValue([]);

    await toolHandler(
      { aggregate_only: true, include_ci: false, limit: 100, offset: 0 },
      { requestId: 'req-agg-filter' }
    );

    // No runs query made since no definitions matched
    expect(db.run.findMany).not.toHaveBeenCalled();
  });

  it('queries by COMPLETED status when aggregate_only=false', async () => {
    const defs = makeDefinitions().slice(0, 1);
    vi.mocked(db.definition.findMany).mockResolvedValue(defs as never);
    vi.mocked(loadDefinitionContent).mockImplementation((raw) => raw as never);
    vi.mocked(db.run.findMany).mockResolvedValue([]);

    await toolHandler(
      { aggregate_only: false, include_ci: false, limit: 100, offset: 0 },
      { requestId: 'req-completed' }
    );

    expect(db.run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'COMPLETED',
        }),
      })
    );
  });
});
