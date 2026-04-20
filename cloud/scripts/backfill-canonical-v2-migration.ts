/**
 * Migration: upgrade every cached canonicalDecision to cacheVersion 2.
 *
 * For each transcript whose `decision_metadata.summaryCache` is not null:
 *   - If `summaryCache.summary.decisionCode` is present, derive a fresh
 *     canonicalDecision from {decisionCode, value pair, orientationFlipped}
 *     using the truth table in `canonicalFromDecisionCode` below. Strip
 *     decisionCode and decisionCodeSource from the summary. Write
 *     cacheVersion: 2.
 *   - If decisionCode is absent and cacheVersion is not yet 2, preserve
 *     the existing canonical values verbatim and only bump cacheVersion
 *     to 2. No retroactive refusal inference.
 *   - If decisionCode is absent and cacheVersion is already 2, no-op.
 *
 * Rows with a malformed `definition_snapshot` (missing or non-string
 * value pair tokens) are skipped and reported under `missing-snapshot`.
 *
 * Idempotent. Per-row atomic. Dry-run by default.
 *
 * Usage (from cloud/apps/api/):
 *   npx tsx --env-file=../../.env ../../scripts/backfill-canonical-v2-migration.ts
 *   npx tsx --env-file=../../.env ../../scripts/backfill-canonical-v2-migration.ts --apply
 *
 * Against prod (from cloud/):
 *   DATABASE_URL="$PROD_URL" npx tsx scripts/backfill-canonical-v2-migration.ts
 *   DATABASE_URL="$PROD_URL" npx tsx scripts/backfill-canonical-v2-migration.ts --apply
 *
 * Flags:
 *   --apply                         Write mode (default: dry-run).
 *   --domain=<normalizedName>       Scope to one domain.
 *   --limit=<n>                     Cap the number of rows visited.
 */
import { pathToFileURL } from 'node:url';

