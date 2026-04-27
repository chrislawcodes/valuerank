import { db } from '@valuerank/db';
import { getTranscriptResponseText } from '../../queue/handlers/summarize-types.js';
import {
  type AnomalyDetectionMode,
  type AnomalyDraft,
  type AnomalyThresholds,
  toJsonValue,
} from './anomaly-detection.js';

type InvalidResponseFailureProbeRow = {
  probeResultsId: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  sampleIndex: number;
};

type InvalidResponseFailureTranscriptRow = {
  transcriptId: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  sampleIndex: number;
  content: unknown;
};

/**
 * INVALID_RESPONSE_FAILURE anomalies are slot-keyed rather than transcript-keyed.
 *
 * Existing detectors (e.g. STRANDED_TRANSCRIPT) use the transcript ID as the subject
 * because the anomaly is about that specific transcript row. INVALID_RESPONSE_FAILURE
 * is about a *slot* (the (run, scenario, model, sampleIndex) tuple), not any one
 * transcript at that slot, because:
 *
 *   1. The forward path (post-PR #760) has NO transcript at the slot — only a FAILED
 *      probe_results row. A transcript-keyed subject would have nothing to bind to.
 *   2. When a slot is re-probed, the old transcript is soft-deleted and a new one is
 *      created at the same slot. Transcript-keyed subjects would create a fresh anomaly
 *      for the new transcript while the old anomaly stays open pointing at a deleted row.
 *
 * Slot-keyed subjects let `syncAnomalies()` cleanly close the anomaly when the slot is
 * fixed (no failure shape detected at that slot any more), regardless of which underlying
 * transcript or probe_results row currently lives there.
 *
 * The empty-string fallback for null scenarioId is safe in practice because scenarioId
 * is a CUID — never an empty string in real data — so `runId::modelId:N` cannot collide
 * with `runId:scenarioId:modelId:N`. CUIDs also never contain `:`, so the colon
 * separator is unambiguous.
 */
function buildInvalidResponseFailureSubject(
  runId: string,
  scenarioId: string | null,
  modelId: string,
  sampleIndex: number,
): string {
  return `${runId}:${scenarioId ?? ''}:${modelId}:${sampleIndex}`;
}

function buildInvalidResponseFailureDraft(
  runId: string,
  scenarioId: string | null,
  modelId: string,
  sampleIndex: number,
  shape: 'forward' | 'historical',
  transcriptId: string | null,
  probeResultId: string | null,
): AnomalyDraft {
  return {
    type: 'INVALID_RESPONSE_FAILURE',
    subject: buildInvalidResponseFailureSubject(runId, scenarioId, modelId, sampleIndex),
    details: toJsonValue({
      scenarioId,
      modelId,
      sampleIndex,
      transcriptId,
      probeResultId,
      shape,
      reprobeAttempts: 0,
    }),
  };
}

/**
 * Detects INVALID_RESPONSE_FAILURE anomalies via two query paths:
 *
 *   PATH A (forward): A FAILED probe_results row with error_code='INVALID_RESPONSE'
 *     and no associated non-deleted transcript at the slot. This is the post-PR #760
 *     shape — adapter-level guards now mark these probes FAILED instead of writing an
 *     empty transcript.
 *
 *   PATH B (historical): A non-deleted, summarized transcript whose visible response
 *     text is empty. This is the pre-PR #760 shape — the empty transcript exists in
 *     the database because the adapter silently coerced the empty content.
 *
 * `_options` is accepted for parity with other detectors' (default | audit) signature,
 * but the detector returns the SAME drafts in both modes. Source coexistence between
 * default and audit rows for the same slot is fine — the unique constraint
 * (runId, type, subject, source) explicitly allows it, and the UI layer dedupes by
 * subject when rendering. Filtering audit drafts inside the detector would be unsafe:
 * `syncAnomalies()` resolves any open anomaly whose subject is missing from the draft
 * list, so a filtered draft would resolve a still-valid audit-source anomaly on the
 * next sweep.
 *
 * Forward-takes-precedence in dedup: when both PATH A and PATH B match the same slot
 * (rare — would happen only if a stale empty transcript and a new FAILED probe coexist
 * at the same slot), the forward draft wins because it carries the more recent
 * probe_results id and reflects the current failure shape. The historical draft is
 * skipped to prevent two drafts with the same subject in the return value, which would
 * cause a UNIQUE constraint violation downstream in syncAnomalies/upsertAnomaly.
 */
export async function detectInvalidResponseFailures(
  runId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options?: AnomalyDetectionMode | AnomalyThresholds,
): Promise<AnomalyDraft[]> {
  const probeResultRows = await db.$queryRaw<InvalidResponseFailureProbeRow[]>`
    SELECT pr.id AS "probeResultsId",
           pr.run_id AS "runId",
           pr.scenario_id AS "scenarioId",
           pr.model_id AS "modelId",
           pr.sample_index AS "sampleIndex"
    FROM probe_results pr
    WHERE pr.run_id = ${runId}
      AND pr.status = 'FAILED'
      AND pr.error_code = 'INVALID_RESPONSE'
      AND pr.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM transcripts t
        WHERE t.run_id = pr.run_id
          AND t.scenario_id = pr.scenario_id
          AND t.model_id = pr.model_id
          AND t.sample_index = pr.sample_index
          AND t.deleted_at IS NULL
      )
  `;

  const draftsBySlot = new Map<string, AnomalyDraft>();
  for (const row of probeResultRows) {
    const subject = buildInvalidResponseFailureSubject(row.runId, row.scenarioId, row.modelId, row.sampleIndex);
    draftsBySlot.set(
      subject,
      buildInvalidResponseFailureDraft(
        row.runId,
        row.scenarioId,
        row.modelId,
        row.sampleIndex,
        'forward',
        null,
        row.probeResultsId,
      )
    );
  }

  // PATH B loads candidate transcripts and applies the empty-text check in JS because
  // getTranscriptResponseText iterates content.turns[].targetResponse with whitespace
  // trimming — non-trivial to express in SQL. At current volume (≤2k transcripts/run)
  // this is fine; if anomaly volume grows, push the empty check into a Postgres JSONB
  // expression to avoid loading transcript content into memory.
  const transcriptRows = await db.$queryRaw<InvalidResponseFailureTranscriptRow[]>`
    SELECT t.id AS "transcriptId",
           t.run_id AS "runId",
           t.scenario_id AS "scenarioId",
           t.model_id AS "modelId",
           t.sample_index AS "sampleIndex",
           t.content AS "content"
    FROM transcripts t
    WHERE t.run_id = ${runId}
      AND t.deleted_at IS NULL
      AND t.summarized_at IS NOT NULL
  `;

  for (const row of transcriptRows) {
    if (getTranscriptResponseText(row.content).length !== 0) {
      continue;
    }

    const subject = buildInvalidResponseFailureSubject(row.runId, row.scenarioId, row.modelId, row.sampleIndex);
    // Forward-takes-precedence: if PATH A already produced a draft for this slot,
    // skip the historical draft to keep one draft per subject.
    if (draftsBySlot.has(subject)) {
      continue;
    }

    draftsBySlot.set(
      subject,
      buildInvalidResponseFailureDraft(
        row.runId,
        row.scenarioId,
        row.modelId,
        row.sampleIndex,
        'historical',
        row.transcriptId,
        null,
      )
    );
  }

  return [...draftsBySlot.values()];
}
