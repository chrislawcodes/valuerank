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
    await db.llmProvider.update({
      where: { id: testProviderId },
      data: { balance: null },
    });
    await db.providerBalanceSyncLog.deleteMany({
      where: { providerId: testProviderId },
    });
  });

  describe('setProviderBalance', () => {
    it('creates a sync log when balance changes', async () => {
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

      const syncLog = await db.providerBalanceSyncLog.findFirst({
        where: { providerId: testProviderId },
        orderBy: { syncedAt: 'desc' },
      });

      expect(syncLog).not.toBeNull();
      expect(syncLog?.systemBalanceAtSync.toNumber()).toBeCloseTo(0);
      expect(syncLog?.enteredBalance.toNumber()).toBeCloseTo(50.0);
      expect(syncLog?.delta.toNumber()).toBeCloseTo(50.0);
    });

    it('uses zero as the system balance when setting from null', async () => {
      await db.llmProvider.update({
        where: { id: testProviderId },
        data: { balance: null },
      });

      const res = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: SET_PROVIDER_BALANCE_MUTATION,
          variables: { providerId: testProviderId, balance: 100.0 },
        });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.setProviderBalance.balance).toBeCloseTo(100.0);

      const updated = await db.llmProvider.findUnique({ where: { id: testProviderId } });
      expect(updated?.balance?.toNumber()).toBeCloseTo(100.0);

      const syncLog = await db.providerBalanceSyncLog.findFirst({
        where: { providerId: testProviderId },
        orderBy: { syncedAt: 'desc' },
      });

      expect(syncLog).not.toBeNull();
      expect(syncLog?.systemBalanceAtSync.toNumber()).toBeCloseTo(0);
      expect(syncLog?.enteredBalance.toNumber()).toBeCloseTo(100.0);
      expect(syncLog?.delta.toNumber()).toBeCloseTo(100.0);
    });

    it('does not create a sync log when the balance is unchanged', async () => {
      const initialRes = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: SET_PROVIDER_BALANCE_MUTATION,
          variables: { providerId: testProviderId, balance: 25.0 },
        });

      expect(initialRes.status).toBe(200);
      expect(initialRes.body.errors).toBeUndefined();
      expect(initialRes.body.data.setProviderBalance.balance).toBeCloseTo(25.0);

      const countBefore = await db.providerBalanceSyncLog.count({
        where: { providerId: testProviderId },
      });

      const res = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: SET_PROVIDER_BALANCE_MUTATION,
          variables: { providerId: testProviderId, balance: 25.0 },
        });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.setProviderBalance.balance).toBeCloseTo(25.0);

      const countAfter = await db.providerBalanceSyncLog.count({
        where: { providerId: testProviderId },
      });

      expect(countAfter).toBe(countBefore);

      const updated = await db.llmProvider.findUnique({ where: { id: testProviderId } });
      expect(updated?.balance?.toNumber()).toBeCloseTo(25.0);
    });

    it('does not create a sync log when setting balance to null', async () => {
      await db.llmProvider.update({
        where: { id: testProviderId },
        data: { balance: 30.0 },
      });

      const countBefore = await db.providerBalanceSyncLog.count({
        where: { providerId: testProviderId },
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

      const countAfter = await db.providerBalanceSyncLog.count({
        where: { providerId: testProviderId },
      });

      expect(countAfter).toBe(countBefore);

      const updated = await db.llmProvider.findUnique({ where: { id: testProviderId } });
      expect(updated?.balance).toBeNull();
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

    it('returns a not found error for a missing provider', async () => {
      const res = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: SET_PROVIDER_BALANCE_MUTATION,
          variables: { providerId: 'missing-provider-id', balance: 12.5 },
        });

      expect(res.status).toBe(200);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors[0].message).toContain('not found');
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
