/**
 * Domain Config Snapshot Service
 *
 * Ensures a DomainConfigSnapshot exists for the current domain configuration.
 * Uses fingerprint-based deduplication: identical configs return the same snapshot ID.
 */

import crypto from 'node:crypto';
import { db } from '@valuerank/db';
import type { Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('services:domain-config:snapshot');

type SnapshotClient = typeof db | Prisma.TransactionClient;

/**
 * Ensures a DomainConfigSnapshot exists for the current domain configuration.
 * If an identical snapshot already exists (same fingerprint), returns its ID.
 * Otherwise creates a new snapshot and returns its ID.
 *
 * @param domainId - The domain ID to snapshot
 * @param client - Optional transaction client; defaults to `db`
 * @returns The snapshot ID
 */
export async function ensureDomainConfigSnapshot(
  domainId: string,
  client: SnapshotClient = db,
): Promise<string> {
  // Fetch domain FK defaults
  const domain = await client.domain.findUnique({
    where: { id: domainId },
    select: {
      defaultPreambleVersionId: true,
      defaultLevelPresetVersionId: true,
      defaultContextId: true,
    },
  });

  if (!domain) {
    throw new Error(`Domain not found: ${domainId}`);
  }

  // Fetch latest ValueStatementVersion IDs for all statements in this domain
  const statements = await client.valueStatement.findMany({
    where: { domainId },
    select: {
      versions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true },
      },
    },
  });

  const valueStatementVersionIds = statements
    .map((s) => s.versions[0]?.id)
    .filter((id): id is string => id !== undefined)
    .sort();

  // Compute SHA256 fingerprint of canonical JSON
  // Keys are alphabetically ordered: c, l, p, vs
  const canonicalData = {
    c: domain.defaultContextId ?? null,
    l: domain.defaultLevelPresetVersionId ?? null,
    p: domain.defaultPreambleVersionId ?? null,
    vs: valueStatementVersionIds,
  };
  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalData))
    .digest('hex');

  // Upsert snapshot by (domainId, fingerprint) compound unique key
  const snapshot = await client.domainConfigSnapshot.upsert({
    where: {
      domainId_fingerprint: { domainId, fingerprint },
    },
    create: {
      domainId,
      preambleVersionId: domain.defaultPreambleVersionId,
      levelPresetVersionId: domain.defaultLevelPresetVersionId,
      contextId: domain.defaultContextId,
      valueStatementVersionIds,
      fingerprint,
    },
    update: {},
    select: { id: true },
  });

  log.debug('ensureDomainConfigSnapshot', {
    domainId,
    snapshotId: snapshot.id,
    fingerprint: fingerprint.slice(0, 8),
  });

  return snapshot.id;
}
