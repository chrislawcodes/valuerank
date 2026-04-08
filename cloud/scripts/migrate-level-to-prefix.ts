/**
 * One-time migration: move [level] from value statement bodies into domain sentencePrefix.
 *
 * What it does:
 * 1. Sets sentencePrefix = "One job offers [level]" on job-choice domain (was null → default)
 * 2. Sets sentencePrefix = "One approach provides [level]" on software-approach-choice domain
 * 3. Strips "[level] " from all software-approach-choice value statement bodies (in-place)
 * 4. Updates the corresponding ValueStatementVersion rows in-place (no new versions)
 *
 * Job-choice value statement bodies already lack [level] in prod, so no body changes needed there.
 *
 * Usage:
 *   npx tsx scripts/migrate-level-to-prefix.ts --dry-run
 *   npx tsx scripts/migrate-level-to-prefix.ts
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('scripts:migrate-level-to-prefix');
const dryRun = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  if (dryRun) {
    log.info('DRY RUN — no changes will be written');
  }

  // --- Job Choice: set sentencePrefix ---
  const jobChoice = await db.domain.findUnique({ where: { normalizedName: 'job-choice' } });
  if (jobChoice == null) {
    log.warn('job-choice domain not found, skipping');
  } else {
    log.info({ id: jobChoice.id, current: jobChoice.sentencePrefix }, 'job-choice current sentencePrefix');
    if (!dryRun) {
      await db.domain.update({
        where: { id: jobChoice.id },
        data: { sentencePrefix: 'One job offers [level]' },
      });
      log.info('job-choice sentencePrefix set to "One job offers [level]"');
    } else {
      log.info('WOULD set job-choice sentencePrefix to "One job offers [level]"');
    }
  }

  // --- Software Approach Choice: set sentencePrefix + strip [level] from bodies ---
  const softwareApproach = await db.domain.findUnique({ where: { normalizedName: 'software-approach-choice' } });
  if (softwareApproach == null) {
    log.warn('software-approach-choice domain not found, skipping');
  } else {
    log.info({ id: softwareApproach.id, current: softwareApproach.sentencePrefix }, 'software-approach-choice current sentencePrefix');
    if (!dryRun) {
      await db.domain.update({
        where: { id: softwareApproach.id },
        data: { sentencePrefix: 'One approach provides [level]' },
      });
      log.info('software-approach-choice sentencePrefix set to "One approach provides [level]"');
    } else {
      log.info('WOULD set software-approach-choice sentencePrefix to "One approach provides [level]"');
    }

    // Strip [level] from value statement bodies
    const statements = await db.valueStatement.findMany({
      where: { domainId: softwareApproach.id },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    for (const stmt of statements) {
      if (!stmt.body.includes('[level]')) {
        log.info({ token: stmt.token }, 'body already clean, skipping');
        continue;
      }

      const newBody = stmt.body.replace(/\[level\]\s*/g, '');
      log.info({ token: stmt.token, old: stmt.body, new: newBody }, dryRun ? 'WOULD update body' : 'updating body');

      if (!dryRun) {
        // Update the statement body in-place
        await db.valueStatement.update({
          where: { id: stmt.id },
          data: { body: newBody },
        });

        // Update the latest version row in-place (no new version = no fingerprint change)
        const latestVersion = stmt.versions[0];
        if (latestVersion != null && latestVersion.content.includes('[level]')) {
          await db.valueStatementVersion.update({
            where: { id: latestVersion.id },
            data: { content: newBody },
          });
          log.info({ token: stmt.token, versionId: latestVersion.id }, 'updated version content in-place');
        }
      }
    }
  }

  log.info(dryRun ? 'DRY RUN complete' : 'Migration complete');
}

main()
  .catch((err) => { log.error({ err }, 'Migration failed'); process.exitCode = 1; })
  .finally(() => db.$disconnect());