import { db } from '@valuerank/db';
import type { Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('scripts:backfill-canonical-v2-migration');

// -------------------------------------------------------------------
// Truth table
// -------------------------------------------------------------------

export type CanonicalV2 = {
  cacheVersion: 2;
  decisionState: 'resolved' | 'neutral' | 'unknown' | 'refusal';
  strength: 'strong' | 'lean' | 'neutral' | 'unknown';
  favoredValueKey: string | null;
};

export type ValuePair = { valueA: string; valueB: string };

/**
 * Pure derivation of the v2 canonical from {decisionCode, pair, orientationFlipped}.
 *
 * Mapping:
 *   "5" + !flipped  -> favor_first  strong    (favoredValueKey = valueA)
 *   "5" + flipped   -> favor_second strong    (favoredValueKey = valueB)
 *   "4" + !flipped  -> favor_first  lean      (favoredValueKey = valueA)
 *   "4" + flipped   -> favor_second lean      (favoredValueKey = valueB)
 *   "3"             -> neutral (both orientations identical)
 *   "2" + !flipped  -> favor_second lean      (favoredValueKey = valueB)
 *   "2" + flipped   -> favor_first  lean      (favoredValueKey = valueA)
 *   "1" + !flipped  -> favor_second strong    (favoredValueKey = valueB)
 *   "1" + flipped   -> favor_first  strong    (favoredValueKey = valueA)
 *   "refusal"       -> {refusal, unknown, null}
 *   "other" / null  -> {unknown, unknown, null}
 */
export function canonicalFromDecisionCode(
  decisionCode: string | null | undefined,
  pair: ValuePair,
  orientationFlipped: boolean,
): CanonicalV2 {
  if (decisionCode === 'refusal') {
    return { cacheVersion: 2, decisionState: 'refusal', strength: 'unknown', favoredValueKey: null };
  }
  if (decisionCode == null || decisionCode === '' || decisionCode === 'other') {
    return { cacheVersion: 2, decisionState: 'unknown', strength: 'unknown', favoredValueKey: null };
  }
  if (decisionCode === '3') {
    return { cacheVersion: 2, decisionState: 'neutral', strength: 'neutral', favoredValueKey: null };
  }
  if (decisionCode === '5') {
    return {
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: orientationFlipped ? pair.valueB : pair.valueA,
    };
  }
  if (decisionCode === '4') {
    return {
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'lean',
      favoredValueKey: orientationFlipped ? pair.valueB : pair.valueA,
    };
  }
  if (decisionCode === '2') {
    return {
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'lean',
      favoredValueKey: orientationFlipped ? pair.valueA : pair.valueB,
    };
  }
  if (decisionCode === '1') {
    return {
      cacheVersion: 2,
      decisionState: 'resolved',
      strength: 'strong',
      favoredValueKey: orientationFlipped ? pair.valueA : pair.valueB,
    };
  }
  // Unexpected decisionCode — treat as unknown to avoid misclassification.
  return { cacheVersion: 2, decisionState: 'unknown', strength: 'unknown', favoredValueKey: null };
}

/**
 * Extract the value pair from a transcript's definition_snapshot JSON.
 * Returns null if the snapshot is malformed in any way — the migration
 * treats null as "skip this row and report as missing-snapshot".
 *
 * Must not throw on any input.
 */
export function pairFromSnapshot(snapshot: unknown): ValuePair | null {
  if (snapshot == null || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const components = (snapshot as { components?: unknown }).components;
  if (components == null || typeof components !== 'object' || Array.isArray(components)) return null;
  const valueFirst = (components as { value_first?: unknown }).value_first;
  const valueSecond = (components as { value_second?: unknown }).value_second;
  if (valueFirst == null || typeof valueFirst !== 'object' || Array.isArray(valueFirst)) return null;
  if (valueSecond == null || typeof valueSecond !== 'object' || Array.isArray(valueSecond)) return null;
  const valueA = (valueFirst as { token?: unknown }).token;
  const valueB = (valueSecond as { token?: unknown }).token;
  if (typeof valueA !== 'string' || typeof valueB !== 'string') return null;
  if (!valueA || !valueB) return null;
  return { valueA, valueB };
}

// -------------------------------------------------------------------
// CLI + orchestration
// -------------------------------------------------------------------

type Category =
  | 'drifted'
  | 'no-change-with-code'
  | 'v1-upgrade-preserving-canonical'
  | 'already-v2'
  | 'missing-snapshot'
  | 'errors';

function parseArgs(): { apply: boolean; domain: string | null; limit: number | null } {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const domainArg = args.find((a) => a.startsWith('--domain='));
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const domain = domainArg != null ? (domainArg.split('=')[1] ?? null) : null;
  const limit = limitArg != null ? Number(limitArg.split('=')[1] ?? 'NaN') : null;
  return { apply, domain, limit: limit != null && Number.isFinite(limit) ? limit : null };
}

function canonicalEquals(a: unknown, b: CanonicalV2): boolean {
  if (a == null || typeof a !== 'object' || Array.isArray(a)) return false;
  const rec = a as Record<string, unknown>;
  return (
    rec.cacheVersion === b.cacheVersion
    && rec.decisionState === b.decisionState
    && rec.strength === b.strength
    && (rec.favoredValueKey ?? null) === b.favoredValueKey
  );
}

async function main(): Promise<void> {
  const { apply, domain, limit } = parseArgs();
  log.info({ apply, domain, limit }, apply ? 'APPLY mode — will write' : 'DRY RUN — pass --apply to write');

  let domainId: string | null = null;
  if (domain != null) {
    const d = await db.domain.findUnique({ where: { normalizedName: domain }, select: { id: true } });
    if (d == null) throw new Error(`Domain "${domain}" not found`);
    domainId = d.id;
  }

  // Row IDs first, then per-row fetch+update. Avoids loading everything into memory.
  const candidateIds = await db.$queryRawUnsafe<{ id: string }[]>(
    `
    SELECT t.id FROM transcripts t
    ${domainId != null ? 'JOIN runs r ON r.id = t.run_id JOIN definitions def ON def.id = r.definition_id' : ''}
    WHERE t.decision_metadata->'summaryCache' IS NOT NULL
      ${domainId != null ? 'AND def.domain_id = $1' : ''}
    ORDER BY t.created_at ASC
    ${limit != null ? `LIMIT ${limit}` : ''}
    `,
    ...(domainId != null ? [domainId] : []),
  );

  log.info({ candidateCount: candidateIds.length }, 'Visiting transcripts');
  if (candidateIds.length === 0) {
    log.info('Nothing to do');
    return;
  }

  const counts: Record<Category, number> = {
    drifted: 0,
    'no-change-with-code': 0,
    'v1-upgrade-preserving-canonical': 0,
    'already-v2': 0,
    'missing-snapshot': 0,
    errors: 0,
  };

  // Batch fetches to avoid per-row round-trips over the public proxy.
  const BATCH_SIZE = 500;
  const started = Date.now();

  for (let batchStart = 0; batchStart < candidateIds.length; batchStart += BATCH_SIZE) {
    const batch = candidateIds.slice(batchStart, batchStart + BATCH_SIZE).map((r) => r.id);

    // One query for all transcripts in this batch.
    const transcripts = await db.transcript.findMany({
      where: { id: { in: batch } },
      select: {
        id: true,
        scenarioId: true,
        definitionSnapshot: true,
        decisionMetadata: true,
      },
    });

    // Collect unique scenarioIds and fetch orientationFlipped for all at once.
    const scenarioIds = Array.from(
      new Set(transcripts.map((t) => t.scenarioId).filter((id): id is string => id != null)),
    );
    const scenarioMap = new Map<string, boolean>();
    if (scenarioIds.length > 0) {
      const scenarios = await db.scenario.findMany({
        where: { id: { in: scenarioIds } },
        select: { id: true, orientationFlipped: true },
      });
      for (const s of scenarios) scenarioMap.set(s.id, s.orientationFlipped ?? false);
    }

    // Per-row process in memory; writes still atomic per row.
    for (const t of transcripts) {
      try {
        const existingMeta = (t.decisionMetadata as Record<string, unknown> | null) ?? {};
        const summaryCache = (existingMeta.summaryCache as Record<string, unknown> | undefined) ?? null;
        if (summaryCache == null) continue;
        const summary = (summaryCache.summary as Record<string, unknown> | undefined) ?? {};
        const existingCode = typeof summary.decisionCode === 'string' ? summary.decisionCode : null;
        const existingCanonical = summary.canonicalDecision as Record<string, unknown> | undefined;
        const existingCacheVersion = existingCanonical?.cacheVersion;

        // Case 3: already at target.
        if (existingCode == null && existingCacheVersion === 2) {
          counts['already-v2'] += 1;
          continue;
        }

        let updatedSummary: Record<string, unknown>;
        let category: Category;

        if (existingCode != null) {
          // Case 1: derive from decisionCode + pair + orientationFlipped.
          const pair = pairFromSnapshot(t.definitionSnapshot);
          if (pair == null) {
            counts['missing-snapshot'] += 1;
            continue;
          }
          const orientationFlipped = t.scenarioId != null
            ? (scenarioMap.get(t.scenarioId) ?? false)
            : false;
          const newCanonical = canonicalFromDecisionCode(existingCode, pair, orientationFlipped);
          const drifted = !canonicalEquals(existingCanonical, newCanonical);
          category = drifted ? 'drifted' : 'no-change-with-code';

          // Strip decisionCode and decisionCodeSource; write new canonical.
          const { decisionCode: _dropCode, decisionCodeSource: _dropSource, ...restSummary } = summary;
          void _dropCode;
          void _dropSource;
          updatedSummary = {
            ...restSummary,
            canonicalDecision: newCanonical,
          };
        } else {
          // Case 2: no decisionCode, cacheVersion != 2 — preserve canonical verbatim, bump.
          if (existingCanonical == null) {
            counts['missing-snapshot'] += 1;
            continue;
          }
          const preserved: CanonicalV2 = {
            cacheVersion: 2,
            decisionState: (existingCanonical.decisionState as CanonicalV2['decisionState']) ?? 'unknown',
            strength: (existingCanonical.strength as CanonicalV2['strength']) ?? 'unknown',
            favoredValueKey: (existingCanonical.favoredValueKey as string | null) ?? null,
          };
          updatedSummary = {
            ...summary,
            canonicalDecision: preserved,
          };
          category = 'v1-upgrade-preserving-canonical';
        }

        counts[category] += 1;

        if (!apply) continue;

        const updatedMetadata = {
          ...existingMeta,
          summaryCache: {
            ...summaryCache,
            summary: updatedSummary,
          },
        };

        await db.transcript.update({
          where: { id: t.id },
          data: { decisionMetadata: updatedMetadata as unknown as Prisma.InputJsonValue },
        });
      } catch (err) {
        counts.errors += 1;
        log.error({ id: t.id, err: String(err) }, 'Migration failed for transcript');
      }
    }

    const visited = batchStart + transcripts.length;
    const elapsedSec = Math.round((Date.now() - started) / 1000);
    const rate = elapsedSec > 0 ? Math.round(visited / elapsedSec) : 0;
    const remainingSec = rate > 0 ? Math.round((candidateIds.length - visited) / rate) : 0;
    log.info(
      { progress: `${visited}/${candidateIds.length}`, rate: `${rate}/s`, etaSec: remainingSec, counts },
      'Batch complete',
    );
  }

  log.info(
    { apply, total: candidateIds.length, counts },
    apply ? 'Migration complete' : 'Dry-run complete — pass --apply to write',
  );
}

// Only run when executed directly, not when imported by tests.
const isDirectRun = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isDirectRun) {
  main()
    .catch((err) => {
      log.error({ err: String(err) }, 'Migration failed');
      process.exitCode = 1;
    })
    .finally(() => {
      void db.$disconnect();
    });
}
