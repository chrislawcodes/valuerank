import { db } from '@valuerank/db';
import { NotFoundError } from '@valuerank/shared';
import {
  DOMAIN_ANALYSIS_VALUE_KEYS,
  type DomainAnalysisValueKey,
} from '../../graphql/queries/domain-analysis-values.js';
import {
  type DomainAnalysisValueCounts,
  getMissingReasonLabel,
  hydrateDefinitionAncestors,
  resolveSignatureRuns,
  resolveValuePairsInChunks,
  selectLatestDefinitionPerLineage,
} from '../../graphql/queries/domain/shared.js';
import { computeAggregateFingerprint } from './aggregate/aggregate-helpers.js';
import {
  DOMAIN_ANALYSIS_ASSUMPTION_PREFIX,
  DOMAIN_ANALYSIS_NONE_SIGNATURE,
  DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION,
  DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
  type AnalysisFingerprintRow,
  type AnalysisOutputRow,
  type DomainAnalysisPreparedState,
  type DomainAnalysisSnapshotOutput,
  type SnapshotClient,
} from './domain-analysis-cache-types.js';

export function buildAssumptionKey(domainId: string): string {
  return `${DOMAIN_ANALYSIS_ASSUMPTION_PREFIX}:${domainId}`;
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

function parseCount(raw: unknown): DomainAnalysisValueCounts {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const record = raw as Record<string, unknown>;
  const prioritized = typeof record.prioritized === 'number' && Number.isFinite(record.prioritized) ? record.prioritized : 0;
  const deprioritized = typeof record.deprioritized === 'number' && Number.isFinite(record.deprioritized) ? record.deprioritized : 0;
  const neutral = typeof record.neutral === 'number' && Number.isFinite(record.neutral) ? record.neutral : 0;
  return { prioritized, deprioritized, neutral };
}

function getValueCountsFromAnalysis(output: unknown, modelId: string, valueKey: string): DomainAnalysisValueCounts {
  if (output == null || typeof output !== 'object' || Array.isArray(output)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const perModel = (output as { perModel?: unknown }).perModel;
  if (perModel == null || typeof perModel !== 'object' || Array.isArray(perModel)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const modelData = (perModel as Record<string, unknown>)[modelId];
  if (modelData == null || typeof modelData !== 'object' || Array.isArray(modelData)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const values = (modelData as { values?: unknown }).values;
  if (values == null || typeof values !== 'object' || Array.isArray(values)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  // Analysis outputs store value keys in lowercase (e.g. "power_dominance") while
  // the canonical ValueKey type uses PascalCase (e.g. "Power_Dominance"). Do a
  // case-insensitive lookup so both conventions are handled.
  const valuesRecord = values as Record<string, unknown>;
  const keyLower = valueKey.toLowerCase();
  const valueData = valuesRecord[valueKey]
    ?? Object.entries(valuesRecord).find(([k]) => k.toLowerCase() === keyLower)?.[1];
  if (valueData == null || typeof valueData !== 'object' || Array.isArray(valueData)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  return parseCount((valueData as { count?: unknown }).count);
}

function toCountsRecord(valueMap: Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>): Record<string, DomainAnalysisValueCounts> {
  const record: Record<string, DomainAnalysisValueCounts> = {};
  for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
    record[valueKey] = valueMap.get(valueKey) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  return record;
}

function toPairwiseRecord(
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
): Record<string, Record<string, number>> {
  const record: Record<string, Record<string, number>> = {};
  for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
    const winnerMap = pairwiseWins.get(valueKey) ?? new Map<DomainAnalysisValueKey, number>();
    record[valueKey] = Object.fromEntries(
      Array.from(winnerMap.entries()).map(([opponent, count]) => [opponent, count]),
    );
  }
  return record;
}

function addPairwiseWins(
  pairwiseWins: Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>,
  winner: DomainAnalysisValueKey,
  loser: DomainAnalysisValueKey,
  count: number,
): void {
  if (count <= 0) return;
  const winsForWinner = pairwiseWins.get(winner) ?? new Map<DomainAnalysisValueKey, number>();
  winsForWinner.set(loser, (winsForWinner.get(loser) ?? 0) + count);
  pairwiseWins.set(winner, winsForWinner);
}

export function computeInputHash(params: {
  domainId: string;
  signature: string;
  latestDefinitions: Array<{ id: string; updatedAt: Date }>;
  fingerprints: AnalysisFingerprintRow[];
}): string {
  return computeAggregateFingerprint({
    codeVersion: DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION,
    domainId: params.domainId,
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

export async function prepareDomainAnalysisState(
  domainId: string,
  requestedSignature: string | null,
): Promise<DomainAnalysisPreparedState> {
  const domain = await db.domain.findUnique({
    where: { id: domainId },
    select: { id: true, name: true, defaultModelIds: true },
  });
  if (!domain) {
    throw new NotFoundError('Domain', domainId);
  }

  const definitions = await db.definition.findMany({
    where: { domainId, deletedAt: null },
    select: {
      id: true,
      name: true,
      parentId: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const definitionsById = await hydrateDefinitionAncestors(definitions);
  const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
  const latestDefinitionIds = latestDefinitions.map((definition) => definition.id);
  const definitionNameById = new Map<string, string>(
    definitions.map((definition) => [definition.id, definition.name ?? definition.id]),
  );

  const resolvedSignatureRuns = await resolveSignatureRuns(latestDefinitionIds, requestedSignature, domain.defaultModelIds);
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
    domainId,
    signature: configSignature,
    latestDefinitions,
    fingerprints: fingerprintRows,
  });

  return {
    domain,
    definitions,
    latestDefinitions,
    latestDefinitionIds,
    definitionNameById,
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
  const analysisRows: AnalysisOutputRow[] = state.resolvedSignatureRuns.filteredSourceRunIds.length === 0
    ? []
    : await db.analysisResult.findMany({
      where: {
        runId: { in: state.resolvedSignatureRuns.filteredSourceRunIds },
        analysisType: 'basic',
        status: 'CURRENT',
        deletedAt: null,
      },
      select: {
        runId: true,
        inputHash: true,
        output: true,
      },
    });

  const aggregatedByModel = new Map<string, Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>>();
  const pairwiseWinsByModel = new Map<string, Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>>();
  const analyzedDefinitionIds = new Set<string>();

  // Phase 1: Accumulate raw counts per (definitionId, modelId), tracking how many runs
  // each model contributed to for that vignette.
  type DefinitionModelAcc = {
    valueA: DomainAnalysisValueKey;
    valueB: DomainAnalysisValueKey;
    first: DomainAnalysisValueCounts;
    second: DomainAnalysisValueCounts;
    runCount: number;
  };
  const defModelAcc = new Map<string, Map<string, DefinitionModelAcc>>();

  for (const analysisRow of analysisRows) {
    const definitionId = state.resolvedSignatureRuns.filteredSourceRunDefinitionById.get(analysisRow.runId);
    if (definitionId == null || definitionId === '') continue;
    const pair = valuePairByDefinition.get(definitionId);
    if (!pair) continue;

    const output = analysisRow.output;
    if (output == null || typeof output !== 'object' || Array.isArray(output)) continue;
    const perModel = (output as { perModel?: unknown }).perModel;
    if (perModel == null || typeof perModel !== 'object' || Array.isArray(perModel)) continue;

    let modelMap = defModelAcc.get(definitionId);
    if (!modelMap) {
      modelMap = new Map<string, DefinitionModelAcc>();
      defModelAcc.set(definitionId, modelMap);
    }

    for (const modelId of Object.keys(perModel as Record<string, unknown>)) {
      let acc = modelMap.get(modelId);
      if (!acc) {
        acc = {
          valueA: pair.valueA,
          valueB: pair.valueB,
          first: { prioritized: 0, deprioritized: 0, neutral: 0 },
          second: { prioritized: 0, deprioritized: 0, neutral: 0 },
          runCount: 0,
        };
        modelMap.set(modelId, acc);
      }

      const firstCounts = getValueCountsFromAnalysis(output, modelId, pair.valueA);
      const secondCounts = getValueCountsFromAnalysis(output, modelId, pair.valueB);

      acc.first.prioritized += firstCounts.prioritized;
      acc.first.deprioritized += firstCounts.deprioritized;
      acc.first.neutral += firstCounts.neutral;
      acc.second.prioritized += secondCounts.prioritized;
      acc.second.deprioritized += secondCounts.deprioritized;
      acc.second.neutral += secondCounts.neutral;
      acc.runCount += 1;
    }
  }

  // Phase 2: Normalize each vignette's contribution by its per-model run count, then merge
  // into global aggregates. Dividing by runCount gives the average per-run count, so a
  // vignette run 6 times contributes the same weight as one run once. Models that appear
  // in fewer runs for a given vignette are normalized by their own run count.
  //
  // Simultaneously, record a per-vignette win rate for each (modelId, valueKey) pair.
  // These win rates are later averaged (equal-weight) to produce the cross-domain
  // pooled win rate — every vignette counts once regardless of scenario count.
  const vignetteWinRatesByModel = new Map<string, Map<DomainAnalysisValueKey, number[]>>();

  for (const [definitionId, modelMap] of defModelAcc) {
    for (const [modelId, acc] of modelMap) {
      if (acc.runCount === 0) continue;

      let valueMap = aggregatedByModel.get(modelId);
      if (!valueMap) {
        valueMap = new Map<DomainAnalysisValueKey, DomainAnalysisValueCounts>();
        aggregatedByModel.set(modelId, valueMap);
      }

      let pairwiseWins = pairwiseWinsByModel.get(modelId);
      if (!pairwiseWins) {
        pairwiseWins = new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>();
        pairwiseWinsByModel.set(modelId, pairwiseWins);
      }

      let vigRates = vignetteWinRatesByModel.get(modelId);
      if (!vigRates) {
        vigRates = new Map<DomainAnalysisValueKey, number[]>();
        vignetteWinRatesByModel.set(modelId, vigRates);
      }

      const n = acc.runCount;

      const existingFirst = valueMap.get(acc.valueA) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
      existingFirst.prioritized += acc.first.prioritized / n;
      existingFirst.deprioritized += acc.first.deprioritized / n;
      existingFirst.neutral += acc.first.neutral / n;
      valueMap.set(acc.valueA, existingFirst);

      const existingSecond = valueMap.get(acc.valueB) ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
      existingSecond.prioritized += acc.second.prioritized / n;
      existingSecond.deprioritized += acc.second.deprioritized / n;
      existingSecond.neutral += acc.second.neutral / n;
      valueMap.set(acc.valueB, existingSecond);

      addPairwiseWins(pairwiseWins, acc.valueA, acc.valueB, acc.first.prioritized / n);
      addPairwiseWins(pairwiseWins, acc.valueB, acc.valueA, acc.second.prioritized / n);

      // Per-vignette win rate: use the raw (pre-normalization) accumulated counts.
      // The ratio is the same whether we divide by n or not, so we use raw counts
      // to avoid floating-point amplification. Each vignette contributes exactly
      // one win rate entry — no matter how many runs it had.
      const totalA = acc.first.prioritized + acc.first.deprioritized + acc.first.neutral;
      if (totalA > 0) {
        const ratesA = vigRates.get(acc.valueA) ?? [];
        ratesA.push(acc.first.prioritized / totalA);
        vigRates.set(acc.valueA, ratesA);
      }

      const totalB = acc.second.prioritized + acc.second.deprioritized + acc.second.neutral;
      if (totalB > 0) {
        const ratesB = vigRates.get(acc.valueB) ?? [];
        ratesB.push(acc.second.prioritized / totalB);
        vigRates.set(acc.valueB, ratesB);
      }

      analyzedDefinitionIds.add(definitionId);
    }
  }

  // Compute the equal-weight mean win rate and vignette count for each (model, value).
  const valueWinRatesByModel = new Map<string, Map<DomainAnalysisValueKey, number>>();
  const vignetteCountByModel = new Map<string, Map<DomainAnalysisValueKey, number>>();

  for (const [modelId, vigRates] of vignetteWinRatesByModel) {
    const winRateMap = new Map<DomainAnalysisValueKey, number>();
    const countMap = new Map<DomainAnalysisValueKey, number>();
    valueWinRatesByModel.set(modelId, winRateMap);
    vignetteCountByModel.set(modelId, countMap);

    for (const [valueKey, rates] of vigRates) {
      if (rates.length === 0) continue;
      const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
      winRateMap.set(valueKey, mean * 100); // store as 0–100 percentage
      countMap.set(valueKey, rates.length);
    }
  }

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

  const models = Array.from(aggregatedByModel.entries())
    .map(([modelId, valueMap]) => ({
      model: modelId,
      counts: toCountsRecord(valueMap),
      pairwiseWins: toPairwiseRecord(
        pairwiseWinsByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, Map<DomainAnalysisValueKey, number>>(),
      ),
      valueWinRates: Object.fromEntries(
        valueWinRatesByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, number>()
      ),
      vignetteCount: Object.fromEntries(
        vignetteCountByModel.get(modelId) ?? new Map<DomainAnalysisValueKey, number>()
      ),
    }))
    .sort((left, right) => left.model.localeCompare(right.model));

  return {
    domainId: state.domain.id,
    domainName: state.domain.name,
    totalDefinitions: state.definitions.length,
    targetedDefinitions: state.latestDefinitions.length,
    coveredDefinitions: state.resolvedSignatureRuns.coveredDefinitionIds.size,
    definitionsWithAnalysis: analyzedDefinitionIds.size,
    missingDefinitions,
    models,
  };
}

export async function writeSnapshot(params: {
  client: SnapshotClient;
  domainId: string;
  configSignature: string;
  inputHash: string;
  output: DomainAnalysisSnapshotOutput;
}) {
  const current = await params.client.assumptionAnalysisSnapshot.findFirst({
    where: {
      assumptionKey: buildAssumptionKey(params.domainId),
      analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
      configSignature: params.configSignature,
      status: 'CURRENT',
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  if (current != null && current.inputHash === params.inputHash) {
    return current;
  }

  await params.client.assumptionAnalysisSnapshot.updateMany({
    where: {
      assumptionKey: buildAssumptionKey(params.domainId),
      analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
      configSignature: params.configSignature,
      status: 'CURRENT',
      deletedAt: null,
    },
    data: {
      status: 'SUPERSEDED',
    },
  });

  return params.client.assumptionAnalysisSnapshot.create({
    data: {
      assumptionKey: buildAssumptionKey(params.domainId),
      analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
      inputHash: params.inputHash,
      codeVersion: DOMAIN_ANALYSIS_SNAPSHOT_CODE_VERSION,
      configSignature: params.configSignature,
      config: {
        domainId: params.domainId,
        signature: params.configSignature,
      },
      output: params.output,
      status: 'CURRENT',
    },
  });
}
