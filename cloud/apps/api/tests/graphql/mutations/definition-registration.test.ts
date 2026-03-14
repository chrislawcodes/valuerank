import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { db } from '@valuerank/db';
import { createServer } from '../../../src/server.js';
import { getAuthHeader } from '../../test-utils.js';

const app = createServer();

describe('Definition Mutation Registration', () => {
  const createdDefinitionIds: string[] = [];

  afterEach(async () => {
    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }
  });

  it('keeps the full definition mutation surface registered', async () => {
    const parent = await db.definition.create({
      data: {
        name: 'Registration Parent Definition',
        content: { schema_version: 2, preamble: 'Parent' },
      },
    });
    createdDefinitionIds.push(parent.id);

    const query = `
      query DefinitionMutationFields {
        __type(name: "Mutation") {
          fields {
            name
          }
        }
        parent: definition(id: "${parent.id}") {
          id
        }
      }
    `;

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();

    const names = new Set(
      (response.body.data.__type.fields as Array<{ name: string }>).map((field) => field.name)
    );

    expect(names.has('createDefinition')).toBe(true);
    expect(names.has('forkDefinition')).toBe(true);
    expect(names.has('updateDefinition')).toBe(true);
    expect(names.has('updateDefinitionContent')).toBe(true);
    expect(names.has('unforkDefinition')).toBe(true);
    expect(names.has('deleteDefinition')).toBe(true);
    expect(names.has('regenerateScenarios')).toBe(true);
    expect(names.has('cancelScenarioExpansion')).toBe(true);
  });
});
