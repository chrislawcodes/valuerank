/**
 * Migration: rename legacy order-effect variant types to 'fully_flipped'
 * Idempotent — safe to run multiple times.
 * Usage:
 *   npx ts-node scripts/migrate-flipped-to-fully-flipped.ts           # live run
 *   npx ts-node scripts/migrate-flipped-to-fully-flipped.ts --dry-run # preview only
 */
import { db } from '../packages/db/src';

const LEGACY_VARIANT_TYPES = ['flipped', 'flipped_order'] as const;
async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const matching = await db.assumptionScenarioPair.findMany({
    where: {
      assumptionKey: 'order_invariance',
      variantType: { in: [...LEGACY_VARIANT_TYPES] },
    },
    select: { id: true, variantType: true },
  });

  console.log(
    `Found ${matching.length} row(s) with legacy variantType (${LEGACY_VARIANT_TYPES.join(', ')})`,
  );
  if (matching.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  matching.forEach(({ id, variantType }) => console.log(`  - ${id}: ${variantType}`));

  if (dryRun) {
    console.log('Dry-run mode — no changes made.');
    return;
  }

  const result = await db.assumptionScenarioPair.updateMany({
    where: {
      assumptionKey: 'order_invariance',
      variantType: { in: [...LEGACY_VARIANT_TYPES] },
    },
    data: { variantType: 'fully_flipped' },
  });

  console.log(`Updated ${result.count} row(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
