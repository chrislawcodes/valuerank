/**
 * Backfill: re-parse transcripts that were tagged as ambiguous
 * (`decisionCode = 'other'`, `strength = 'unknown'`) before the
 * level-word-tolerance fix landed in PR #694.
 *
 * For each affected transcript:
 *   1. Run the updated Python worker parser against the cached transcript
 *      content (no LLM calls — the probe already happened).
 *   2. If the new parse produced a valid scale code (1-5), update the
 *      transcript's `decisionMetadata.summaryCache.summary.decisionCode`
 *      and related fields in-place.
 *   3. Leave transcripts that still can't be parsed untouched.
 *
 * Usage (from cloud/apps/api/):
 *   npx tsx --env-file=../../.env ../../scripts/backfill-reparse-decisions.ts
 *   npx tsx --env-file=../../.env ../../scripts/backfill-reparse-decisions.ts --apply
 *
 * Against prod (from cloud/):
 *   DATABASE_URL="$DATABASE_URL" npx tsx scripts/backfill-reparse-decisions.ts
 *   DATABASE_URL="$DATABASE_URL" npx tsx scripts/backfill-reparse-decisions.ts --apply
 *
 * Optional flags:
 *   --domain=<normalizedName>  Limit to one domain (e.g. national-priorities)
 *   --limit=<n>                Only process the first N affected transcripts
 *
 * Dry-run by default. Pass `--apply` to write updates.
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('scripts:backfill-reparse-decisions');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HELPER_PY = path.resolve(__dirname, 'reparse-decision-stdin.py');

type ReparseResult = {
  decisionCode: string;
  decisionSource: string;
  decisionMetadata: {
    parserVersion: string;
    parseClass: string;
    parsePath: string;
    responseSha256: string | null;
    responseExcerpt: string | null;
    matchedLabel: string | null;
    scaleLabels: Array<{ code: string; label: string }>;
  };
};

function runReparse(transcriptContent: unknown): ReparseResult {
  const payload = JSON.stringify({ transcriptContent });
  const result = spawnSync('python3', [HELPER_PY], {
    input: payload,
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Python parser failed: exit=${result.status} stderr=${result.stderr}`);
  }
  return JSON.parse(result.stdout) as ReparseResult;
}

function parseArgs(): { apply: boolean; domain: string | null; limit: number | null } {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const domainArg = args.find((a) => a.startsWith('--domain='));
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const domain = domainArg ? domainArg.split('=')[1] ?? null : null;
  const limit = limitArg ? Number(limitArg.split('=')[1] ?? 'NaN') : null;
  return { apply, domain, limit: limit != null && Number.isFinite(limit) ? limit : null };
}

async function main(): Promise<void> {
  const { apply, domain, limit } = parseArgs();

  log.info({ apply, domain, limit }, apply ? 'APPLY mode — will write updates' : 'DRY RUN — pass --apply to write');

  // Find candidate transcripts: decision_metadata cache says decisionCode='other'
  // (ambiguous parse) AND we have cached response text to re-parse.
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
    WHERE t.decision_metadata->'summaryCache'->'summary'->>'decisionCode' = 'other'
      ${domainId != null ? 'AND def.domain_id = $1' : ''}
    ORDER BY t.created_at ASC
    ${limit != null ? `LIMIT ${limit}` : ''}
    `,
    ...(domainId != null ? [domainId] : []),
  );

  log.info({ candidateCount: candidateIds.length }, 'Found candidate transcripts');
  if (candidateIds.length === 0) {
    log.info('Nothing to do');
    return;
  }

  let reclassified = 0;
  let stillUnknown = 0;
  let errors = 0;
  const newCodeCounts = new Map<string, number>();

  for (let i = 0; i < candidateIds.length; i += 1) {
    const { id } = candidateIds[i]!;
    try {
      const t = await db.transcript.findUnique({
        where: { id },
        select: {
          id: true,
          content: true,
          decisionMetadata: true,
        },
      });
      if (t == null) {
        log.warn({ id }, 'Transcript missing — skipping');
        continue;
      }

      const parsed = runReparse(t.content);
      const newCode = parsed.decisionCode;

      if (newCode === 'other' || newCode === 'refusal') {
        stillUnknown += 1;
        continue;
      }

      newCodeCounts.set(newCode, (newCodeCounts.get(newCode) ?? 0) + 1);
      reclassified += 1;

      if (!apply) continue;

      // Build the new decision_metadata by updating the summaryCache block.
      const existing = (t.decisionMetadata as Record<string, unknown> | null) ?? {};
      const summaryCache = (existing.summaryCache as Record<string, unknown> | undefined) ?? {};
      const summary = (summaryCache.summary as Record<string, unknown> | undefined) ?? {};

      const updatedSummary = {
        ...summary,
        decisionCode: parsed.decisionCode,
        decisionCodeSource: parsed.decisionSource,
        decisionMetadata: parsed.decisionMetadata,
      };

      const updatedCache = {
        ...summaryCache,
        summary: updatedSummary,
      };

      const updatedMetadata = {
        ...existing,
        parseClass: parsed.decisionMetadata.parseClass,
        parsePath: parsed.decisionMetadata.parsePath,
        matchedLabel: parsed.decisionMetadata.matchedLabel,
        scaleLabels: parsed.decisionMetadata.scaleLabels,
        summaryCache: updatedCache,
      };

      await db.transcript.update({
        where: { id },
        data: {
          decisionMetadata: updatedMetadata as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      errors += 1;
      log.error({ id, err: String(err) }, 'Re-parse failed');
    }

    if ((i + 1) % 25 === 0) {
      log.info(
        { progress: `${i + 1}/${candidateIds.length}`, reclassified, stillUnknown, errors },
        'Progress',
      );
    }
  }

  log.info(
    {
      apply,
      total: candidateIds.length,
      reclassified,
      stillUnknown,
      errors,
      newCodeCounts: Object.fromEntries(newCodeCounts),
    },
    apply ? 'Done' : 'Dry-run complete',
  );
}

main()
  .catch((err) => {
    log.error({ err: String(err) }, 'Backfill failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
