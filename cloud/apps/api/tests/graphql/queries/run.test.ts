import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import type { Definition, Run, Transcript, Experiment, Scenario } from '@valuerank/db';
import { getAuthHeader } from '../../test-utils.js';

const app = createServer();

describe('GraphQL Run Query', () => {
  let testDefinition: Definition;
  let testRun: Run;
  let testTranscript: Transcript;

  beforeAll(async () => {
    // Create test definition
    testDefinition = await db.definition.create({
      data: {
        name: 'Run Test Definition',
        content: { schema_version: 1, preamble: 'Test' },
      },
    });

    // Create test run
    testRun = await db.run.create({
      data: {
        definitionId: testDefinition.id,
        status: 'COMPLETED',
        config: { models: ['gpt-4', 'claude-3'], samplePercentage: 50 },
        progress: { completed: 10, total: 10 },
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:30:00Z'),
      },
    });

    // Create test transcript
    testTranscript = await db.transcript.create({
      data: {
        runId: testRun.id,
        modelId: 'gpt-4',
        modelVersion: '0125-preview',
        content: { messages: [{ role: 'user', content: 'Hello' }] },
        turnCount: 2,
        tokenCount: 150,
        durationMs: 2500,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data in correct order
    await db.transcript.deleteMany({ where: { runId: testRun.id } });
    await db.run.deleteMany({ where: { id: testRun.id } });
    await db.definition.deleteMany({ where: { id: testDefinition.id } });
  });

  describe('run(id)', () => {
    it('returns run with all scalar fields', async () => {
      const query = `
        query GetRun($id: ID!) {
          run(id: $id) {
            id
            definitionId
            status
            config
            progress
            startedAt
            completedAt
            createdAt
            updatedAt
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: testRun.id } });

      if (response.status !== 200) {
        console.log('Response status:', response.status);
        console.log('Response body:', JSON.stringify(response.body, null, 2));
      }
      expect(response.status).toBe(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run).toMatchObject({
        id: testRun.id,
        definitionId: testDefinition.id,
        status: 'COMPLETED',
      });
      expect(response.body.data.run.config).toHaveProperty('models');
      expect(response.body.data.run.progress).toHaveProperty('completed', 10);
    });

    it('returns null for non-existent ID', async () => {
      const query = `
        query GetRun($id: ID!) {
          run(id: $id) {
            id
            status
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: 'nonexistent-id' } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run).toBeNull();
    });

    it('resolves definition relationship via DataLoader', async () => {
      const query = `
        query GetRunWithDefinition($id: ID!) {
          run(id: $id) {
            id
            definition {
              id
              name
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: testRun.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.definition).toMatchObject({
        id: testDefinition.id,
        name: 'Run Test Definition',
      });
    });

    it('resolves transcripts relationship', async () => {
      const query = `
        query GetRunWithTranscripts($id: ID!) {
          run(id: $id) {
            id
            transcripts {
              id
              modelId
              turnCount
              tokenCount
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: testRun.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.transcripts).toHaveLength(1);
      expect(response.body.data.run.transcripts[0]).toMatchObject({
        id: testTranscript.id,
        modelId: 'gpt-4',
        turnCount: 2,
        tokenCount: 150,
      });
    });

    it('filters transcripts by modelId', async () => {
      // Add another transcript with different model
      const otherTranscript = await db.transcript.create({
        data: {
          runId: testRun.id,
          modelId: 'claude-3',
          content: { messages: [] },
          turnCount: 1,
          tokenCount: 50,
          durationMs: 1000,
        },
      });

      const query = `
        query GetRunWithFilteredTranscripts($id: ID!, $modelId: String) {
          run(id: $id) {
            id
            transcripts(modelId: $modelId) {
              id
              modelId
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: testRun.id, modelId: 'gpt-4' } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.transcripts).toHaveLength(1);
      expect(response.body.data.run.transcripts[0].modelId).toBe('gpt-4');

      // Clean up
      await db.transcript.delete({ where: { id: otherTranscript.id } });
    });

    it('returns transcriptCount', async () => {
      const query = `
        query GetRunWithCount($id: ID!) {
          run(id: $id) {
            id
            transcriptCount
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: testRun.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.transcriptCount).toBe(1);
    });

    it('resolves nested definition and back to runs', async () => {
      const query = `
        query GetNestedRelations($id: ID!) {
          run(id: $id) {
            id
            definition {
              id
              runs {
                id
                status
              }
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: testRun.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.definition.runs).toContainEqual({
        id: testRun.id,
        status: 'COMPLETED',
      });
    });
  });

  describe('runs(definitionId, experimentId, status, limit, offset)', () => {
    let pendingRun: Run;
    let otherDefinition: Definition;

    beforeAll(async () => {
      // Create another definition for filter testing
      otherDefinition = await db.definition.create({
        data: {
          name: 'Other Definition',
          content: { schema_version: 1, preamble: 'Other' },
        },
      });

      // Create a pending run for the original definition
      pendingRun = await db.run.create({
        data: {
          definitionId: testDefinition.id,
          status: 'PENDING',
          config: { models: ['gpt-4'] },
        },
      });
    });

    afterAll(async () => {
      await db.run.deleteMany({ where: { id: pendingRun.id } });
      await db.definition.deleteMany({ where: { id: otherDefinition.id } });
    });

    it('returns list of runs', async () => {
      const query = `
        query ListRuns {
          runs {
            id
            status
            definitionId
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(Array.isArray(response.body.data.runs)).toBe(true);
      // Should include our test runs
      const ids = response.body.data.runs.map((r: { id: string }) => r.id);
      expect(ids).toContain(testRun.id);
    });

    it('filters by definitionId', async () => {
      const query = `
        query ListRunsByDefinition($definitionId: String) {
          runs(definitionId: $definitionId) {
            id
            definitionId
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: testDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      // All returned runs should be for our test definition
      for (const run of response.body.data.runs) {
        expect(run.definitionId).toBe(testDefinition.id);
      }
      // Should include both our test runs
      const ids = response.body.data.runs.map((r: { id: string }) => r.id);
      expect(ids).toContain(testRun.id);
      expect(ids).toContain(pendingRun.id);
    });

    it('filters by status', async () => {
      const query = `
        query ListRunsByStatus($status: String) {
          runs(status: $status) {
            id
            status
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { status: 'COMPLETED' } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      // All returned runs should have COMPLETED status
      for (const run of response.body.data.runs) {
        expect(run.status).toBe('COMPLETED');
      }
      // Should include our completed test run
      const ids = response.body.data.runs.map((r: { id: string }) => r.id);
      expect(ids).toContain(testRun.id);
      // Should NOT include our pending run
      expect(ids).not.toContain(pendingRun.id);
    });

    it('combines definitionId and status filters', async () => {
      const query = `
        query ListRunsWithFilters($definitionId: String, $status: String) {
          runs(definitionId: $definitionId, status: $status) {
            id
            status
            definitionId
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { definitionId: testDefinition.id, status: 'PENDING' },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      // Should only return the pending run for test definition
      expect(response.body.data.runs).toHaveLength(1);
      expect(response.body.data.runs[0]).toMatchObject({
        id: pendingRun.id,
        status: 'PENDING',
        definitionId: testDefinition.id,
      });
    });

    it('applies limit parameter', async () => {
      const query = `
        query ListRunsWithLimit($limit: Int) {
          runs(limit: $limit) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { limit: 1 } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.runs.length).toBeLessThanOrEqual(1);
    });

    it('applies offset parameter', async () => {
      // Create additional runs for offset testing
      const additionalRuns = await Promise.all([
        db.run.create({
          data: {
            definitionId: testDefinition.id,
            status: 'COMPLETED',
            config: { models: ['gpt-4'] },
            progress: { completed: 1, total: 1 },
          },
        }),
        db.run.create({
          data: {
            definitionId: testDefinition.id,
            status: 'COMPLETED',
            config: { models: ['gpt-4'] },
            progress: { completed: 1, total: 1 },
          },
        }),
      ]);

      const query = `
        query ListRunsWithOffset($definitionId: String, $limit: Int, $offset: Int) {
          runs(definitionId: $definitionId, limit: $limit, offset: $offset) {
            id
          }
        }
      `;

      // Get all runs for this definition
      const allResponse = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: testDefinition.id, limit: 100, offset: 0 } })
        .expect(200);

      // Get with offset
      const offsetResponse = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: testDefinition.id, limit: 100, offset: 1 } })
        .expect(200);

      expect(offsetResponse.body.errors).toBeUndefined();
      // We now have at least 3 runs (testRun + pendingRun + 2 additional)
      // offset=1 should return one fewer result
      expect(allResponse.body.data.runs.length).toBeGreaterThan(1);
      expect(offsetResponse.body.data.runs.length).toBe(
        allResponse.body.data.runs.length - 1
      );

      // Clean up additional runs
      await db.run.deleteMany({
        where: { id: { in: additionalRuns.map((r) => r.id) } },
      });
    });

    it('enforces max limit of 100', async () => {
      const query = `
        query ListRunsExceedLimit($limit: Int) {
          runs(limit: $limit) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { limit: 200 } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.runs.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Run with experiment relationship', () => {
    let experimentDef: Definition;
    let experiment: Experiment;
    let runWithExperiment: Run;

    beforeAll(async () => {
      experimentDef = await db.definition.create({
        data: {
          name: 'Experiment Test Def',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });

      experiment = await db.experiment.create({
        data: {
          name: 'Test Experiment',
          hypothesis: 'Testing experiment relationship',
        },
      });

      runWithExperiment = await db.run.create({
        data: {
          definitionId: experimentDef.id,
          experimentId: experiment.id,
          status: 'COMPLETED',
          config: { models: ['gpt-4'] },
        },
      });
    });

    afterAll(async () => {
      await db.run.deleteMany({ where: { id: runWithExperiment.id } });
      await db.experiment.deleteMany({ where: { id: experiment.id } });
      await db.definition.deleteMany({ where: { id: experimentDef.id } });
    });

    it('resolves experiment relationship', async () => {
      const query = `
        query GetRunWithExperiment($id: ID!) {
          run(id: $id) {
            id
            experiment {
              id
              name
              hypothesis
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: runWithExperiment.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.experiment).toMatchObject({
        id: experiment.id,
        name: 'Test Experiment',
        hypothesis: 'Testing experiment relationship',
      });
    });

    it('resolves experiment runs and runCount', async () => {
      const query = `
        query GetRunWithExperimentRuns($id: ID!) {
          run(id: $id) {
            id
            experiment {
              id
              runs {
                id
                status
              }
              runCount
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: runWithExperiment.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.experiment.runs).toContainEqual({
        id: runWithExperiment.id,
        status: 'COMPLETED',
      });
      expect(response.body.data.run.experiment.runCount).toBe(1);
    });

    it('returns null experiment for run without experiment', async () => {
      // Use the testRun from outer scope which has no experiment
      const query = `
        query GetRunWithExperiment($id: ID!) {
          run(id: $id) {
            id
            experimentId
            experiment {
              id
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: testRun.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.experimentId).toBeNull();
      expect(response.body.data.run.experiment).toBeNull();
    });
  });

  describe('Run selectedScenarios relationship', () => {
    let scenarioDef: Definition;
    let scenario: Scenario;
    let runWithScenario: Run;

    beforeAll(async () => {
      scenarioDef = await db.definition.create({
        data: {
          name: 'Scenario Test Def',
          content: { schema_version: 1, preamble: 'Test' },
        },
      });

      scenario = await db.scenario.create({
        data: {
          definitionId: scenarioDef.id,
          name: 'Test Scenario',
          content: { dilemma: 'Test dilemma content' },
        },
      });

      runWithScenario = await db.run.create({
        data: {
          definitionId: scenarioDef.id,
          status: 'RUNNING',
          config: { models: ['gpt-4'] },
        },
      });

      // Link scenario to run
      await db.runScenarioSelection.create({
        data: {
          runId: runWithScenario.id,
          scenarioId: scenario.id,
        },
      });
    });

    afterAll(async () => {
      await db.runScenarioSelection.deleteMany({ where: { runId: runWithScenario.id } });
      await db.run.deleteMany({ where: { id: runWithScenario.id } });
      await db.scenario.deleteMany({ where: { id: scenario.id } });
      await db.definition.deleteMany({ where: { id: scenarioDef.id } });
    });

    it('resolves selectedScenarios', async () => {
      const query = `
        query GetRunWithScenarios($id: ID!) {
          run(id: $id) {
            id
            selectedScenarios
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: runWithScenario.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.selectedScenarios).toContain(scenario.id);
    });
  });
});
