/**
 * Integration tests for provider balance mutations.
 *
 * Tests setProviderBalance and syncProviderBalance against a real server and DB.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { db } from '@valuerank/db';
import { createServer } from '../../../src/server.js';
import { getAuthHeader, TEST_USER } from '../../test-utils.js';

const app = createServer();

const SET_PROVIDER_BALANCE_MUTATION = `
  mutation SetProviderBalance($providerId: String!, $balance: Float) {
    setProviderBalance(providerId: $providerId, balance: $balance) {
      id
      name
      balance
    }
  }
`;

const SYNC_PROVIDER_BALANCE_MUTATION = `
  mutation SyncProviderBalance($providerId: String!, $realBalance: Float!) {
    syncProviderBalance(providerId: $providerId, realBalance: $realBalance) {
      id
      providerId
      systemBalanceAtSync
      enteredBalance
      delta
      syncedAt
    }
  }
`;

describe('provider balance mutations', () => {
  let testProviderId: string;
  const createdSyncLogIds: string[] = [];

  beforeAll(async () => {
    await db.user.upsert({
      where: { id: TEST_USER.id },
      create: { id: TEST_USER.id, email: TEST_USER.email, passwordHash: 'test-hash' },
      update: {},
    });

    const provider = await db.llmProvider.upsert({
      where: { name: 'test-provider-balance' },
      create: { name: 'test-provider-balance', displayName: 'Test Provider Balance' },
      update: {},
    });
    testProviderId = provider.id;
  });

  afterEach(async () => {
    // Reset balance to null after each test
    await db.llmProvider.update({
      where: { id: testProviderId },
      data: { balance: null },
    });
    // Cleanup sync logs
    if (createdSyncLogIds.length > 0) {
      await db.providerBalanceSyncLog.deleteMany({
        where: { id: { in: createdSyncLogIds } },
      });
      createdSyncLogIds.length = 0;
    }
  });

  describe('setProviderBalance', () => {
    it('sets provider balance to a positive value', async () => {
      const res = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: SET_PROVIDER_BALANCE_MUTATION,
          variables: { providerId: testProviderId, balance: 50.0 },
        });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.setProviderBalance.balance).toBeCloseTo(50.0);

      const updated = await db.llmProvider.findUnique({ where: { id: testProviderId } });
      expect(updated?.balance?.toNumber()).toBeCloseTo(50.0);
    });

    it('sets provider balance to null (disables tracking)', async () => {
      // First set a balance
      await db.llmProvider.update({
        where: { id: testProviderId },
        data: { balance: 10.0 },
      });

      const res = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: SET_PROVIDER_BALANCE_MUTATION,
          variables: { providerId: testProviderId, balance: null },
        });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.setProviderBalance.balance).toBeNull();
    });

    it('rejects negative balance with a validation error', async () => {
      const res = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: SET_PROVIDER_BALANCE_MUTATION,
          variables: { providerId: testProviderId, balance: -1 },
        });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toMatch(/[Bb]alance/);
    });
  });

  describe('syncProviderBalance', () => {
    beforeAll(async () => {
      // Give the provider a starting balance of 7.50
      await db.llmProvider.update({
        where: { id: testProviderId },
        data: { balance: 7.5 },
      });
    });

    it('creates a sync log with correct delta and updates balance', async () => {
      const res = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: SYNC_PROVIDER_BALANCE_MUTATION,
          variables: { providerId: testProviderId, realBalance: 8.1 },
        });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();

      const syncLog = res.body.data.syncProviderBalance;
      createdSyncLogIds.push(syncLog.id);

      expect(syncLog.systemBalanceAtSync).toBeCloseTo(7.5);
      expect(syncLog.enteredBalance).toBeCloseTo(8.1);
      expect(syncLog.delta).toBeCloseTo(0.6);

      // Balance updated in DB
      const updated = await db.llmProvider.findUnique({ where: { id: testProviderId } });
      expect(updated?.balance?.toNumber()).toBeCloseTo(8.1);
    });

    it('rejects negative real balance with a validation error', async () => {
      const res = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: SYNC_PROVIDER_BALANCE_MUTATION,
          variables: { providerId: testProviderId, realBalance: -5 },
        });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toMatch(/[Bb]alance/);
    });

    it('handles sync when provider has no existing balance (defaults to 0)', async () => {
      // Temporarily clear balance
      await db.llmProvider.update({ where: { id: testProviderId }, data: { balance: null } });

      const res = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: SYNC_PROVIDER_BALANCE_MUTATION,
          variables: { providerId: testProviderId, realBalance: 25.0 },
        });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();

      const syncLog = res.body.data.syncProviderBalance;
      createdSyncLogIds.push(syncLog.id);

      expect(syncLog.systemBalanceAtSync).toBeCloseTo(0);
      expect(syncLog.enteredBalance).toBeCloseTo(25.0);
      expect(syncLog.delta).toBeCloseTo(25.0);
    });
  });
});
