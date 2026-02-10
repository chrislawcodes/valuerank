/**
 * Integration tests for Run mutations
 *
 * Tests startRun, pauseRun, resumeRun, cancelRun mutations.
 */

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import { getAuthHeader } from '../../test-utils.js';

// Mock PgBoss
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  })),
  createBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  startBoss: vi.fn().mockResolvedValue(undefined),
  stopBoss: vi.fn().mockResolvedValue(undefined),
  isBossRunning: vi.fn().mockReturnValue(false),
}));

const app = createServer();

describe('GraphQL Run Mutations', () => {
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];

  // Ensure test models exist as ACTIVE for model validation
  beforeAll(async () => {
    const testProvider = await db.llmProvider.upsert({
      where: { name: 'test-provider-run-mutation' },
      create: { name: 'test-provider-run-mutation', displayName: 'Test Provider' },
      update: {},
    });
    for (const modelId of ['gpt-4', 'claude-3']) {
      await db.llmModel.upsert({
        where: { providerId_modelId: { providerId: testProvider.id, modelId } },
        create: { modelId, displayName: modelId, providerId: testProvider.id, status: 'ACTIVE', costInputPerMillion: 1.0, costOutputPerMillion: 2.0 },
        update: { status: 'ACTIVE' },
      });
    }
  });

  afterEach(async () => {
    // Clean up runs first
    if (createdRunIds.length > 0) {
      await db.transcript.deleteMany({
        where: { runId: { in: createdRunIds } },
      });
      await db.analysisResult.deleteMany({
        where: { runId: { in: createdRunIds } },
      });
      await db.runScenarioSelection.deleteMany({
        where: { runId: { in: createdRunIds } },
      });
      await db.run.deleteMany({
        where: { id: { in: createdRunIds } },
      });
      createdRunIds.length = 0;
    }

    // Clean up definitions (cascades scenarios)
    if (createdDefinitionIds.length > 0) {
      await db.scenario.deleteMany({
        where: { definitionId: { in: createdDefinitionIds } },
      });
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }
  });

  describe('startRun', () => {
    it('creates run with authenticated request', async () => {
      // Create definition with scenarios
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition for StartRun',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      await db.scenario.createMany({
        data: [
          { definitionId: definition.id, name: 'Scenario 1', content: { test: 1 } },
          { definitionId: definition.id, name: 'Scenario 2', content: { test: 2 } },
        ],
      });

      const mutation = `
        mutation StartRun($input: StartRunInput!) {
          startRun(input: $input) {
            run {
              id
              status
              definition {
                id
                name
              }
              progress
            }
            jobCount
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            input: {
              definitionId: definition.id,
              models: ['gpt-4', 'claude-3'],
            },
          },
        });

      if (response.status !== 200 || response.body.errors) {
        console.log('Response:', JSON.stringify(response.body, null, 2));
      }
      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const result = response.body.data.startRun;
      createdRunIds.push(result.run.id);

      expect(result.run.status).toBe('PENDING');
      expect(result.run.definition.id).toBe(definition.id);
      expect(result.run.definition.name).toBe('Test Definition for StartRun');
      // progress is JSON, access as object
      expect(result.run.progress.total).toBe(4); // 2 scenarios × 2 models
      expect(result.run.progress.completed).toBe(0);
      expect(result.run.progress.failed).toBe(0);
      expect(result.jobCount).toBe(4);
    });

    it('returns error for unauthenticated request', async () => {
      // Create definition with scenarios
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition Unauth',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      await db.scenario.create({
        data: {
          definitionId: definition.id,
          name: 'Test Scenario',
          content: { test: 1 },
        },
      });

      const mutation = `
        mutation StartRun($input: StartRunInput!) {
          startRun(input: $input) {
            run {
              id
            }
            jobCount
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        // No Authorization header
        .send({
          query: mutation,
          variables: {
            input: {
              definitionId: definition.id,
              models: ['gpt-4'],
            },
          },
        });

      // Auth middleware returns 401 for unauthenticated requests
      expect(response.status).toBe(401);
    });

    it('creates run and scenario selections in database', async () => {
      // Create definition with scenarios
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition DB Check',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      await db.scenario.createMany({
        data: [
          { definitionId: definition.id, name: 'Scenario 1', content: { test: 1 } },
          { definitionId: definition.id, name: 'Scenario 2', content: { test: 2 } },
          { definitionId: definition.id, name: 'Scenario 3', content: { test: 3 } },
        ],
      });

      const mutation = `
        mutation StartRun($input: StartRunInput!) {
          startRun(input: $input) {
            run {
              id
            }
            jobCount
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            input: {
              definitionId: definition.id,
              models: ['gpt-4'],
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const runId = response.body.data.startRun.run.id;
      createdRunIds.push(runId);

      // Verify run in database
      const dbRun = await db.run.findUnique({
        where: { id: runId },
      });

      expect(dbRun).toBeDefined();
      expect(dbRun?.status).toBe('PENDING');
      expect(dbRun?.definitionId).toBe(definition.id);

      // Verify scenario selections
      const selections = await db.runScenarioSelection.findMany({
        where: { runId },
      });

      expect(selections.length).toBe(3);
    });

    it('returns error for non-existent definition', async () => {
      const mutation = `
        mutation StartRun($input: StartRunInput!) {
          startRun(input: $input) {
            run {
              id
            }
            jobCount
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            input: {
              definitionId: 'non-existent-definition-id',
              models: ['gpt-4'],
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('not found');
    });

    it('returns error for empty models list', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition Empty Models',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      await db.scenario.create({
        data: {
          definitionId: definition.id,
          name: 'Test Scenario',
          content: { test: 1 },
        },
      });

      const mutation = `
        mutation StartRun($input: StartRunInput!) {
          startRun(input: $input) {
            run {
              id
            }
            jobCount
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            input: {
              definitionId: definition.id,
              models: [],
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('At least one model');
    });

    it('supports samplePercentage parameter', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition Sampling',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      // Create 10 scenarios
      const scenarioData = Array.from({ length: 10 }, (_, i) => ({
        definitionId: definition.id,
        name: `Scenario ${i + 1}`,
        content: { test: i + 1 },
      }));
      await db.scenario.createMany({ data: scenarioData });

      const mutation = `
        mutation StartRun($input: StartRunInput!) {
          startRun(input: $input) {
            run {
              id
              progress
            }
            jobCount
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            input: {
              definitionId: definition.id,
              models: ['gpt-4'],
              samplePercentage: 50,
              sampleSeed: 42,
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const result = response.body.data.startRun;
      createdRunIds.push(result.run.id);

      // 50% of 10 = 5 scenarios × 1 model = 5 jobs
      expect(result.run.progress.total).toBe(5);
      expect(result.jobCount).toBe(5);
    });

    it('supports priority parameter', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition Priority',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      await db.scenario.create({
        data: {
          definitionId: definition.id,
          name: 'Test Scenario',
          content: { test: 1 },
        },
      });

      const mutation = `
        mutation StartRun($input: StartRunInput!) {
          startRun(input: $input) {
            run {
              id
              config
            }
            jobCount
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            input: {
              definitionId: definition.id,
              models: ['gpt-4'],
              priority: 'HIGH',
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const result = response.body.data.startRun;
      createdRunIds.push(result.run.id);

      // Verify config includes priority
      expect(result.run.config.priority).toBe('HIGH');
    });

    it('returns error for definition with no scenarios', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Empty Definition',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation StartRun($input: StartRunInput!) {
          startRun(input: $input) {
            run {
              id
            }
            jobCount
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            input: {
              definitionId: definition.id,
              models: ['gpt-4'],
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('no scenarios');
    });
  });

  describe('updateTranscriptDecision', () => {
    it('updates transcript decision code and returns transcript', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition for Transcript Decision Update',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      const scenario = await db.scenario.create({
        data: {
          definitionId: definition.id,
          name: 'Scenario 1',
          content: { test: 1 },
        },
      });

      const run = await db.run.create({
        data: {
          definitionId: definition.id,
          status: 'COMPLETED',
          config: { models: ['gpt-4'] },
          progress: { total: 1, completed: 1, failed: 0 },
        },
      });
      createdRunIds.push(run.id);

      const transcript = await db.transcript.create({
        data: {
          runId: run.id,
          scenarioId: scenario.id,
          modelId: 'gpt-4',
          content: { turns: [] },
          decisionCode: 'other',
          turnCount: 1,
          tokenCount: 25,
          durationMs: 100,
          summarizedAt: new Date(),
        },
      });

      const mutation = `
        mutation UpdateTranscriptDecision($transcriptId: ID!, $decisionCode: String!) {
          updateTranscriptDecision(transcriptId: $transcriptId, decisionCode: $decisionCode) {
            id
            decisionCode
            runId
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            transcriptId: transcript.id,
            decisionCode: '4',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.updateTranscriptDecision.decisionCode).toBe('4');
      expect(response.body.data.updateTranscriptDecision.runId).toBe(run.id);

      const updated = await db.transcript.findUnique({
        where: { id: transcript.id },
      });
      expect(updated?.decisionCode).toBe('4');
    });

    it('returns validation error for unsupported decision code', async () => {
      const mutation = `
        mutation UpdateTranscriptDecision($transcriptId: ID!, $decisionCode: String!) {
          updateTranscriptDecision(transcriptId: $transcriptId, decisionCode: $decisionCode) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            transcriptId: 'non-existent-transcript',
            decisionCode: 'other',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('decisionCode must be one of');
    });
  });
});
