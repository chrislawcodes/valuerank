/**
 * Pull a few transcripts where my truth-table-derived v2 canonical disagrees
 * with the existing v1 canonical in prod. Print both side-by-side so we can
 * diagnose which side is wrong.
 */
import { pathToFileURL } from 'node:url';

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

import { canonicalFromDecisionCode, pairFromSnapshot } from './backfill-canonical-v2-migration.js';

const log = createLogger('scripts:inspect-canonical-drift');

const LIMIT = 20;

async function main(): Promise<void> {
  const ids = await db.$queryRawUnsafe<{ id: string }[]>(
    `
    SELECT t.id FROM transcripts t
    WHERE t.decision_metadata->'summaryCache'->'summary'->>'decisionCode' IS NOT NULL
    ORDER BY random()
    LIMIT ${LIMIT}
    `,
  );

  log.info({ sampled: ids.length }, 'Sampled random candidates');

  for (const { id } of ids) {
    const t = await db.transcript.findUnique({
      where: { id },
      select: {
        id: true,
        scenarioId: true,
        definitionSnapshot: true,
        decisionMetadata: true,
      },
    });
    if (t == null) continue;
    const meta = (t.decisionMetadata as Record<string, unknown> | null) ?? {};
    const sc = meta.summaryCache as Record<string, unknown> | undefined;
    const summary = sc?.summary as Record<string, unknown> | undefined;
    if (summary == null) continue;
    const decisionCode = summary.decisionCode as string | undefined;
    const existingCanonical = summary.canonicalDecision as Record<string, unknown> | undefined;
    const pair = pairFromSnapshot(t.definitionSnapshot);
    if (pair == null) continue;
    let orientationFlipped = false;
    if (t.scenarioId != null) {
      const s = await db.scenario.findUnique({
        where: { id: t.scenarioId },
        select: { orientationFlipped: true },
      });
      orientationFlipped = s?.orientationFlipped ?? false;
    }
    if (decisionCode == null) continue;
    const computed = canonicalFromDecisionCode(decisionCode, pair, orientationFlipped);
    const drifted = (existingCanonical?.favoredValueKey ?? null) !== computed.favoredValueKey
      || existingCanonical?.strength !== computed.strength
      || existingCanonical?.decisionState !== computed.decisionState;
    if (!drifted) continue;

    // Only include the parser-evidence fields we care about, not the whole dump.
    const parserEvidence = {
      matchedLabel: meta.matchedLabel ?? null,
      parseClass: meta.parseClass ?? null,
      parsePath: meta.parsePath ?? null,
      parserVersion: meta.parserVersion ?? null,
    };

    log.info(
      {
        id: t.id,
        orientationFlipped,
        pair,
        decisionCode,
        existing: {
          favoredValueKey: existingCanonical?.favoredValueKey,
          strength: existingCanonical?.strength,
          direction: existingCanonical?.direction,
          decisionState: existingCanonical?.decisionState,
          cacheVersion: existingCanonical?.cacheVersion,
        },
        computed,
        parserEvidence,
      },
      'DRIFT',
    );
  }
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isDirectRun) {
  main()
    .catch((err) => {
      log.error({ err: String(err) }, 'Inspect failed');
      process.exitCode = 1;
    })
    .finally(() => {
      void db.$disconnect();
    });
}
