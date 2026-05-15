// Read accessors over the persisted domain-analysis snapshot, used by
// resolvers that consume snapshot output without participating in the cache
// orchestration (refresh/queue/validation) that lives in domain-analysis-cache.

import { db } from '@valuerank/db';
import {
  getCurrentSnapshot,
  parseBuildProgress,
} from './domain-analysis-cache.js';
import { parseSnapshotOutput } from './domain-analysis-snapshot-builder.js';
import type { DomainAnalysisScope } from './domain-analysis-scope.js';
import type { DomainAnalysisBuildProgress } from './domain-analysis-cache-types.js';

/**
 * Read snapshot state for the modelAgreementOnTradeoffs / clustering paths:
 * the per-cell outcomes if the snapshot has them, otherwise the buildProgress
 * placeholder so the caller can surface an UPDATING state. Returns null when
 * no CURRENT snapshot exists.
 */
export async function readModelAgreementSnapshotStateFromSnapshot(
  scope: DomainAnalysisScope,
  domainId: string,
  configSignature: string,
): Promise<{
  cellLevelOutcomes: Record<string, { aChoices: number; bChoices: number; neutrals: number }> | null;
  buildProgress: DomainAnalysisBuildProgress | null;
  inputHash: string | null;
} | null> {
  const snapshot = await getCurrentSnapshot(db, scope, domainId, configSignature);
  if (snapshot == null) {
    return null;
  }

  const parsed = parseSnapshotOutput(snapshot.output);
  if (parsed?.cellLevelOutcomes != null) {
    return {
      cellLevelOutcomes: parsed.cellLevelOutcomes,
      buildProgress: null,
      inputHash: snapshot.inputHash,
    };
  }

  return {
    cellLevelOutcomes: null,
    buildProgress: parseBuildProgress(snapshot.output),
    inputHash: snapshot.inputHash,
  };
}
