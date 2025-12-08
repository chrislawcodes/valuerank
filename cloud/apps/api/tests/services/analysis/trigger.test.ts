/**
 * Unit tests for analysis trigger service
 *
 * Tests triggering basic analysis when runs complete.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { db } from '@valuerank/db';
import {
  triggerBasicAnalysis,
  hasCurrentAnalysis,
} from '../../../src/services/analysis/trigger.js';

// Mock PgBoss
const mockBossSend = vi.fn().mockResolvedValue('mock-job-id');
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: mockBossSend,
  })),
}));

describe('analysis trigger service', () => {
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdScenarioIds: string[] = [];
  const createdTranscriptIds: string[] = [];
  const createdAnalysisIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up in order of dependencies
    if (createdAnalysisIds.length > 0) {
      await db.analysisResult.deleteMany({
        where: { id: { in: createdAnalysisIds } },
      });
      createdAnalysisIds.length = 0;
    }

    if (createdTranscriptIds.length > 0) {
      await db.transcript.deleteMany({
        where: { id: { in: createdTranscriptIds } },
      });
      createdTranscriptIds.length = 0;
    }

    if (createdRunIds.length > 0) {
      await db.runScenarioSelection.deleteMany({
        where: { runId: { in: createdRunIds } },
      });
      await db.run.deleteMany({
        where: { id: { in: createdRunIds } },
      });
      createdRunIds.length = 0;
    }

    if (createdScenarioIds.length > 0) {
      await db.scenario.deleteMany({
        where: { id: { in: createdScenarioIds } },
      });
      createdScenarioIds.length = 0;
    }

    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }
  });

  async function createTestDefinition() {
    const definition = await db.definition.create({
      data: {
        name: 'Test Definition',
        content: { schema_version: 1, preamble: 'Test' },
      },
    });
    createdDefinitionIds.push(definition.id);
    return definition;
  }

  async function createTestScenario(definitionId: string) {
    const scenario = await db.scenario.create({
      data: {
        definitionId,
        name: 'Test Scenario',
        content: { dimensions: { stake: 'high' } },
      },
    });
    createdScenarioIds.push(scenario.id);
    return scenario;
  }

  async function createTestRun(definitionId: string, status = 'COMPLETED') {
    const run = await db.run.create({
      data: {
        definitionId,
        status,
        config: { models: ['gpt-4'] },
        progress: { total: 2, completed: 2, failed: 0 },
      },
    });
    createdRunIds.push(run.id);
    return run;
  }

  async function createTestTranscript(
    runId: string,
    modelId: string,
    scenarioId: string,
    options: {
      summarized?: boolean;
      decisionCode?: string;
    } = {}
  ) {
    const { summarized = true, decisionCode = 'prioritize_A' } = options;

    const transcript = await db.transcript.create({
      data: {
        runId,
        modelId,
        scenarioId,
        content: { messages: [] },
        turnCount: 3,
        tokenCount: 100,
        durationMs: 1000,
        decisionCode: summarized ? decisionCode : null,
        summarizedAt: summarized ? new Date() : null,
      },
    });
    createdTranscriptIds.push(transcript.id);
    return transcript;
  }

  async function createTestAnalysis(runId: string, status = 'CURRENT') {
    const analysis = await db.analysisResult.create({
      data: {
        runId,
        analysisType: 'basic',
        inputHash: 'test-hash',
        codeVersion: '1.0.0',
        output: { perModel: {} },
        status,
      },
    });
    createdAnalysisIds.push(analysis.id);
    return analysis;
  }

  describe('triggerBasicAnalysis', () => {
    it('queues analyze_basic job with transcript IDs', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id);

      const t1 = await createTestTranscript(run.id, 'gpt-4', scenario.id);
      const t2 = await createTestTranscript(run.id, 'claude-3', scenario.id);

      const result = await triggerBasicAnalysis(run.id);

      expect(result).toBe(true);
      expect(mockBossSend).toHaveBeenCalledTimes(1);

      const [jobName, jobData, _options] = mockBossSend.mock.calls[0];
      expect(jobName).toBe('analyze_basic');
      expect(jobData.runId).toBe(run.id);
      expect(jobData.transcriptIds).toHaveLength(2);
      expect(jobData.transcriptIds).toContain(t1.id);
      expect(jobData.transcriptIds).toContain(t2.id);
      expect(jobData.force).toBe(false);
    });

    it('includes force flag when specified', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id);

      await createTestTranscript(run.id, 'gpt-4', scenario.id);

      await triggerBasicAnalysis(run.id, { force: true });

      const [_jobName, jobData, _options] = mockBossSend.mock.calls[0];
      expect(jobData.force).toBe(true);
    });

    it('returns false when no successful transcripts exist', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      // No transcripts
      const result = await triggerBasicAnalysis(run.id);

      expect(result).toBe(false);
      expect(mockBossSend).not.toHaveBeenCalled();
    });

    it('excludes unsummarized transcripts', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id);

      const summarized = await createTestTranscript(run.id, 'gpt-4', scenario.id, {
        summarized: true,
      });
      await createTestTranscript(run.id, 'claude-3', scenario.id, {
        summarized: false,
      });

      await triggerBasicAnalysis(run.id);

      const [_jobName, jobData, _options] = mockBossSend.mock.calls[0];
      expect(jobData.transcriptIds).toHaveLength(1);
      expect(jobData.transcriptIds).toContain(summarized.id);
    });

    it('excludes error transcripts', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id);

      const successful = await createTestTranscript(run.id, 'gpt-4', scenario.id, {
        decisionCode: 'prioritize_A',
      });
      await createTestTranscript(run.id, 'claude-3', scenario.id, {
        decisionCode: 'error',
      });

      await triggerBasicAnalysis(run.id);

      const [_jobName, jobData, _options] = mockBossSend.mock.calls[0];
      expect(jobData.transcriptIds).toHaveLength(1);
      expect(jobData.transcriptIds).toContain(successful.id);
    });

    it('returns false when all transcripts are errors', async () => {
      const definition = await createTestDefinition();
      const scenario = await createTestScenario(definition.id);
      const run = await createTestRun(definition.id);

      await createTestTranscript(run.id, 'gpt-4', scenario.id, {
        decisionCode: 'error',
      });
      await createTestTranscript(run.id, 'claude-3', scenario.id, {
        decisionCode: 'error',
      });

      const result = await triggerBasicAnalysis(run.id);

      expect(result).toBe(false);
      expect(mockBossSend).not.toHaveBeenCalled();
    });
  });

  describe('hasCurrentAnalysis', () => {
    it('returns true when CURRENT analysis exists', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      await createTestAnalysis(run.id, 'CURRENT');

      const result = await hasCurrentAnalysis(run.id);

      expect(result).toBe(true);
    });

    it('returns false when no analysis exists', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      const result = await hasCurrentAnalysis(run.id);

      expect(result).toBe(false);
    });

    it('returns false when only SUPERSEDED analysis exists', async () => {
      const definition = await createTestDefinition();
      const run = await createTestRun(definition.id);

      await createTestAnalysis(run.id, 'SUPERSEDED');

      const result = await hasCurrentAnalysis(run.id);

      expect(result).toBe(false);
    });
  });
});
