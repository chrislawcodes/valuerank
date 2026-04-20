/**
 * Migration: upgrade every cached canonicalDecision to cacheVersion 2, strip
 * the legacy decisionCode + decisionCodeSource fields, and re-derive
 * canonicals for rows where the existing one is suspicious.
 *
 * Classification per row (A2):
 *   1. Good existing canonical — decisionState in {resolved, neutral, refusal}
 *      AND strength !== unknown AND direction !== unknown. Preserve verbatim,
 *      bump cacheVersion to 2. Tag as `preserved`.
 *   2. Suspicious OR missing canonical — force re-derivation by calling the
 *      production `resolveCanonicalDecision` with cachedDecision: null.
 *      Uses the same code path the live reader uses. Tag as
 *      `resolver-recovered` if the resolver produced a resolved/neutral/refusal
 *      canonical, else `synthesized-unknown`.
 *   3. Refusal override (historical-row compat) — if `summary.decisionCode ===
 *      "refusal"` and the resolver returned `decisionState: "unknown"`,
 *      override to refusal. Tag as `refusal-tagged`.
 *   4. Missing snapshot — if `pairFromSnapshot` returns null, still strip +
 *      bump + synthesize unknown canonical. Tag as `missing-snapshot-stripped`.
 *
 * All cases strip `decisionCode` + `decisionCodeSource` and write
 * `cacheVersion: 2`.
 *
 * Idempotent. Per-row atomic. Dry-run by default.
 *
 * Usage (from cloud/):
 *   npx tsx scripts/backfill-canonical-v2-migration.ts              # dry run
 *   npx tsx scripts/backfill-canonical-v2-migration.ts --apply      # writes
 *
 * Against prod:
 *   DATABASE_URL="$PROD_URL" npx tsx scripts/backfill-canonical-v2-migration.ts
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

import { resolveCanonicalDecision } from '../apps/api/src/graphql/queries/domain/decision-model.js';
import {
  buildRawDecisionEvidence,
  extractCachedWinnerFirstDecision,
  extractLabelPrefixFromSnapshot,
  extractManualOverrideDecision,
  extractValueStatementsFromSnapshot,
} from '../apps/api/src/graphql/queries/domain/decision-model-helpers.js';
import { extractValuePair } from '../apps/api/src/graphql/queries/domain-analysis-values.js';

const log = createLogger('scripts:backfill-canonical-v2-migration');

// -------------------------------------------------------------------
// Public pure helpers (tested)
// -------------------------------------------------------------------

export type CanonicalV2 = {
  cacheVersion: 2;
  decisionState: 'resolved' | 'neutral' | 'unknown' | 'refusal';
  strength: 'strong' | 'lean' | 'neutral' | 'unknown';
  favoredValueKey: string | null;
};

export type ValuePair = { valueA: string; valueB: string };

/**
 * Extract the value pair from a transcript's definition_snapshot JSON.
 * Returns null if malformed. Must not throw.
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

/**
 * Determine whether an existing canonicalDecision is trustworthy enough to
 * preserve verbatim. A "good" canonical has a non-unknown decisionState AND
 * non-unknown strength AND non-unknown direction. Suspicious canonicals get
 * re-derived via the production resolver.
 */
export function isGoodCanonical(canonical: unknown): boolean {
  if (canonical == null || typeof canonical !== 'object' || Array.isArray(canonical)) return false;
  const rec = canonical as Record<string, unknown>;
  const state = rec.decisionState;
  const strength = rec.strength;
  if (typeof state !== 'string' || typeof strength !== 'string') return false;
  if (state === 'unknown') return false;
  if (strength === 'unknown') return false;
  if (state === 'resolved') {
    return (
      typeof rec.favoredValueKey === 'string'
      && (rec.favoredValueKey as string).length > 0
      && (strength === 'strong' || strength === 'lean')
    );
  }
  if (state === 'neutral') {
    return rec.favoredValueKey === null && strength === 'neutral';
  }
  if (state === 'refusal') {
    return rec.favoredValueKey === null;
  }
  return false;
}

// -------------------------------------------------------------------
// CLI + orchestration
// -------------------------------------------------------------------

type Category =
  | 'preserved'
  | 'resolver-recovered'
  | 'refusal-tagged'
  | 'synthesized-unknown'
  | 'missing-snapshot-stripped'
  | 'already-v2'
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

