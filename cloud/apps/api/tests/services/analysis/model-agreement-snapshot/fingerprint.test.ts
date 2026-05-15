import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@valuerank/db';
import { computeInputFingerprint } from '../../../../src/services/analysis/model-agreement-snapshot/fingerprint.js';

const shouldRun = process.env.DATABASE_URL != null && process.env.JWT_SECRET != null;

describe.skipIf(!shouldRun)('computeInputFingerprint', () => {
  const createdDomainIds: string[] = [];
  const createdDefinitionIds: string[] = [];
  const createdRunIds: string[] = [];

  beforeAll(async () => {
    const domain = await db.domain.create({
      data: {
        name: `Fingerprint Domain ${Date.now()}`,
        normalizedName: `fingerprint-domain-${Date.now()}`,
        defaultModelIds: [],
      },
    });
    createdDomainIds.push(domain.id);

    const definition = await db.definition.create({
      data: {
        name: `Fingerprint Definition ${Date.now()}`,
        domainId: domain.id,
        version: 1,
        content: {
          schema_version: 1,
          template: 'Test',
          dimensions: [],
        },
      },
    });
    createdDefinitionIds.push(definition.id);

    const runs = [
      {
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    ];

    for (const [index, runSpec] of runs.entries()) {
      const run = await db.run.create({
        data: {
          definitionId: definition.id,
          status: 'COMPLETED',
          config: {
            models: ['model-a', 'model-b'],
            temperature: null,
            definitionSnapshot: { version: 1 },
          },
          progress: { total: 3, completed: 3, failed: 0 },
          updatedAt: runSpec.updatedAt,
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          completedAt: runSpec.updatedAt,
          name: `Fingerprint Run ${index + 1}`,
        },
      });
      createdRunIds.push(run.id);
    }
  });

  afterAll(async () => {
    if (createdRunIds.length > 0) {
      await db.run.deleteMany({ where: { id: { in: createdRunIds } } });
      createdRunIds.length = 0;
    }

    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
      createdDefinitionIds.length = 0;
    }

    if (createdDomainIds.length > 0) {
      await db.domain.deleteMany({ where: { id: { in: createdDomainIds } } });
      createdDomainIds.length = 0;
    }
  });

  it('changes when runs are inserted, deleted, or updated', async () => {
    const domainId = createdDomainIds[0];
    const definitionId = createdDefinitionIds[0];
    if (domainId == null || definitionId == null) {
      throw new Error('Fingerprint test fixtures were not created');
    }

    const baseInput = {
      scope: 'DOMAIN' as const,
      signature: 'vnewtd',
      domainId,
      domainIds: [domainId],
      modelIds: ['model-a', 'model-b'],
    };

    const initial = await computeInputFingerprint(db, baseInput);
    expect(initial.sourceRunCount).toBe(3);
    expect(initial.sourceRunUpdatedAtSum).toBe(
      BigInt(Math.floor(Date.parse('2026-01-01T00:00:00.000Z') / 1000))
      + BigInt(Math.floor(Date.parse('2026-01-02T00:00:00.000Z') / 1000))
      + BigInt(Math.floor(Date.parse('2026-01-03T00:00:00.000Z') / 1000)),
    );

    const extraRun = await db.run.create({
      data: {
        definitionId,
        status: 'COMPLETED',
        config: {
          models: ['model-a', 'model-b'],
          temperature: null,
          definitionSnapshot: { version: 1 },
        },
        progress: { total: 3, completed: 3, failed: 0 },
        updatedAt: new Date('2026-01-04T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        completedAt: new Date('2026-01-04T00:00:00.000Z'),
        name: 'Fingerprint Run 4',
      },
    });
    createdRunIds.push(extraRun.id);

    const afterInsert = await computeInputFingerprint(db, baseInput);
    expect(afterInsert.sourceRunCount).toBe(4);
    expect(afterInsert.sourceRunUpdatedAtSum).not.toBe(initial.sourceRunUpdatedAtSum);

    const runToDelete = createdRunIds[0];
    expect(runToDelete).toBeDefined();
    if (runToDelete != null) {
      await db.run.delete({ where: { id: runToDelete } });
      createdRunIds.splice(createdRunIds.indexOf(runToDelete), 1);
    }

    const afterDelete = await computeInputFingerprint(db, baseInput);
    expect(afterDelete.sourceRunCount).toBe(3);
    expect(afterDelete.sourceRunUpdatedAtSum).not.toBe(afterInsert.sourceRunUpdatedAtSum);

    const olderRunId = createdRunIds[0];
    expect(olderRunId).toBeDefined();
    if (olderRunId != null) {
      await db.run.update({
        where: { id: olderRunId },
        data: {
          name: `Fingerprint Run Updated ${Date.now()}`,
        },
      });
    }

    const afterUpdate = await computeInputFingerprint(db, baseInput);
    expect(afterUpdate.sourceRunCount).toBe(3);
    expect(afterUpdate.sourceRunUpdatedAtSum).not.toBe(afterDelete.sourceRunUpdatedAtSum);
  });

  it('returns stable values across repeated reads with no DB changes', async () => {
    const domainId = createdDomainIds[0];
    if (domainId == null) {
      throw new Error('Fingerprint test fixtures were not created');
    }

    const baseInput = {
      scope: 'DOMAIN' as const,
      signature: 'vnewtd',
      domainId,
      domainIds: [domainId],
      modelIds: ['model-a', 'model-b'],
    };

    const first = await computeInputFingerprint(db, baseInput);
    const second = await computeInputFingerprint(db, baseInput);

    expect(second).toEqual(first);
  });
});
