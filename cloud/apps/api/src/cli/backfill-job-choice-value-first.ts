#!/usr/bin/env tsx

/**
 * @deprecated Do not run this script. The backfill logic here is incorrect for
 * runs on B-first definitions: it reads `components.value_second.token` for
 * `B_first` runs, but the correct value is always `components.value_first.token`
 * (the slot assembleTemplate renders first is always value_first, regardless of
 * presentation order).
 *
 * `getCoverageDirection` now reads `definitionSnapshot.components.value_first.token`
 * directly as its primary signal, making `jobChoiceValueFirst` unnecessary.
 *
 * Original intent: backfill `jobChoiceValueFirst` onto runs that were created
 * before this field existed, using `jobChoicePresentationOrder` as the source.
 */

import { fileURLToPath } from 'url';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('cli:backfill-job-choice-value-first');
const BATCH_SIZE = 100;

type CliOptions = {
  dryRun: boolean;
};

type RunRow = {
  id: string;
  config: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseOptions(argv: string[]): CliOptions {
  return { dryRun: argv.includes('--dry-run') };
}

export function deriveJobChoiceValueFirst(config: unknown): string | null {
  if (!isRecord(config)) return null;

  const order = config.jobChoicePresentationOrder;
  if (order !== 'A_first' && order !== 'B_first') return null;

  const snapshot = config.definitionSnapshot;
  if (!isRecord(snapshot)) return null;
  const components = snapshot.components;
  if (!isRecord(components)) return null;

  const slot = order === 'A_first' ? components.value_first : components.value_second;
  if (!isRecord(slot)) return null;

  const token = slot.token;
  if (typeof token !== 'string' || token.trim().length === 0) return null;
  return token.trim();
}

export async function runBackfill(options: CliOptions): Promise<{
  inspected: number;
  updated: number;
  skipped: number;
  failed: number;
  failedRunIds: string[];
}> {
  let inspected = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failedRunIds: string[] = [];
  let cursor: string | null = null;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const rows: RunRow[] = cursor == null
      ? await db.$queryRaw<RunRow[]>`
          SELECT id, config
          FROM runs
          WHERE deleted_at IS NULL
            AND config->>'jobChoicePresentationOrder' IN ('A_first', 'B_first')
            AND config->>'jobChoiceValueFirst' IS NULL
          ORDER BY id ASC
          LIMIT ${BATCH_SIZE}
        `
      : await db.$queryRaw<RunRow[]>`
          SELECT id, config
          FROM runs
          WHERE deleted_at IS NULL
            AND config->>'jobChoicePresentationOrder' IN ('A_first', 'B_first')
            AND config->>'jobChoiceValueFirst' IS NULL
            AND id > ${cursor}
          ORDER BY id ASC
          LIMIT ${BATCH_SIZE}
        `;

    if (rows.length === 0) break;

    for (const row of rows) {
      inspected += 1;

      const token = deriveJobChoiceValueFirst(row.config);
      if (token === null) {
        skipped += 1;
        log.warn({ runId: row.id }, 'backfill:skipped (cannot derive token from snapshot)');
        continue;
      }

      if (options.dryRun) {
        updated += 1;
        log.info({ runId: row.id, token }, 'backfill:would-update');
        continue;
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        await db.$executeRaw`
          UPDATE runs
          SET config = config || jsonb_build_object('jobChoiceValueFirst', ${token}::text)
          WHERE id = ${row.id}
        `;
        updated += 1;
        log.info({ runId: row.id, token }, 'backfill:updated');
      } catch (error) {
        failed += 1;
        failedRunIds.push(row.id);
        log.error({ runId: row.id, err: error }, 'backfill:failed');
      }
    }

    cursor = rows[rows.length - 1]?.id ?? null;
    if (rows.length < BATCH_SIZE || cursor === null) break;
  }

  return { inspected, updated, skipped, failed, failedRunIds };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  log.info({ dryRun: options.dryRun }, 'Starting jobChoiceValueFirst backfill');

  const summary = await runBackfill(options);

  log.info(summary, 'Backfill complete');
  if (summary.failedRunIds.length > 0) {
    log.error({ failedRunIds: summary.failedRunIds }, 'Some runs failed to backfill');
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    log.error({ err: error }, 'Fatal error');
    process.exit(1);
  });
}
