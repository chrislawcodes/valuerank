import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRunLoader } from '../../../src/graphql/dataloaders/run.js';
import { createTranscriptLoader, createTranscriptsByRunLoader } from '../../../src/graphql/dataloaders/transcript.js';
import { createScenarioLoader } from '../../../src/graphql/dataloaders/scenario.js';
import { db } from '@valuerank/db';

// Mock Prisma client
vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findMany: vi.fn(),
    },
    transcript: {
      findMany: vi.fn(),
    },
    scenario: {
      findMany: vi.fn(),
    },
  },
}));

describe('Run DataLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createRunLoader', () => {
    it('batches multiple load calls into single query', async () => {
      const mockRuns = [
        { id: 'run1', definitionId: 'def1', status: 'PENDING', config: {} },
        { id: 'run2', definitionId: 'def1', status: 'RUNNING', config: {} },
        { id: 'run3', definitionId: 'def2', status: 'COMPLETED', config: {} },
      ];

      vi.mocked(db.run.findMany).mockResolvedValue(mockRuns as never);

      const loader = createRunLoader();

      const [result1, result2, result3] = await Promise.all([
        loader.load('run1'),
        loader.load('run2'),
        loader.load('run3'),
      ]);

      expect(result1?.id).toBe('run1');
      expect(result2?.id).toBe('run2');
      expect(result3?.id).toBe('run3');

      expect(db.run.findMany).toHaveBeenCalledTimes(1);
      expect(db.run.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['run1', 'run2', 'run3'] }, deletedAt: null },
      });
    });

    it('returns null for non-existent IDs', async () => {
      vi.mocked(db.run.findMany).mockResolvedValue([
        { id: 'run1', definitionId: 'def1', status: 'PENDING', config: {} },
      ] as never);

      const loader = createRunLoader();

      const [existing, missing] = await Promise.all([
        loader.load('run1'),
        loader.load('nonexistent'),
      ]);

      expect(existing?.id).toBe('run1');
      expect(missing).toBeNull();
    });

    it('returns results in correct order matching input IDs', async () => {
      const mockRuns = [
        { id: 'run3', definitionId: 'def1', status: 'COMPLETED', config: {} },
        { id: 'run1', definitionId: 'def1', status: 'PENDING', config: {} },
      ];

      vi.mocked(db.run.findMany).mockResolvedValue(mockRuns as never);

      const loader = createRunLoader();

      const [result1, result2, result3] = await Promise.all([
        loader.load('run1'),
        loader.load('run2'),
        loader.load('run3'),
      ]);

      expect(result1?.id).toBe('run1');
      expect(result2).toBeNull();
      expect(result3?.id).toBe('run3');
    });
  });
});

describe('Transcript DataLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createTranscriptLoader', () => {
    it('batches multiple load calls into single query', async () => {
      const mockTranscripts = [
        { id: 't1', runId: 'run1', modelId: 'gpt-4', content: {}, turnCount: 5, tokenCount: 100, durationMs: 1000 },
        { id: 't2', runId: 'run1', modelId: 'claude', content: {}, turnCount: 3, tokenCount: 80, durationMs: 800 },
      ];

      vi.mocked(db.transcript.findMany).mockResolvedValue(mockTranscripts as never);

      const loader = createTranscriptLoader();

      const [result1, result2] = await Promise.all([
        loader.load('t1'),
        loader.load('t2'),
      ]);

      expect(result1?.id).toBe('t1');
      expect(result2?.id).toBe('t2');
      expect(db.transcript.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('createTranscriptsByRunLoader', () => {
    it('groups transcripts by run ID', async () => {
      const mockTranscripts = [
        { id: 't1', runId: 'run1', modelId: 'gpt-4', content: {}, turnCount: 5, tokenCount: 100, durationMs: 1000 },
        { id: 't2', runId: 'run1', modelId: 'claude', content: {}, turnCount: 3, tokenCount: 80, durationMs: 800 },
        { id: 't3', runId: 'run2', modelId: 'gpt-4', content: {}, turnCount: 4, tokenCount: 90, durationMs: 900 },
      ];

      vi.mocked(db.transcript.findMany).mockResolvedValue(mockTranscripts as never);

      const loader = createTranscriptsByRunLoader();

      const [run1Transcripts, run2Transcripts] = await Promise.all([
        loader.load('run1'),
        loader.load('run2'),
      ]);

      expect(run1Transcripts).toHaveLength(2);
      expect(run1Transcripts.map((t) => t.id)).toContain('t1');
      expect(run1Transcripts.map((t) => t.id)).toContain('t2');
      expect(run2Transcripts).toHaveLength(1);
      expect(run2Transcripts[0].id).toBe('t3');
    });

    it('returns empty array for runs with no transcripts', async () => {
      vi.mocked(db.transcript.findMany).mockResolvedValue([]);

      const loader = createTranscriptsByRunLoader();
      const result = await loader.load('run-no-transcripts');

      expect(result).toEqual([]);
    });
  });
});

describe('Scenario DataLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createScenarioLoader', () => {
    it('batches multiple load calls into single query', async () => {
      const mockScenarios = [
        { id: 's1', definitionId: 'def1', name: 'Scenario 1', content: {} },
        { id: 's2', definitionId: 'def1', name: 'Scenario 2', content: {} },
      ];

      vi.mocked(db.scenario.findMany).mockResolvedValue(mockScenarios as never);

      const loader = createScenarioLoader();

      const [result1, result2] = await Promise.all([
        loader.load('s1'),
        loader.load('s2'),
      ]);

      expect(result1?.id).toBe('s1');
      expect(result2?.id).toBe('s2');
      expect(db.scenario.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns null for non-existent scenarios', async () => {
      vi.mocked(db.scenario.findMany).mockResolvedValue([]);

      const loader = createScenarioLoader();
      const result = await loader.load('nonexistent');

      expect(result).toBeNull();
    });
  });
});
