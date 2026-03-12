import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';

const app = createServer();

describe('GraphQL Domain Query Registration', () => {
  it('registers the expected domain query fields', async () => {
    const query = `
      query DomainQueryFields {
        __type(name: "Query") {
          fields {
            name
          }
        }
      }
    `;

    const response = await request(app)
      .post('/graphql')
      .send({ query })
      .expect(200);

    expect(response.body.errors).toBeUndefined();

    const fieldNames = new Set<string>(
      (response.body.data.__type.fields as Array<{ name: string }>).map((field) => field.name),
    );

    expect(fieldNames.has('domains')).toBe(true);
    expect(fieldNames.has('domain')).toBe(true);
    expect(fieldNames.has('domainTrialsPlan')).toBe(true);
    expect(fieldNames.has('domainTrialRunsStatus')).toBe(true);
    expect(fieldNames.has('domainAvailableSignatures')).toBe(true);
    expect(fieldNames.has('domainAnalysis')).toBe(true);
    expect(fieldNames.has('domainAnalysisValueDetail')).toBe(true);
    expect(fieldNames.has('domainAnalysisConditionTranscripts')).toBe(true);
  });

  it('registers the domain analysis result types', async () => {
    const query = `
      query DomainTypeFields {
        result: __type(name: "DomainAnalysisResult") {
          fields {
            name
          }
        }
        cluster: __type(name: "ClusterAnalysis") {
          fields {
            name
          }
        }
      }
    `;

    const response = await request(app)
      .post('/graphql')
      .send({ query })
      .expect(200);

    expect(response.body.errors).toBeUndefined();

    const resultFields = new Set<string>(
      (response.body.data.result.fields as Array<{ name: string }>).map((field) => field.name),
    );
    const clusterFields = new Set<string>(
      (response.body.data.cluster.fields as Array<{ name: string }>).map((field) => field.name),
    );

    expect(resultFields.has('models')).toBe(true);
    expect(resultFields.has('rankingShapeBenchmarks')).toBe(true);
    expect(resultFields.has('clusterAnalysis')).toBe(true);
    expect(clusterFields.has('clusters')).toBe(true);
    expect(clusterFields.has('faultLinesByPair')).toBe(true);
    expect(clusterFields.has('defaultPair')).toBe(true);
  });
});
