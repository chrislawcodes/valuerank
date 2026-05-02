import { db } from '@valuerank/db';
import { getMissingReasonLabel, resolveSignatureRuns, resolveValuePairsInChunks } from '../../graphql/queries/domain/shared.js';
import { computeAggregateFingerprint } from './aggregate/aggregate-helpers.js';
import {
  DOMAIN_ANALYSIS_ASSUMPTION_PREFIX,
  DOMAIN_ANALYSIS_NONE_SIGNATURE,
  DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION,
  DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
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
): Promise<DomainAnalysisSnapshotOutput> {
  const valuePairByDefinition = await resolveValuePairsInChunks(state.latestDefinitionIds);

  const TRANSCRIPT_BATCH_SIZE = 500;
  const cellMap = new Map<string, CellCounts>();

  if (state.resolvedSignatureRuns.filteredSourceRunIds.length > 0) {
    let offset = 0;
    let fetchedCount = TRANSCRIPT_BATCH_SIZE;

    while (fetchedCount >= TRANSCRIPT_BATCH_SIZE) {
      const batch = await db.transcript.findMany({
        where: {
          runId: { in: state.resolvedSignatureRuns.filteredSourceRunIds },
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
