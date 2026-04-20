import { db } from '@valuerank/db';
import { resolveTranscriptDecisionModel } from '../graphql/queries/domain/decision-model.js';

export interface UnresolvableByModel {
  modelId: string;
  count: number;
}

export interface UnresolvableCount {
  total: number;
  byModel: UnresolvableByModel[];
}

export async function getUnresolvableCount(runId: string): Promise<UnresolvableCount> {
  const transcripts = await db.transcript.findMany({
    where: {
      runId,
      summarizedAt: { not: null },
    },
    select: {
      modelId: true,
      decisionMetadata: true,
      definitionSnapshot: true,
      scenario: {
        select: { orientationFlipped: true },
      },
    },
  });

  const byModelMap = new Map<string, number>();

  for (const t of transcripts) {
    const resolved = resolveTranscriptDecisionModel({
      decisionMetadata: t.decisionMetadata,
      definitionSnapshot: t.definitionSnapshot,
      orientationFlipped: t.scenario?.orientationFlipped ?? null,
    });

    if (resolved.canonical.direction === 'unknown') {
      byModelMap.set(t.modelId, (byModelMap.get(t.modelId) ?? 0) + 1);
    }
  }

  const byModel = Array.from(byModelMap.entries())
    .map(([modelId, count]) => ({ modelId, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: byModel.reduce((sum, r) => sum + r.count, 0),
    byModel,
  };
}
