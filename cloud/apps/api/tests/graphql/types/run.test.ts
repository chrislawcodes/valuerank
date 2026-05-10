import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import { getAuthHeader, TEST_USER } from '../../test-utils.js';

const app = createServer();

function makePairedContent(valueFirst: string, valueSecond: string) {
  return {
    components: {
      value_first: { token: valueFirst },
      value_second: { token: valueSecond },
    },
  };
}

async function createRunWithSignature(params: {
  definitionId: string;
  definitionVersion: number;
  temperature: number;
  createdAt: Date;
  status?: string;
}) {
  const { definitionId, definitionVersion, temperature, createdAt, status = 'COMPLETED' } = params;
  return db.run.create({
    data: {
      definitionId,
      status,
      runCategory: 'PRODUCTION',
      config: {
        definitionSnapshot: {
          _meta: { definitionVersion },
        },
        temperature,
      },
      createdAt,
      completedAt: createdAt,
    },
  });
}

describe('GraphQL Run mirroredRuns resolver', () => {
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
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: TEST_USER.id } });
  });

  it('returns matching mirrored runs ordered by newest first', async () => {
    const domain = await db.domain.create({
      data: { name: 'Mirrored Runs Domain', normalizedName: 'mirrored-runs-domain' },
    });
    const definitionA = await db.definition.create({
      data: {
        domainId: domain.id,
        name: 'Achievement -> Benevolence',
        content: makePairedContent('achievement', 'benevolence_dependability'),
      },
    });
    const definitionB = await db.definition.create({
      data: {
        domainId: domain.id,
        name: 'Benevolence -> Achievement',
        content: makePairedContent('benevolence_dependability', 'achievement'),
      },
    });

    const currentRun = await createRunWithSignature({
      definitionId: definitionA.id,
      definitionVersion: 1,
      temperature: 0.7,
      createdAt: new Date('2024-01-01T10:00:00Z'),
    });
    const olderMatch = await createRunWithSignature({
      definitionId: definitionB.id,
      definitionVersion: 1,
      temperature: 0.7,
      createdAt: new Date('2024-01-01T09:00:00Z'),
    });
    const newerMatch = await createRunWithSignature({
      definitionId: definitionB.id,
      definitionVersion: 1,
      temperature: 0.7,
      createdAt: new Date('2024-01-01T11:00:00Z'),
    });

    try {
      const query = `
        query GetRun($id: ID!) {
          run(id: $id) {
            id
            mirroredRuns {
              id
              status
              createdAt
              definitionId
              config
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: currentRun.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.mirroredRuns).toHaveLength(2);
      expect(response.body.data.run.mirroredRuns.map((run: { id: string }) => run.id)).toEqual([
        newerMatch.id,
        olderMatch.id,
      ]);
    } finally {
      await db.run.deleteMany({ where: { id: { in: [currentRun.id, olderMatch.id, newerMatch.id] } } });
      await db.definition.deleteMany({ where: { id: { in: [definitionA.id, definitionB.id] } } });
      await db.domain.delete({ where: { id: domain.id } });
    }
  });

  it('returns an empty array for a non-paired run', async () => {
    const definition = await db.definition.create({
      data: {
        name: 'Single Definition',
        content: { schema_version: 1 },
      },
    });
    const run = await createRunWithSignature({
      definitionId: definition.id,
      definitionVersion: 1,
      temperature: 0.5,
      createdAt: new Date('2024-01-02T10:00:00Z'),
    });

    try {
      const query = `
        query GetRun($id: ID!) {
          run(id: $id) {
            mirroredRuns {
              id
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: run.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.mirroredRuns).toEqual([]);
    } finally {
      await db.run.delete({ where: { id: run.id } });
      await db.definition.delete({ where: { id: definition.id } });
    }
  });

  it('skips deleted runs, other domains, and non-matching signatures', async () => {
    const primaryDomain = await db.domain.create({
      data: { name: 'Primary Domain', normalizedName: 'primary-domain' },
    });
    const otherDomain = await db.domain.create({
      data: { name: 'Other Domain', normalizedName: 'other-domain' },
    });

    const definitionA = await db.definition.create({
      data: {
        domainId: primaryDomain.id,
        name: 'Primary Current',
        content: makePairedContent('achievement', 'benevolence_dependability'),
      },
    });
    const matchingDefinition = await db.definition.create({
      data: {
        domainId: primaryDomain.id,
        name: 'Primary Companion',
        content: makePairedContent('benevolence_dependability', 'achievement'),
      },
    });
    const otherDomainDefinition = await db.definition.create({
      data: {
        domainId: otherDomain.id,
        name: 'Other Companion',
        content: makePairedContent('benevolence_dependability', 'achievement'),
      },
    });

    const currentRun = await createRunWithSignature({
      definitionId: definitionA.id,
      definitionVersion: 1,
      temperature: 0.5,
      createdAt: new Date('2024-01-03T10:00:00Z'),
    });
    const includedRun = await createRunWithSignature({
      definitionId: matchingDefinition.id,
      definitionVersion: 1,
      temperature: 0.5,
      createdAt: new Date('2024-01-03T11:00:00Z'),
    });
    const deletedRun = await createRunWithSignature({
      definitionId: matchingDefinition.id,
      definitionVersion: 1,
      temperature: 0.5,
      createdAt: new Date('2024-01-03T09:00:00Z'),
    });
    await db.run.update({
      where: { id: deletedRun.id },
      data: { deletedAt: new Date('2024-01-03T12:00:00Z') },
    });
    const wrongSignatureRun = await createRunWithSignature({
      definitionId: matchingDefinition.id,
      definitionVersion: 2,
      temperature: 0.5,
      createdAt: new Date('2024-01-03T12:30:00Z'),
    });
    const otherDomainRun = await createRunWithSignature({
      definitionId: otherDomainDefinition.id,
      definitionVersion: 1,
      temperature: 0.5,
      createdAt: new Date('2024-01-03T13:00:00Z'),
    });

    try {
      const query = `
        query GetRun($id: ID!) {
          run(id: $id) {
            mirroredRuns {
              id
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: currentRun.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.mirroredRuns).toEqual([
        { id: includedRun.id },
      ]);
    } finally {
      await db.run.deleteMany({
        where: {
          id: {
            in: [
              currentRun.id,
              includedRun.id,
              deletedRun.id,
              wrongSignatureRun.id,
              otherDomainRun.id,
            ],
          },
        },
      });
      await db.definition.deleteMany({
        where: {
          id: {
            in: [
              definitionA.id,
              matchingDefinition.id,
              otherDomainDefinition.id,
            ],
          },
        },
      });
      await db.domain.deleteMany({
        where: {
          id: { in: [primaryDomain.id, otherDomain.id] },
        },
      });
    }
  });
});
