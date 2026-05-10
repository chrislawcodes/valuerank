/**
 * Integration tests for Run mutations
 *
 * Tests startRun, pauseRun, resumeRun, cancelRun mutations.
 */

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import { getAuthHeader, TEST_USER } from '../../test-utils.js';

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
  const createdDomainIds: string[] = [];

  // Ensure test models exist as ACTIVE for model validation
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: TEST_USER.id },
      create: {
        id: TEST_USER.id,
        email: TEST_USER.email,
        passwordHash: 'test-hash',
      },
      update: {},
    });

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

    if (createdDomainIds.length > 0) {
      await db.domain.deleteMany({
        where: { id: { in: createdDomainIds } },
      });
      createdDomainIds.length = 0;
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

      // Non-empty runs are now created directly in RUNNING (see start.ts).
      // PENDING is reserved for empty (zero-probe) runs that take the empty-run
      // CAS shortcut to COMPLETED.
      expect(result.run.status).toBe('RUNNING');
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
      // Non-empty runs are now created directly in RUNNING (see start.ts).
      expect(dbRun?.status).toBe('RUNNING');
      expect(dbRun?.definitionId).toBe(definition.id);

      // Verify scenario selections
      const selections = await db.runScenarioSelection.findMany({
        where: { runId },
      });

      expect(selections.length).toBe(3);
    });

    it('persists an explicit runCategory from GraphQL input', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Test Definition Category',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      await db.scenario.create({
        data: {
          definitionId: definition.id,
          name: 'Scenario 1',
          content: { test: 1 },
        },
      });

      const mutation = `
        mutation StartRun($input: StartRunInput!) {
          startRun(input: $input) {
            run {
              id
              runCategory
            }
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
              runCategory: 'PILOT',
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.startRun.run.runCategory).toBe('PILOT');

      const runId = response.body.data.startRun.run.id;
      createdRunIds.push(runId);

      const persistedRun = await db.run.findUnique({
        where: { id: runId },
        select: { runCategory: true },
      });
      expect(persistedRun?.runCategory).toBe('PILOT');
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

    it('rejects requests that pass the removed launchMode input', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Definition for launchMode rejection',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation StartRun($input: StartRunInput!) {
          startRun(input: $input) { run { id } jobCount }
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
              launchMode: 'PAIRED_BATCH',
            },
          },
        });

      // GraphQL rejects unknown input fields with a 400 at the validation layer.
      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('launchMode');
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
          definitionSnapshot: {
            dimensions: [
              { name: 'Achievement' },
              { name: 'Benevolence_Dependability' },
            ],
            components: {
              value_first: { token: 'Achievement' },
              value_second: { token: 'Benevolence_Dependability' },
            },
            methodology: {
              presentation_order: 'A_first',
            },
          },
          decisionMetadata: {},
          content: { turns: [] },
          turnCount: 1,
          tokenCount: 25,
          durationMs: 100,
          summarizedAt: new Date(),
        },
      });

      const mutation = `
        mutation UpdateTranscriptDecision(
          $transcriptId: ID!
          $decisionState: String!
          $favoredValueKey: String
          $strength: String
        ) {
          updateTranscriptDecision(
            transcriptId: $transcriptId
            decisionState: $decisionState
            favoredValueKey: $favoredValueKey
            strength: $strength
          ) {
            id
            decisionMetadata
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
            decisionState: 'resolved',
            favoredValueKey: 'Achievement',
            strength: 'strong',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.updateTranscriptDecision.decisionMetadata).toMatchObject({
        manualOverride: {
          overriddenByUserId: expect.any(String),
          appliedDecision: {
            favoredValueKey: 'Achievement',
            opposedValueKey: 'Benevolence_Dependability',
            direction: 'favor_first',
            strength: 'strong',
          },
        },
      });
      expect(response.body.data.updateTranscriptDecision.runId).toBe(run.id);

      const updated = await db.transcript.findUnique({
        where: { id: transcript.id },
      });
      expect(updated?.decisionMetadata).toMatchObject({
        manualOverride: {
          appliedDecision: {
            favoredValueKey: 'Achievement',
            opposedValueKey: 'Benevolence_Dependability',
            direction: 'favor_first',
            strength: 'strong',
          },
        },
      });
    });

    it('returns validation error for invalid decisionState', async () => {
      const mutation = `
        mutation UpdateTranscriptDecision($transcriptId: ID!, $decisionState: String!) {
          updateTranscriptDecision(transcriptId: $transcriptId, decisionState: $decisionState) {
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
            decisionState: 'bogus-state',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('decisionState must be one of');
    });
  });
});
