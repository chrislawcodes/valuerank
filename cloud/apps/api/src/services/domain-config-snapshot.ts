/**
 * Domain Config Snapshot Service
 *
 * Captures the current domain configuration (preamble version, level preset version,
 * context, value statement versions) into an immutable DomainConfigSnapshot record.
 *
 * Identical configs produce the same fingerprint — the upsert on fingerprint means
 * we reuse existing snapshot rows rather than creating duplicates.
 */

import { createHash } from 'crypto';
import { db, type Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('services:domain-config-snapshot');

type TransactionClient = Prisma.TransactionClient;

/**
 * Compute a deterministic SHA-256 fingerprint for a set of config IDs.
 * Null / undefined values are excluded. Remaining IDs are sorted before hashing
 * so the order of valueStatementVersionIds doesn't matter.
 */
export function computeFingerprint(ids: (string | null | undefined)[]): string {
  const sorted = ids
    .filter((id): id is string => id != null && id.length > 0)
    .sort();
  return createHash('sha256').update(sorted.join(',')).digest('hex');
}

/**
 * Capture or reuse a DomainConfigSnapshot for the given domain.
 *
 * Steps:
 * 1. Load the domain's current FK defaults (preamble version, level preset version, context).
 * 2. Load all value statements with their latest version ID.
 * 3. Compute fingerprint.
 * 4. Upsert on fingerprint — create if new, reuse if identical.
 * 5. Return the snapshot ID (or null if the domain doesn't exist).
 *
 * @param domainId - ID of the domain to snapshot
 * @param tx - Optional Prisma transaction client (use when called inside a transaction)
 */
export async function captureOrReuseDomainConfigSnapshot(
  domainId: string,
  tx?: TransactionClient,
): Promise<string | null> {
  const client = tx ?? db;

  // Load domain with its current config pointers
  const domain = await client.domain.findUnique({
    where: { id: domainId },
    select: {
      id: true,
      defaultPreambleVersionId: true,
      defaultLevelPresetVersionId: true,
      defaultContextId: true,
    },
  });

  if (domain == null) {
    log.warn({ domainId }, 'Domain not found — skipping snapshot capture');
    return null;
  }

  // Load all value statements for this domain with their latest version
  const statements = await client.valueStatement.findMany({
    where: { domainId },
    select: {
      id: true,
      versions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
        select: { id: true },
      },
    },
  });

  // Collect the latest version ID for each statement (skip statements without versions)
  const valueStatementVersionIds = statements
    .map((s) => s.versions[0]?.id)
    .filter((id): id is string => id != null)
    .sort();

  const fingerprint = computeFingerprint([
    domain.defaultPreambleVersionId,
    domain.defaultLevelPresetVersionId,
    domain.defaultContextId,
    ...valueStatementVersionIds,
  ]);

  // Upsert: if identical fingerprint exists, return that snapshot's ID
  const existing = await client.domainConfigSnapshot.findUnique({
    where: { fingerprint },
    select: { id: true },
  });

  if (existing != null) {
    log.debug({ domainId, snapshotId: existing.id, fingerprint }, 'Reusing existing domain config snapshot');
    return existing.id;
  }

  // Create new snapshot
  const snapshot = await client.domainConfigSnapshot.create({
    data: {
      domainId,
      preambleVersionId: domain.defaultPreambleVersionId,
      levelPresetVersionId: domain.defaultLevelPresetVersionId,
      contextId: domain.defaultContextId,
      valueStatementVersionIds,
      fingerprint,
    },
    select: { id: true },
  });

  log.info({ domainId, snapshotId: snapshot.id, fingerprint }, 'Created new domain config snapshot');
  return snapshot.id;
}
