import { db } from '@valuerank/db';
import { getMissingReasonLabel, resolveSignatureRuns, resolveValuePairsInChunks } from '../../graphql/queries/domain/shared.js';
import { computeAggregateFingerprint } from './aggregate/aggregate-helpers.js';
import {
  DOMAIN_ANALYSIS_ASSUMPTION_PREFIX,
  DOMAIN_ANALYSIS_NONE_SIGNATURE,
  DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION,
  DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
  type DomainAnalysisBuildProgress,
  type AnalysisFingerprintRow,
  type DomainAnalysisPreparedState,
  type DomainAnalysisSnapshotOutput,
  type SnapshotClient,
} from './domain-analysis-cache-types.js';
import { computeCellWeightedDomainRates } from './domain-analysis-cell-win-rates.js';
import { accumulateTranscriptCells, type CellCounts } from './transcript-cell-accumulator.js';
import { type DomainAnalysisScope } from './domain-analysis-scope.js';
import { resolveDomainAnalysisScopeDefinitions } from './domain-analysis-scope-loader.js';

export function buildAssumptionKey(scope: DomainAnalysisScope, domainId: string): string {
  return scope === 'ALL_DOMAINS'
    ? `${DOMAIN_ANALYSIS_ASSUMPTION_PREFIX}:all-domains`
    : `${DOMAIN_ANALYSIS_ASSUMPTION_PREFIX}:${domainId}`;
}

export function normalizeSignature(signature: string | null): string {
  return signature ?? DOMAIN_ANALYSIS_NONE_SIGNATURE;
}

export function parseSnapshotOutput(raw: unknown): DomainAnalysisSnapshotOutput | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Partial<DomainAnalysisSnapshotOutput>;
  if (
    typeof candidate.domainId !== 'string'
    || typeof candidate.domainName !== 'string'
    || typeof candidate.totalDefinitions !== 'number'
    || typeof candidate.targetedDefinitions !== 'number'
    || typeof candidate.coveredDefinitions !== 'number'
    || typeof candidate.definitionsWithAnalysis !== 'number'
    || !Array.isArray(candidate.missingDefinitions)
    || !Array.isArray(candidate.models)
  ) {
    return null;
  }
  return candidate as DomainAnalysisSnapshotOutput;
}

export function computeInputHash(params: {
  scope: DomainAnalysisScope;
  domainIds: string[];
  signature: string;
  latestDefinitions: Array<{ id: string; updatedAt: Date }>;
  fingerprints: AnalysisFingerprintRow[];
}): string {
  return computeAggregateFingerprint({
    codeVersion: DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION,
    scope: params.scope,
    domainIds: params.domainIds.slice().sort(),
    signature: params.signature,
    definitions: params.latestDefinitions.map((definition) => ({
      id: definition.id,
      updatedAt: definition.updatedAt.toISOString(),
    })),
    analyses: params.fingerprints
      .slice()
      .sort((left, right) => left.runId.localeCompare(right.runId))
      .map((row) => ({ runId: row.runId, inputHash: row.inputHash })),
  }).slice(0, 16);
}

export async function prepareDomainAnalysisState(params: {
  scope: DomainAnalysisScope;
  domainId: string;
  requestedSignature: string | null;
}): Promise<DomainAnalysisPreparedState> {
  const scopeData = await resolveDomainAnalysisScopeDefinitions({
    scope: params.scope,
    domainId: params.domainId,
  });

  const defaultModelIds = scopeData.scope === 'ALL_DOMAINS' ? [] : scopeData.domain.defaultModelIds;
  const resolvedSignatureRuns = await resolveSignatureRuns(scopeData.latestDefinitionIds, params.requestedSignature, defaultModelIds);
  const selectedSignature = resolvedSignatureRuns.selectedSignature;
  const configSignature = normalizeSignature(selectedSignature);

  const fingerprintRows = resolvedSignatureRuns.filteredSourceRunIds.length === 0
    ? []
    : await db.analysisResult.findMany({
        where: {
          runId: { in: resolvedSignatureRuns.filteredSourceRunIds },
          analysisType: 'basic',
          status: 'CURRENT',
          deletedAt: null,
        },
        select: {
          runId: true,
          inputHash: true,
        },
      });

  const inputHash = computeInputHash({
    scope: scopeData.scope,
    domainIds: scopeData.domains.map((domain) => domain.id),
    signature: configSignature,
    latestDefinitions: scopeData.latestDefinitions,
    fingerprints: fingerprintRows,
  });

  return {
    scope: scopeData.scope,
    domain: scopeData.domain,
    domains: scopeData.domains,
    definitions: scopeData.definitions,
    latestDefinitions: scopeData.latestDefinitions,
    latestDefinitionIds: scopeData.latestDefinitionIds,
    definitionNameById: scopeData.definitionNameById,
    definitionDomainIdById: scopeData.definitionDomainIdById,
    resolvedSignatureRuns,
    selectedSignature,
    configSignature,
    fingerprintRows,
    inputHash,
  };
}