async function main(): Promise<void> {
  const { apply, domain, limit } = parseArgs();
  log.info({ apply, domain, limit }, apply ? 'APPLY mode — will write' : 'DRY RUN — pass --apply to write');

  let domainId: string | null = null;
  if (domain != null) {
    const d = await db.domain.findUnique({ where: { normalizedName: domain }, select: { id: true } });
    if (d == null) throw new Error(`Domain "${domain}" not found`);
    domainId = d.id;
  }

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
    preserved: 0,
    'resolver-recovered': 0,
    'refusal-tagged': 0,
    'synthesized-unknown': 0,
    'missing-snapshot-stripped': 0,
    'already-v2': 0,
    errors: 0,
  };

  const BATCH_SIZE = 500;
  const started = Date.now();

  for (let batchStart = 0; batchStart < candidateIds.length; batchStart += BATCH_SIZE) {
    const batch = candidateIds.slice(batchStart, batchStart + BATCH_SIZE).map((r) => r.id);

    const transcripts = await db.transcript.findMany({
      where: { id: { in: batch } },
      select: {
        id: true,
        scenarioId: true,
        definitionSnapshot: true,
        decisionMetadata: true,
      },
    });

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

    for (const t of transcripts) {
      try {
        const existingMeta = (t.decisionMetadata as Record<string, unknown> | null) ?? {};
        const summaryCache = (existingMeta.summaryCache as Record<string, unknown> | undefined) ?? null;
        if (summaryCache == null) continue;
        const summary = (summaryCache.summary as Record<string, unknown> | undefined) ?? {};
        const existingCode = typeof summary.decisionCode === 'string' ? summary.decisionCode : null;
        const existingCanonical = summary.canonicalDecision as Record<string, unknown> | undefined;
        const existingCacheVersion = existingCanonical?.cacheVersion;

        // Case "already-v2": no decisionCode AND canonical already at v2.
        if (existingCode == null && existingCacheVersion === 2) {
          counts['already-v2'] += 1;
          continue;
        }

        const orientationFlipped = t.scenarioId != null
          ? (scenarioMap.get(t.scenarioId) ?? false)
          : false;
        const pair = pairFromSnapshot(t.definitionSnapshot);

        let newCanonical: CanonicalV2;
        let category: Category;

        if (pair == null) {
          // Case 4: Missing snapshot — synthesize unknown but still strip.
          newCanonical = {
            cacheVersion: 2,
            decisionState: 'unknown',
            strength: 'unknown',
            favoredValueKey: null,
          };
          category = 'missing-snapshot-stripped';
        } else if (isGoodCanonical(existingCanonical)) {
          // Case 1: Preserve verbatim, bump cacheVersion.
          newCanonical = {
            cacheVersion: 2,
            decisionState: existingCanonical!.decisionState as CanonicalV2['decisionState'],
            strength: existingCanonical!.strength as CanonicalV2['strength'],
            favoredValueKey: (existingCanonical!.favoredValueKey as string | null) ?? null,
          };
          category = 'preserved';
        } else {
          // Case 2/3: Force re-derivation via production resolver.
          const raw = buildRawDecisionEvidence(existingMeta);
          const manualOverrideDecision = extractManualOverrideDecision(existingMeta);
          const valueStatements = extractValueStatementsFromSnapshot(t.definitionSnapshot);
          const labelPrefix = extractLabelPrefixFromSnapshot(t.definitionSnapshot) ?? null;
          const resolvedPair = extractValuePair(t.definitionSnapshot);

          const resolved = resolveCanonicalDecision({
            pair: resolvedPair,
            orientationFlipped,
            raw,
            manualOverridePresent: manualOverrideDecision !== null,
            manualOverrideDecision,
            cachedDecision: null, // force re-derivation from raw evidence
            valueStatements,
            labelPrefix,
          });

          // Refusal override for historical rows where decisionCode carried
          // the refusal signal pre-A9.
          if (resolved.direction === 'unknown' && existingCode === 'refusal') {
            newCanonical = {
              cacheVersion: 2,
              decisionState: 'refusal',
              strength: 'unknown',
              favoredValueKey: null,
            };
            category = 'refusal-tagged';
          } else if (resolved.direction === 'refusal') {
            newCanonical = {
              cacheVersion: 2,
              decisionState: 'refusal',
              strength: 'unknown',
              favoredValueKey: null,
            };
            category = 'resolver-recovered';
          } else if (resolved.direction === 'neutral') {
            newCanonical = {
              cacheVersion: 2,
              decisionState: 'neutral',
              strength: 'neutral',
              favoredValueKey: null,
            };
            category = 'resolver-recovered';
          } else if (
            resolved.direction !== 'unknown'
            && resolved.strength !== 'unknown'
            && resolved.favoredValueKey != null
          ) {
            newCanonical = {
              cacheVersion: 2,
              decisionState: 'resolved',
              strength: resolved.strength,
              favoredValueKey: resolved.favoredValueKey,
            };
            category = 'resolver-recovered';
          } else {
            // Resolver returned unknown and no legacy refusal flag. Best we
            // can do is write a v2 unknown canonical.
            newCanonical = {
              cacheVersion: 2,
              decisionState: 'unknown',
              strength: 'unknown',
              favoredValueKey: null,
            };
            category = 'synthesized-unknown';
          }
        }

        counts[category] += 1;

        if (!apply) continue;

        // Strip decisionCode + decisionCodeSource; write new canonical.
        const {
          decisionCode: _dropCode,
          decisionCodeSource: _dropSource,
          ...restSummary
        } = summary;
        void _dropCode;
        void _dropSource;
        const updatedSummary = {
          ...restSummary,
          canonicalDecision: newCanonical,
        };

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
