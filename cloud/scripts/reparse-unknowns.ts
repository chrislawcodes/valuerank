/**
 * Targeted reparse of individual transcripts. Enqueues a
 * `summarize_transcript` PgBoss job per transcript id — with
 * `forceSummarize: true` so the worker's cache guard (response-sha256
 * + parser-version + model-id match) does NOT short-circuit the job.
 * The normal summarize worker picks the job up, runs the current parser
 * against the stored response, and rewrites summaryCache in place.
 *
 * Use this to pick up parser improvements without forcing a full-run
 * re-summarization (which would re-process every transcript in the run).
 *
 * Run with an explicit id list:
 *   cd cloud
 *   DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx scripts/reparse-unknowns.ts \
 *     <transcriptId1> <transcriptId2> ...
 *
 * Or run with no args to reparse the default id list below (edit to
 * suit the current batch). Leaving the defaults in place documents the
 * exact batch this script was first built for — three stale-unknown
 * transcripts recovered in PR #719 (anchor-tier parser) + PR #729
 * (refusal regex expansion):
 *   cmo2qc73428at4wef9ieszg5l (mistral) → resolved via text_label_anchor
 *   cmo2adfew0cwu6lhmqh3i6628 (mistral) → resolved via text_label_anchor
 *   cmng9b26g054111hsdh6lic70 (grok-4)  → refusal via refusal_detected
 *
 * Verify results after the workers process the jobs (a few seconds):
 *   SELECT id,
 *          decision_metadata->'summaryCache'->'summary'
 *            ->'canonicalDecision'->>'decisionState' AS state,
 *          decision_metadata->>'parsePath' AS parse_path
 *   FROM transcripts WHERE id IN ('<ids>');
 */

import { PgBoss } from 'pg-boss';
import { db } from '@valuerank/db';

const DEFAULT_TRANSCRIPT_IDS = [
  'cmo2qc73428at4wef9ieszg5l',
  'cmo2adfew0cwu6lhmqh3i6628',
  'cmng9b26g054111hsdh6lic70',
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl == null || databaseUrl === '') {
    throw new Error('DATABASE_URL env var required');
  }

  const cliIds = process.argv.slice(2);
  const TRANSCRIPT_IDS = cliIds.length > 0 ? cliIds : DEFAULT_TRANSCRIPT_IDS;
  if (cliIds.length === 0) {
    console.log(
      `No transcript ids on CLI — using the default batch of ${DEFAULT_TRANSCRIPT_IDS.length}.`,
    );
  }

  // Look up run_id for each transcript — the summarize job needs both ids.
  const rows = await db.transcript.findMany({
    where: { id: { in: TRANSCRIPT_IDS } },
    select: { id: true, runId: true, modelId: true },
  });

  if (rows.length !== TRANSCRIPT_IDS.length) {
    const found = new Set(rows.map((r) => r.id));
    const missing = TRANSCRIPT_IDS.filter((id) => !found.has(id));
    throw new Error(`Transcripts not found: ${missing.join(', ')}`);
  }

  console.log('Target transcripts:');
  for (const r of rows) {
    console.log(`  ${r.id}  model=${r.modelId}  run=${r.runId}`);
  }

  const boss = new PgBoss({ connectionString: databaseUrl });
  await boss.start();

  try {
    for (const r of rows) {
      const jobId = await boss.send('summarize_transcript', {
        runId: r.runId,
        transcriptId: r.id,
        // Bypass the response-sha256 / parser-version / model-id cache guard
        // so the worker actually re-runs the Python parser against the
        // stored response. Without this, the handler short-circuits with
        // `cache-hit` and returns the stale metadata unchanged.
        forceSummarize: true,
      });
      console.log(`Enqueued summarize job ${jobId} for transcript ${r.id}`);
    }
  } finally {
    await boss.stop({ graceful: true });
  }

  console.log('\nAll 3 jobs queued. Workers typically pick up within seconds.');
  console.log('Verify afterwards with:');
  console.log("  SELECT id, decision_metadata->'summaryCache'->'summary'->'canonicalDecision'->>'decisionState' AS state");
  console.log(`  FROM transcripts WHERE id IN ('${TRANSCRIPT_IDS.join("','")}');`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
