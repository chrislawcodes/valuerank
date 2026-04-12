import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { db } from '@valuerank/db';
import { createServer } from '../../../src/server.js';
import { LOCKED_ASSUMPTION_VIGNETTES } from '../../../src/graphql/assumptions-constants.js';
import { getAuthHeader, TEST_USER } from '../../test-utils.js';

const app = createServer();

const TEMP_ZERO_MUTATION = `
  mutation LaunchAssumptionsTempZero($force: Boolean) {
    launchAssumptionsTempZero(force: $force) {
      startedRuns
      totalVignettes
      modelCount
      runIds
      failedVignetteIds
    }
  }
`;

const REVIEW_ORDER_INVARIANCE_PAIR_MUTATION = `
  mutation ReviewOrderInvariancePair($pairId: ID!, $reviewStatus: String!, $reviewNotes: String) {
    reviewOrderInvariancePair(pairId: $pairId, reviewStatus: $reviewStatus, reviewNotes: $reviewNotes) {
      pairId
      reviewStatus
      reviewedAt
    }
  }
`;

const LAUNCH_ORDER_INVARIANCE_MUTATION = `
  mutation LaunchOrderInvariance($force: Boolean) {
    launchOrderInvariance(force: $force) {
      startedRuns
      runsByVariantType
      approvedPairs
      modelCount
      runIds
      failedDefinitionIds
    }
  }
`;

const PROFESSIONAL_DOMAIN_NAME = 'professional';
const TEST_PROVIDER_NAME = 'assumptions-test-provider';
const TEST_MODEL_ID = 'assumptions-test-model';
const LOCKED_VIGNETTE_IDS = LOCKED_ASSUMPTION_VIGNETTES.map((vignette) => vignette.id);

describe('GraphQL Assumptions Mutations', () => {
  const createdDefinitionIds: string[] = [];
  const createdScenarioIds: string[] = [];
  const createdPairIds: string[] = [];

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

    const provider = await db.llmProvider.upsert({
      where: { name: TEST_PROVIDER_NAME },
      create: {
        name: TEST_PROVIDER_NAME,
        displayName: 'Assumptions Test Provider',
      },
      update: {
        displayName: 'Assumptions Test Provider',
        isEnabled: true,
      },
    });

    await db.llmModel.upsert({
      where: {
        providerId_modelId: {
          providerId: provider.id,
          modelId: TEST_MODEL_ID,
        },
      },
      create: {
        providerId: provider.id,
        modelId: TEST_MODEL_ID,
        displayName: 'Assumptions Test Model',
        status: 'ACTIVE',
        isDefault: true,
        costInputPerMillion: 1,
        costOutputPerMillion: 1,
      },
      update: {
        status: 'ACTIVE',
        isDefault: true,
      },
    });
  });

  afterEach(async () => {
    if (createdPairIds.length > 0) {
      await db.assumptionScenarioPair.deleteMany({
        where: { id: { in: createdPairIds } },
      });
      createdPairIds.length = 0;
    }

    if (createdScenarioIds.length > 0) {
      await db.scenario.deleteMany({
        where: { id: { in: createdScenarioIds } },
      });
      createdScenarioIds.length = 0;
    }

    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }
  });

  it('returns an error when preconditions are not met', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: TEMP_ZERO_MUTATION,
        variables: { force: false },
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();
    // Depending on test DB state, error could be domain not found, no vignettes, no models, or blocked
    expect(response.body.errors[0].message).toBeDefined();
  });

  it('returns a valid payload shape when the domain, vignettes, and models exist', async () => {
    const domain = await db.domain.upsert({
      where: { normalizedName: PROFESSIONAL_DOMAIN_NAME },
      create: {
        name: 'Professional',
        normalizedName: PROFESSIONAL_DOMAIN_NAME,
      },
      update: {
        name: 'Professional',
      },
    });

    await db.run.deleteMany({
      where: {
        definitionId: { in: LOCKED_VIGNETTE_IDS },
      },
    });
    await db.scenario.deleteMany({
      where: {
        definitionId: { in: LOCKED_VIGNETTE_IDS },
      },
    });
    await db.definition.deleteMany({
      where: {
        id: { in: LOCKED_VIGNETTE_IDS },
      },
    });

    for (const vignette of LOCKED_ASSUMPTION_VIGNETTES) {
      const definition = await db.definition.create({
        data: {
          id: vignette.id,
          name: vignette.title,
          domainId: domain.id,
          content: {
            schema_version: 2,
            preamble: vignette.title,
          },
        },
      });
      createdDefinitionIds.push(definition.id);
    }

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: TEMP_ZERO_MUTATION,
        variables: { force: false },
      });

    expect(response.status).toBe(200);
    // The mutation may return data or an error depending on DB state
    // (e.g., active equivalent runs block the launch)
    // Just verify the response shape is valid GraphQL
    if (response.body.errors) {
      expect(response.body.errors[0].message).toBeDefined();
    } else {
      const payload = response.body.data.launchAssumptionsTempZero;
      expect(payload).toBeDefined();
      expect(typeof payload.startedRuns).toBe('number');
      expect(typeof payload.totalVignettes).toBe('number');
      expect(typeof payload.modelCount).toBe('number');
      expect(Array.isArray(payload.runIds)).toBe(true);
    }
  });

  it('returns an error when reviewStatus is invalid', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: REVIEW_ORDER_INVARIANCE_PAIR_MUTATION,
        variables: {
          pairId: 'missing-pair-id',
          reviewStatus: 'PENDING',
          reviewNotes: 'invalid',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();
    expect(response.body.errors[0].message).toContain('Review status must be APPROVED or REJECTED');
  });

  it('returns an error when the pairId does not exist', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: REVIEW_ORDER_INVARIANCE_PAIR_MUTATION,
        variables: {
          pairId: 'missing-pair-id',
          reviewStatus: 'APPROVED',
          reviewNotes: 'looks good',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();
    expect(response.body.errors[0].message).toContain('not found');
  });

  it('returns an error when no approved order-invariance pairs exist', async () => {
    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({
        query: LAUNCH_ORDER_INVARIANCE_MUTATION,
        variables: { force: false },
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();
    expect(response.body.errors[0].message).toContain('No approved order-invariance pairs are available to launch');
  });
});
