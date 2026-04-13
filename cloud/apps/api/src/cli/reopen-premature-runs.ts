#!/usr/bin/env npx tsx
/**
 * One-time backfill: re-open COMPLETED runs that completed prematurely due to
 * AUTH_ERROR failures leaving some probes without transcripts.
 *
 * Usage:
 *   npx tsx src/cli/reopen-premature-runs.ts [--dry-run] [--after YYYY-MM-DD]
 *
 * Prerequisites:
 *   1. Confirm the provider quota/auth issue is resolved before running in live mode.
 *   2. Use --after to limit scope (e.g., --after 2025-11-01).
 *   3. Always run --dry-run first and review the output.
 *
 * Crash recovery: if the script crashes after the transaction commits (run is
 * now RUNNING) but before recoverOrphanedRun completes, the scheduled
 * detectOrphanedRuns service (every 5 min) will re-queue the missing probes.
 */

import { fileURLToPath } from 'url';
import readline from 'readline';

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

import { findMissingProbes } from '../services/run/coverage-completeness.js';
import { reverseDeductionForRun } from '../services/budget/deduct.js';
import { recoverOrphanedRun } from '../services/run/recovery.js';
import { createBoss, startBoss, stopBoss } from '../queue/boss.js';

const log = createLogger('cli:reopen-premature-runs');

type ParsedArgs = {
  dryRun: boolean;
  afterDate: Date | null;
};

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let dryRun = false;
  let afterDate: Date | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--after') {
      const value = args[i + 1];
      if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error('--after requires a YYYY-MM-DD date');
      }
      afterDate = new Date(`${value}T00:00:00Z`);
      i += 1;
    }
  }

  return { dryRun, afterDate };
}

async function promptConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim() === 'YES');
    });
  });
}

async function main(): Promise<void> {
  const { dryRun, afterDate } = parseArgs(process.argv);

  log.info({ dryRun, afterDate }, 'Starting reopen-premature-runs');

  // Query all COMPLETED runs within the optional time window
  const completedRuns = await db.run.findMany({
    where: {
      status: 'COMPLETED',
      deletedAt: null,
      ...(afterDate != null ? { completedAt: { gte: afterDate } } : {}),
    },
    select: { id: true, completedAt: true },
    orderBy: { completedAt: 'asc' },
  });

  log.info({ count: completedRuns.length }, 'Scanning completed runs for missing probes');

  const toReopen: Array<{ runId: string; missingCount: number }> = [];
  let skipped = 0;

  for (const run of completedRuns) {
    const missing = await findMissingProbes(run.id);
    if (missing.length === 0) {
      skipped++;
      continue;
    }
    toReopen.push({ runId: run.id, missingCount: missing.length });
    if (dryRun) {
      console.log(`[DRY RUN] Would reopen run ${run.id} — ${missing.length} missing probe(s)`);
    }
  }

  console.log(
    `\nScan complete: ${completedRuns.length} runs scanned, ${skipped} OK, ${toReopen.length} need reopening`,
  );

  if (toReopen.length === 0) {
    log.info('No runs to reopen — exiting');
    return;
  }

  if (dryRun) {
    console.log('\nRe-run without --dry-run to apply changes.');
    return;
  }

  // Live mode: confirm before proceeding (unless --after was specified)
  console.log('\nRuns that will be reopened:');
  for (const { runId, missingCount } of toReopen) {
    console.log(`  ${runId} (${missingCount} missing probes)`);
  }

  if (afterDate === null) {
    const confirmed = await promptConfirm(
      '\nThis will modify ALL completed runs with missing probes. Type YES to continue: ',
    );
    if (!confirmed) {
      console.log('Aborted.');
      return;
    }
  }

  console.log(
    '\nNote: Ensure the provider quota/auth issue is resolved before proceeding.\n',
  );

  // Initialize PgBoss (required by recoverOrphanedRun)
  createBoss();
  await startBoss();

  let reopened = 0;
  let totalProbesQueued = 0;
  let errors = 0;

  for (const { runId } of toReopen) {
    try {
      // Reverse budget deduction and reset status atomically
      await db.$transaction(async (tx) => {
        await reverseDeductionForRun(runId, tx);
        await tx.run.update({
          where: { id: runId },
          data: { status: 'RUNNING', completedAt: null, stalledModels: [] },
        });
      });

      // Re-queue missing probes (uses PgBoss)
      const result = await recoverOrphanedRun(runId);
      const requeuedCount = result.requeuedCount ?? 0;

      log.info({ runId, requeuedCount, action: result.action }, 'Reopened run');
      reopened++;
      totalProbesQueued += requeuedCount;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error({ runId, error: errorMessage }, 'Failed to reopen run');
      errors++;
    }
  }

  await stopBoss();

  console.log(
    `\nDone: ${completedRuns.length} scanned, ${skipped} skipped, ${reopened} reopened, ${totalProbesQueued} probes re-queued, ${errors} errors`,
  );

  if (errors > 0) {
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    log.error({ err: error }, 'reopen-premature-runs failed');
    process.exit(1);
  });
}
