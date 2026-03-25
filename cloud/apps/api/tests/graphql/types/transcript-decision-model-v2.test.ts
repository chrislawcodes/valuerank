import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { db } from '@valuerank/db';
import type { Express } from 'express';
import { TEST_USER, getAuthHeader } from '../../test-utils.js';

let app: Express;

describe('Transcript decisionModelV2 GraphQL field', () => {
  const createdIds = {
    definition: '' as string,
    run: '' as string,
    scenario: '' as string,
    transcript: '' as string,
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost/test';
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? 'test-secret-that-is-at-least-32-characters-long';
    process.env.DECISION_MODEL_V2 = 'true';

    vi.resetModules();

    const { createServer } = await import('../../../src/server.js');
    app = createServer();

    await db.user.upsert({
      where: { id: TEST_USER.id },
      create: {
        id: TEST_USER.id,
        email: TEST_USER.email,
        passwordHash: 'test-hash',
      },
      update: {},
    });
  });

  afterAll(async () => {
    if (createdIds.transcript) {
      await db.transcript.deleteMany({ where: { id: createdIds.transcript } });
      createdIds.transcript = '';
    }
    if (createdIds.scenario) {
      await db.scenario.deleteMany({ where: { id: createdIds.scenario } });
      createdIds.scenario = '';
    }
    if (createdIds.run) {
      await db.run.deleteMany({ where: { id: createdIds.run } });
      createdIds.run = '';
    }
    if (createdIds.definition) {
      await db.definition.deleteMany({ where: { id: createdIds.definition } });
      createdIds.definition = '';
    }
    await db.user.deleteMany({ where: { id: TEST_USER.id } });
  });

  it('exposes the canonical decision envelope when the feature flag is enabled', async () => {
    const definition = await db.definition.create({
      data: {
        name: `Transcript V2 Definition ${Date.now()}`,
        content: {
          schema_version: 1,
          dimensions: [
            { name: 'Achievement' },
            { name: 'Benevolence_Dependability' },
          ],
        },
      },
    });
    createdIds.definition = definition.id;

    const run = await db.run.create({
      data: {
        definitionId: definition.id,
        status: 'COMPLETED',
        config: { models: ['test-model'] },
      },
    });
    createdIds.run = run.id;

    const scenario = await db.scenario.create({
      data: {
        definitionId: definition.id,
        name: 'Transcript V2 Scenario',
        orientationFlipped: true,
        content: { dimensions: { stakes: 'high' } },
      },
    });
    createdIds.scenario = scenario.id;

    const transcript = await db.transcript.create({
      data: {
        runId: run.id,
        scenarioId: scenario.id,
        modelId: 'test-model',
        decisionCode: '5',
        decisionCodeSource: 'deterministic',
        decisionMetadata: {
          matchedLabel: 'Strongly support taking the job with trust from other people',
          parseClass: 'exact',
          parsePath: 'text_label_leading',
          parserVersion: 'job-choice-v2',
          responseExcerpt: 'Level of Support: Strongly support taking the job with trust from other people',
        },
        definitionSnapshot: {
          dimensions: [
            { name: 'Achievement' },
            { name: 'Benevolence_Dependability' },
          ],
          methodology: {
            presentation_order: 'B_first',
          },
        },
        content: { turns: [] },
        turnCount: 1,
        tokenCount: 42,
        durationMs: 1000,
      },
    });
    createdIds.transcript = transcript.id;

    const query = `
      query TranscriptDecisionModelV2($runId: ID!) {
        run(id: $runId) {
          transcripts {
            id
            decisionModelV2
          }
        }
      }
    `;

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query, variables: { runId: run.id } })
      .expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.run.transcripts[0].decisionModelV2).toMatchObject({
      canonical: {
        favoredValueKey: 'Benevolence_Dependability',
        opposedValueKey: 'Achievement',
        direction: 'favor_first',
        strength: 'strong',
        normalizationApplied: false,
        normalizationReason: null,
        source: 'deterministic',
      },
      legacy: {
        rawScore: 5,
        canonicalScore: 5,
      },
    });
  });
});
