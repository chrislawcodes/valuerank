/**
 * @deprecated Tombstone for the run-proximity companion-finding heuristic.
 *
 * This utility is preserved to keep legacy `/analysis/:runId/conditions/...`
 * paired-mode URLs working in `AnalysisConditionDetail.tsx` after the
 * vignette-paired analysis report ships at `/vignette/:definitionId/paired`.
 *
 * The heuristic is wrong-by-design: when multiple companion runs exist for
 * the same `pair_key`, it picks one by createdAt proximity. This silently
 * excludes other runs and can pick the wrong companion. Do not call from
 * new code.
 *
 * Removal is tracked as feature-factory follow-up F-3 in
 * `docs/workflow/feature-runs/vignette-paired-analysis/plan.md`.
 *
 * Originally lifted verbatim from
 * `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx`
 * before that file was deleted.
 */

import type { Run } from '../api/operations/runs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getRunConfigBatchGroupId(run: Run): string | null {
  if (typeof run.pairedBatchGroupId === 'string' && run.pairedBatchGroupId.trim().length > 0) {
    return run.pairedBatchGroupId;
  }
  const raw = run.config?.jobChoiceBatchGroupId;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

function getRunCompanionRunId(run: Run): string | null {
  const raw = run.companionRunId ?? run.config?.companionRunId;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

function getDefinitionPairKey(run: Run): string | null {
  const raw = run.definition?.content;
  if (!isRecord(raw) || !isRecord(raw.methodology)) return null;
  const value = raw.methodology.pair_key;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** @deprecated See file header. Use the server-resolved companion via the
 *  `pressureSensitivity(definitionId: ...)` query instead. */
export function findCompanionPairedRun(currentRun: Run, candidateRuns: Run[]): Run | null {
  const batchGroupId = getRunConfigBatchGroupId(currentRun);
  const pairKey = getDefinitionPairKey(currentRun);

  const candidates = candidateRuns
    .filter((candidate) => candidate.id !== currentRun.id)
    .filter((candidate) => {
      if (batchGroupId) {
        return getRunConfigBatchGroupId(candidate) === batchGroupId;
      }
      if (pairKey) {
        return getDefinitionPairKey(candidate) === pairKey;
      }
      return false;
    });

  if (candidates.length === 0) {
    return null;
  }

  const reciprocalMatch = candidates.find((candidate) => getRunCompanionRunId(candidate) === currentRun.id);
  if (reciprocalMatch) {
    return reciprocalMatch;
  }

  const completedCandidates = candidates.filter((candidate) => candidate.status === 'COMPLETED');
  const rankingPool = completedCandidates.length > 0 ? completedCandidates : candidates;

  const sorted = [...rankingPool].sort((left, right) => (
    Math.abs(new Date(left.createdAt).getTime() - new Date(currentRun.createdAt).getTime())
    - Math.abs(new Date(right.createdAt).getTime() - new Date(currentRun.createdAt).getTime())
  ));

  return sorted[0] ?? null;
}
