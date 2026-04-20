import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@valuerank/db';
import {
  buildDefinition,
  buildDefinitionContent,
  buildDomain,
  buildRun,
  buildScenario,
  buildTranscript,
  createTestEntities,
} from './factories.js';

function expectUniqueIds(values: Array<{ id: string }>) {
  const ids = values.map((value) => value.id);
  expect(new Set(ids).size).toBe(ids.length);
}

describe('factories', () => {
  describe('buildDefinitionContent', () => {
    it('returns a valid definition content object', () => {
      const content = buildDefinitionContent();

      expect(content).toMatchObject({
        schema_version: 1,
        preamble: 'Test preamble',
        template: 'Choose between [ValueA] and [ValueB].',
      });
      expect(content.dimensions).toHaveLength(2);
      expect(content.dimensions[0]).toMatchObject({
        name: 'ValueA',
        levels: [
          { score: 1, label: 'Low', options: ['low-a'] },
          { score: 2, label: 'High', options: ['high-a'] },
        ],
      });
    });

    it('generates fresh nested objects on each call', () => {
      const first = buildDefinitionContent();
      const second = buildDefinitionContent();

      expect(first).not.toBe(second);
      expect(first.dimensions).not.toBe(second.dimensions);
      expect(first.dimensions[0]).not.toBe(second.dimensions[0]);
    });
  });

  describe('buildDefinition', () => {
    it('returns a valid definition object with all required fields', () => {
      const definition = buildDefinition();

      expect(definition).toMatchObject({
        parentId: null,
        domainId: null,
        domainContextId: null,
        name: 'test-definition',
        expansionProgress: null,
        expansionDebug: null,
        lastAccessedAt: null,
        deletedAt: null,
        createdByUserId: null,
        deletedByUserId: null,
        version: 1,
        preambleVersionId: null,
        levelPresetVersionId: null,
      });
      expect(definition.createdAt).toBeInstanceOf(Date);
      expect(definition.updatedAt).toBeInstanceOf(Date);
      expect(definition.content).toMatchObject({
        schema_version: 1,
        preamble: 'Test preamble',
        template: 'Choose between [ValueA] and [ValueB].',
      });
    });

    it('generates unique ids across calls', () => {
      expectUniqueIds([buildDefinition(), buildDefinition(), buildDefinition()]);
    });

    it('supports shallow content overrides', () => {
      const definition = buildDefinition({ content: { schema_version: 2 } });

      expect(definition.content).toMatchObject({
        schema_version: 2,
        preamble: 'Test preamble',
        template: 'Choose between [ValueA] and [ValueB].',
      });
      expect(definition.content.dimensions).toHaveLength(2);
    });
  });

  describe('buildRun', () => {
    it('returns a valid run object with all required fields', () => {
      const run = buildRun();

      expect(run).toMatchObject({
        name: null,
        experimentId: null,
        status: 'COMPLETED',
        runCategory: 'PRODUCTION',
        progress: { total: 10, completed: 10, failed: 0 },
        summarizeProgress: null,
        stalledModels: [],
        lastAccessedAt: null,
        deletedAt: null,
        retentionDays: null,
        archivePermanently: true,
        createdByUserId: null,
        deletedByUserId: null,
        domainConfigSnapshotId: null,
      });
      expect(run.createdAt).toBeInstanceOf(Date);
      expect(run.completedAt).toBeInstanceOf(Date);
      expect(run.config).toEqual({ models: ['test-model-1'], samplesPerScenario: 1 });
    });

    it('generates unique ids across calls', () => {
      expectUniqueIds([buildRun(), buildRun(), buildRun()]);
    });

    it('allows top-level overrides', () => {
      expect(buildRun({ status: 'FAILED' }).status).toBe('FAILED');
    });
  });

  describe('buildTranscript', () => {
    it('returns a valid transcript object with all required fields', () => {
      const transcript = buildTranscript();

      expect(transcript).toMatchObject({
        scenarioId: null,
        modelId: 'test-model-1',
        modelVersion: null,
        sampleIndex: 0,
        definitionSnapshot: null,
        turnCount: 1,
        tokenCount: 50,
        durationMs: 1000,
        estimatedCost: null,
        lastAccessedAt: null,
        contentExpiresAt: null,
        decisionText: null,
        decisionMetadata: null,
        summarizedAt: null,
        deletedAt: null,
      });
      expect(transcript.createdAt).toBeInstanceOf(Date);
      expect(transcript.content).toMatchObject({
        turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response about values' }],
      });
    });

    it('generates unique ids across calls', () => {
      expectUniqueIds([buildTranscript(), buildTranscript(), buildTranscript()]);
    });
  });

  describe('buildScenario', () => {
    it('returns a valid scenario object with all required fields', () => {
      const scenario = buildScenario();

      expect(scenario).toMatchObject({
        name: 'test-scenario-1',
        orientationFlipped: false,
        deletedAt: null,
      });
      expect(scenario.createdAt).toBeInstanceOf(Date);
      expect(scenario.content).toMatchObject({
        prompt: 'You face a dilemma between ValueA and ValueB.',
        variables: { ValueA: 'high-a', ValueB: 'low-b' },
      });
    });

    it('generates unique ids across calls', () => {
      expectUniqueIds([buildScenario(), buildScenario(), buildScenario()]);
    });
  });

  describe('buildDomain', () => {
    it('returns a valid domain object with all required fields', () => {
      const domain = buildDomain();

      expect(domain).toMatchObject({
        name: 'test-domain',
        normalizedName: 'test-domain',
        defaultLevelPresetVersionId: null,
        defaultPreambleVersionId: null,
        defaultContextId: null,
      });
      expect(domain.createdAt).toBeInstanceOf(Date);
      expect(domain.updatedAt).toBeInstanceOf(Date);
    });

    it('generates unique ids across calls', () => {
      expectUniqueIds([buildDomain(), buildDomain(), buildDomain()]);
    });
  });

  const createdIds = {
    definitions: [] as string[],
    runs: [] as string[],
    scenarios: [] as string[],
    transcripts: [] as string[],
  };

  afterEach(async () => {
    for (const id of createdIds.transcripts) {
      await db.transcript.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdIds.scenarios) {
      await db.scenario.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdIds.runs) {
      await db.run.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdIds.definitions) {
      await db.definition.delete({ where: { id } }).catch(() => {});
    }
    createdIds.definitions = [];
    createdIds.runs = [];
    createdIds.scenarios = [];
    createdIds.transcripts = [];
  });

  describe.skipIf(!process.env.DATABASE_URL)('createTestEntities', () => {
    it('creates linked records in the database', async () => {
      const entities = await createTestEntities(db);

      createdIds.definitions.push(entities.definition.id);
      createdIds.runs.push(entities.run.id);
      createdIds.scenarios.push(entities.scenario.id);
      createdIds.transcripts.push(entities.transcript.id);

      expect(entities.run.definitionId).toBe(entities.definition.id);
      expect(entities.scenario.definitionId).toBe(entities.definition.id);
      expect(entities.transcript.runId).toBe(entities.run.id);
      expect(entities.transcript.scenarioId).toBe(entities.scenario.id);

      const persistedRun = await db.run.findUnique({
        where: { id: entities.run.id },
        include: { definition: true, transcripts: true },
      });
      expect(persistedRun?.definition.id).toBe(entities.definition.id);
      expect(persistedRun?.transcripts).toHaveLength(1);

      const persistedScenario = await db.scenario.findUnique({
        where: { id: entities.scenario.id },
        include: { definition: true, transcripts: true },
      });
      expect(persistedScenario?.definition.id).toBe(entities.definition.id);
      expect(persistedScenario?.transcripts).toHaveLength(1);

      const persistedTranscript = await db.transcript.findUnique({
        where: { id: entities.transcript.id },
        include: { run: true, scenario: true },
      });
      expect(persistedTranscript?.run.id).toBe(entities.run.id);
      expect(persistedTranscript?.scenario?.id).toBe(entities.scenario.id);
    });
  });
});
