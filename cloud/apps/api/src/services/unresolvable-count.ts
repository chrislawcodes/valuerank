import { db } from '@valuerank/db';

export interface UnresolvableByModel {
  modelId: string;
  count: number;
}

export interface UnresolvableCount {
  total: number;
  byModel: UnresolvableByModel[];
}

export async function getUnresolvableCount(runId: string): Promise<UnresolvableCount> {
  const rows = await db.$queryRaw<Array<{ model_id: string; unresolvable: bigint }>>`
    SELECT
      model_id,
      COUNT(*) FILTER (
        WHERE summarized_at IS NOT NULL
        AND decision_code_source IS DISTINCT FROM 'manual'
        AND (
          decision_code = 'other'
          OR (
            decision_code IS NULL
            AND decision_metadata->'summaryCache'->'summary'->'canonicalDecision'->>'decisionState' = 'unknown'
          )
          OR decision_metadata->>'parseClass' = 'ambiguous'
        )
      ) as unresolvable
    FROM transcripts
    WHERE run_id = ${runId}
    GROUP BY model_id
  `;

  const byModel = rows
    .map((r) => ({ modelId: r.model_id, count: Number(r.unresolvable) }))
    .filter((r) => r.count > 0);

  return {
    total: byModel.reduce((sum, r) => sum + r.count, 0),
    byModel,
  };
}