export async function buildSnapshotOutput(
  state: DomainAnalysisPreparedState,
  options?: {
    onProgress?: (progress: DomainAnalysisBuildProgress) => Promise<void> | void;
  },
): Promise<DomainAnalysisSnapshotOutput> {
  const valuePairByDefinition = await resolveValuePairsInChunks(state.latestDefinitionIds);

  const TRANSCRIPT_BATCH_SIZE = 500;
  const cellMap = new Map<string, CellCounts>();
  const totalRuns = state.resolvedSignatureRuns.filteredSourceRunIds.length;
  let completedRuns = 0;

  if (state.resolvedSignatureRuns.filteredSourceRunIds.length > 0) {
    // Keep each transcript read bounded so large domains do not exhaust memory
    // or the Prisma bridge. Aggregate each batch into the shared cell map.
    for (const runId of state.resolvedSignatureRuns.filteredSourceRunIds) {
      let offset = 0;
      let fetchedCount = TRANSCRIPT_BATCH_SIZE;

      while (fetchedCount >= TRANSCRIPT_BATCH_SIZE) {
        const batch = await db.transcript.findMany({
          where: {
            runId,
            deletedAt: null,
          },
          select: {
            id: true,
            runId: true,
            modelId: true,
            decisionMetadata: true,
            definitionSnapshot: true,
            deletedAt: true,
            scenario: {
              select: {
                id: true,
                content: true,
                orientationFlipped: true,
                deletedAt: true,
              },
            },
          },
          orderBy: { id: 'asc' },
          take: TRANSCRIPT_BATCH_SIZE,
          skip: offset,
        });

        fetchedCount = batch.length;
        if (fetchedCount === 0) break;

        const batchCellMap = accumulateTranscriptCells({
          transcripts: batch,
          filteredSourceRunDefinitionById: state.resolvedSignatureRuns.filteredSourceRunDefinitionById,
        });

        for (const [key, counts] of batchCellMap.entries()) {
          const existing = cellMap.get(key) ?? { wins: 0, losses: 0, neutrals: 0 };
          existing.wins += counts.wins;
          existing.losses += counts.losses;
          existing.neutrals += counts.neutrals;
          cellMap.set(key, existing);
        }

        offset += fetchedCount;
      }

      completedRuns += 1;
      if (options?.onProgress != null) {
        await options.onProgress({
          completedRuns,
          totalRuns,
          currentRunId: runId,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }
  // Derive per-(canonicalValueA::canonicalValueB::modelId) vote counts so the significance
  // resolver can compute a true per-model preference score for each value pair.
  //
  // Key format:  canonicalValueA::canonicalValueB::modelId
  //   where canonicalValueA < canonicalValueB alphabetically.
  // wins  = total times model chose canonicalValueA across ALL definitions in this pair
  //         (both presentation directions combined).
  // losses = total times model chose canonicalValueB.
  //
  // wins/(wins+losses) is the model's real preference score for canonicalValueA, free of
  // the 50/50 cancellation that happened when summing both value-key cells per definition.
  const valuePairModelVotes: Record<string, { wins: number; losses: number }> = {};

  // First pass: group cells by (definitionId::modelId) and accumulate per-value-key counts.
  type ValueKeyCounts = { wins: number; losses: number };
  const defModelCells = new Map<string, Map<string, ValueKeyCounts>>();
  for (const [key, counts] of cellMap.entries()) {
    const parts = key.split('::');
    const definitionId = parts[0];
    const modelId = parts[1];
    const valueKey = parts[2];
    if (definitionId === undefined || modelId === undefined || valueKey === undefined) continue;
    const defModelKey = `${definitionId}::${modelId}`;
    let byValueKey = defModelCells.get(defModelKey);
    if (byValueKey === undefined) {
      byValueKey = new Map<string, ValueKeyCounts>();
      defModelCells.set(defModelKey, byValueKey);
    }
    const existing = byValueKey.get(valueKey) ?? { wins: 0, losses: 0 };
    existing.wins += counts.wins;
    existing.losses += counts.losses;
    byValueKey.set(valueKey, existing);
  }

  // Second pass: for each (definition, model), form the canonical pair key and accumulate
  // wins for canonicalValueA (alphabetically first) across all definitions in the pair.
  for (const [defModelKey, byValueKey] of defModelCells.entries()) {
    const modelId = defModelKey.split('::')[1];
    if (modelId === undefined) continue;
    const sortedValueKeys = [...byValueKey.keys()].sort();
    if (sortedValueKeys.length !== 2) continue;
    const [canonicalA, canonicalB] = sortedValueKeys as [string, string];
    const pairKey = `${canonicalA}::${canonicalB}::${modelId}`;
    const aCell = byValueKey.get(canonicalA) ?? { wins: 0, losses: 0 };
    const entry = valuePairModelVotes[pairKey] ?? { wins: 0, losses: 0 };
    entry.wins += aCell.wins;
    entry.losses += aCell.losses;
    valuePairModelVotes[pairKey] = entry;
  }

  // Derive per-(definitionId::modelId::canonicalA::canonicalB::ownLevel::opponentLevel)
  // cell outcomes so the agreement resolver can work from canonical binary cell counts.
  type CellLevelCounts = { aChoices: number; bChoices: number; neutrals: number };
  const cellsByGroup = new Map<string, Map<string, CellCounts>>();
  for (const [key, counts] of cellMap.entries()) {
    const parts = key.split('::');
    if (parts.length !== 5) continue;
    const [definitionId, modelId, valueKey, ownLevel, opponentLevel] = parts;
    if (
      definitionId === undefined
      || modelId === undefined
      || valueKey === undefined
      || ownLevel === undefined
      || opponentLevel === undefined
    ) {
      continue;
    }
    const groupKey = `${definitionId}::${modelId}::${ownLevel}::${opponentLevel}`;
    let byValueKey = cellsByGroup.get(groupKey);
    if (byValueKey === undefined) {
      byValueKey = new Map<string, CellCounts>();
      cellsByGroup.set(groupKey, byValueKey);
    }
    byValueKey.set(valueKey, counts);
  }

  const cellLevelOutcomes: Record<string, CellLevelCounts> = {};
  for (const [groupKey, byValueKey] of cellsByGroup.entries()) {
    if (byValueKey.size !== 2) continue;
    const sortedKeys = [...byValueKey.keys()].sort();
    const [canonicalA, canonicalB] = sortedKeys;
    if (canonicalA === undefined || canonicalB === undefined) continue;
    const aCell = byValueKey.get(canonicalA);
    const bCell = byValueKey.get(canonicalB);
    if (aCell === undefined || bCell === undefined) continue;
    const [definitionId, modelId, ownLevel, opponentLevel] = groupKey.split('::');
    if (
      definitionId === undefined
      || modelId === undefined
      || ownLevel === undefined
      || opponentLevel === undefined
    ) {
      continue;
    }
    const outKey = `${definitionId}::${modelId}::${canonicalA}::${canonicalB}::${ownLevel}::${opponentLevel}`;
    cellLevelOutcomes[outKey] = {
      aChoices: aCell.wins,
      bChoices: bCell.wins,
      neutrals: aCell.neutrals,
    };
  }

  const { models, analyzedDefinitionIds } = computeCellWeightedDomainRates({
    cellMap,
    filteredSourceRunDefinitionById: state.resolvedSignatureRuns.filteredSourceRunDefinitionById,
    definitionValuePairById: valuePairByDefinition,
  });

  const missingReasonByDefinitionId = new Map(state.resolvedSignatureRuns.missingReasonByDefinitionId);
  for (const coveredDefinitionId of state.resolvedSignatureRuns.coveredDefinitionIds) {
    if (!analyzedDefinitionIds.has(coveredDefinitionId)) {
      missingReasonByDefinitionId.set(coveredDefinitionId, 'NO_ANALYSIS');
    }
  }
  const missingDefinitions = state.latestDefinitionIds
    .filter((definitionId) => missingReasonByDefinitionId.has(definitionId))
    .map((definitionId) => {
      const reasonCode = missingReasonByDefinitionId.get(definitionId) ?? 'NO_SIGNATURE_MATCH';
      return {
        definitionId,
        definitionName: state.definitionNameById.get(definitionId) ?? definitionId,
        reasonCode,
        reasonLabel: getMissingReasonLabel(reasonCode),
        missingAllModels: true,
        missingModelIds: [],
        missingModelLabels: [],
      };
    });

  return {
    domainId: state.domain.id,
    domainName: state.domain.name,
    scope: state.scope,
    totalDefinitions: state.definitions.length,
    targetedDefinitions: state.latestDefinitions.length,
    coveredDefinitions: state.resolvedSignatureRuns.coveredDefinitionIds.size,
    definitionsWithAnalysis: analyzedDefinitionIds.size,
    missingDefinitions,
    models,
    contributionSummary: [],
    excludedDataSummary: [],
    valuePairModelVotes,
    cellLevelOutcomes,
  };
}

export async function writeSnapshot(params: {
  client: SnapshotClient;
  scope: DomainAnalysisScope;
  domainId: string;
  configSignature: string;
  inputHash: string;
  output: DomainAnalysisSnapshotOutput;
}) {
  const assumptionKey = buildAssumptionKey(params.scope, params.domainId);

  await params.client.assumptionAnalysisSnapshot.updateMany({
    where: {
      assumptionKey,
      analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
      status: 'CURRENT',
      deletedAt: null,
      OR: [
        { configSignature: params.configSignature },
        { inputHash: params.inputHash },
      ],
    },
    data: {
      status: 'SUPERSEDED',
    },
  });

  return params.client.assumptionAnalysisSnapshot.create({
    data: {
      assumptionKey,
      analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
      inputHash: params.inputHash,
      codeVersion: DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION,
      configSignature: params.configSignature,
      config: {
        scope: params.scope,
        domainId: params.domainId,
        signature: params.configSignature,
      },
      output: params.output,
      status: 'CURRENT',
    },
  });
}
