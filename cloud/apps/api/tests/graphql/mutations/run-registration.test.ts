import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { getAuthHeader } from '../../test-utils.js';

const app = createServer();

describe('Run Mutation Registration', () => {
  it('keeps the full run mutation surface registered', async () => {
    const query = `
      query MutationFieldNames {
        __type(name: "Mutation") {
          fields {
            name
          }
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

    expect(names.has('startRun')).toBe(true);
    expect(names.has('pauseRun')).toBe(true);
    expect(names.has('resumeRun')).toBe(true);
    expect(names.has('cancelRun')).toBe(true);
    expect(names.has('recoverRun')).toBe(true);
    expect(names.has('triggerRecovery')).toBe(true);
    expect(names.has('deleteRun')).toBe(true);
    expect(names.has('updateRun')).toBe(true);
    expect(names.has('updateTranscriptDecision')).toBe(true);
    expect(names.has('cancelSummarization')).toBe(true);
    expect(names.has('restartSummarization')).toBe(true);
  });
});
