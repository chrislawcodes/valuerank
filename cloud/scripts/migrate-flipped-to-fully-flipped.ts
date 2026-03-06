/**
 * Migration: rename AssumptionScenarioPair.variantType 'flipped' → 'fully_flipped'
 * Idempotent — safe to run multiple times.
 * Usage:
 *   npx ts-node scripts/migrate-flipped-to-fully-flipped.ts          # live run
 *   npx ts-node scripts/migrate-flipped-to-fully-flipped.ts --dry-run # preview only
 */
import { db } from '../packages/db/src';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const matching = await db.assumptionScenarioPair.findMany({
    where: { variantType: 'flipped' },
    select: { id: true },
  });

  console.log(`Found ${matching.length} row(s) with variantType='flipped'`);
  if (matching.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  matching.forEach(({ id }) => console.log(`  - ${id}`));

  if (dryRun) {
    console.log('Dry-run mode — no changes made.');
    return;
  }

  const result = await db.assumptionScenarioPair.updateMany({
    where: { variantType: 'flipped' },
    data: { variantType: 'fully_flipped' },
  });

  console.log(`Updated ${result.count} row(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
