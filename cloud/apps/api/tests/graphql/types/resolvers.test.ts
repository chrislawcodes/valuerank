import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import type { Definition, Run, Transcript, Scenario } from '@valuerank/db';
import { getAuthHeader } from '../../test-utils.js';

const app = createServer();

describe('GraphQL Type Resolvers', () => {
  let testDefinition: Definition;
  let testScenario: Scenario;
  let testRun: Run;
  let testTranscript: Transcript;

  beforeAll(async () => {
    // Create test definition
    testDefinition = await db.definition.create({
      data: {
        name: 'Resolver Test Definition',
        content: { schema_version: 1, preamble: 'Test' },
      },
    });

    // Create test scenario
    testScenario = await db.scenario.create({
      data: {
        definitionId: testDefinition.id,
        name: 'Test Scenario',
        content: { dilemma: 'Test content' },
      },
    });

    // Create test run
    testRun = await db.run.create({
      data: {
        definitionId: testDefinition.id,
        status: 'COMPLETED',
        config: { models: ['gpt-4'] },
      },
    });

    // Create test transcript with scenario link
    testTranscript = await db.transcript.create({
      data: {
        runId: testRun.id,
        scenarioId: testScenario.id,
        modelId: 'gpt-4',
        content: { messages: [] },
        turnCount: 1,
        tokenCount: 100,
        durationMs: 1000,
      },
    });
  });

  afterAll(async () => {
    await db.transcript.deleteMany({ where: { id: testTranscript.id } });
    await db.run.deleteMany({ where: { id: testRun.id } });
    await db.scenario.deleteMany({ where: { id: testScenario.id } });
    await db.definition.deleteMany({ where: { id: testDefinition.id } });
  });

  describe('Transcript resolvers', () => {
    it('resolves transcript.run relationship', async () => {
      const query = `
        query GetRunWithTranscripts($id: ID!) {
          run(id: $id) {
            transcripts {
              id
              run {
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
      expect(response.body.data.run.transcripts[0].run).toMatchObject({
        id: testRun.id,
        status: 'COMPLETED',
      });
    });

    it('resolves transcript.scenario relationship', async () => {
      const query = `
        query GetRunWithTranscripts($id: ID!) {
          run(id: $id) {
            transcripts {
              id
              scenario {
                id
                name
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
      expect(response.body.data.run.transcripts[0].scenario).toMatchObject({
        id: testScenario.id,
        name: 'Test Scenario',
      });
    });
  });

  describe('Scenario resolvers', () => {
    it('resolves scenario.definition relationship', async () => {
      const query = `
        query GetRunWithTranscripts($id: ID!) {
          run(id: $id) {
            transcripts {
              scenario {
                id
                definition {
                  id
                  name
                }
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
      expect(response.body.data.run.transcripts[0].scenario.definition).toMatchObject({
        id: testDefinition.id,
        name: 'Resolver Test Definition',
      });
    });
  });

  describe('Definition resolvers', () => {
    it('resolves definition.scenarios relationship', async () => {
      const query = `
        query GetDefinitionWithScenarios($id: ID!) {
          definition(id: $id) {
            id
            name
            scenarios {
              id
              name
              content
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: testDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition.scenarios).toHaveLength(1);
      expect(response.body.data.definition.scenarios[0]).toMatchObject({
        id: testScenario.id,
        name: 'Test Scenario',
      });
    });

    it('returns empty scenarios array for definition without scenarios', async () => {
      // Create a definition without scenarios
      const emptyDef = await db.definition.create({
        data: {
          name: 'No Scenarios Definition',
          content: { schema_version: 1 },
        },
      });

      try {
        const query = `
          query GetDefinitionWithScenarios($id: ID!) {
            definition(id: $id) {
              id
              scenarios {
                id
              }
            }
          }
        `;

        const response = await request(app)
          .post('/graphql')
          .set('Authorization', getAuthHeader())
          .send({ query, variables: { id: emptyDef.id } })
          .expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.definition.scenarios).toEqual([]);
      } finally {
        await db.definition.delete({ where: { id: emptyDef.id } });
      }
    });
  });
});
