import { db, resolveDefinitionContent } from '@valuerank/db';
import { formatVnewLabel, formatVnewSignature } from '@valuerank/shared/trial-signature';
import { DOMAIN_ANALYSIS_VALUE_KEYS, type DomainAnalysisValueKey, extractValuePair } from '../domain-analysis-values.js';
import type { DomainAnalysisVignetteDetail } from './types-detail.js';
import { runMatchesSignature, selectDefaultVnewSignature } from './planning-utils.js';
export { selectLatestDefinitionPerLineage, hydrateDefinitionAncestors } from '../../../services/definition-lineage.js';
export type { LineageDefinitionRow } from '../../../services/definition-lineage.js';
export {
  buildRawDecisionEvidence,
  DECISION_MODEL_READ_RULES,
  canonicalDecisionToLegacyScore,
  resolveCanonicalDecision,
  resolveDecisionModel,
  resolveTranscriptDecisionModel,
} from './decision-model.js';
export type {
  CanonicalDecision,
  DecisionDirection,
  DecisionReadMode,
  DecisionReadRule,
  DecisionReadSurface,
  DecisionModelInput,
  DecisionModelResult,
  DecisionPair,
  DecisionSource,
  DecisionStrength,
  RawDecisionEvidence,
  TranscriptDecisionModelInput,
  TranscriptDecisionModelResult,
  ValueStatementEntry,
} from './decision-model.js';

export { formatVnewLabel, formatVnewSignature };
export { aggregateValueCountsFromTranscripts, incrementPairwiseWin, isDomainAnalysisValueKey } from './domain-analysis-aggregation.js';
export { computeFullBTScores, computeSmoothedLogOddsScore } from './domain-analysis-scoring.js';
export type {
  DomainAnalysisConditionDetail,
  DomainAnalysisConditionTranscript,
  DomainAnalysisVignetteDetail,
} from './types-detail.js';

export const MAX_LIMIT = 500;
export const DEFAULT_LIMIT = 50;
const VALUE_PAIR_RESOLVE_CHUNK_SIZE = 20;
export type DomainAnalysisScoreMethod = 'LOG_ODDS' | 'FULL_BT';

export type DefinitionRow = {
  id: string;
  name?: string;
  parentId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type DomainAnalysisValueCounts = {
  prioritized: number;
  deprioritized: number;
  neutral: number;
};

export type DomainAnalysisValuePair = {
  valueA: DomainAnalysisValueKey;
  valueB: DomainAnalysisValueKey;
};

export type DomainAnalysisValueScore = {
  valueKey: DomainAnalysisValueKey;
  score: number;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalComparisons: number;
};

export type DomainAnalysisUnavailableModel = {
  model: string;
  label: string;
  reason: string;
};

export type DomainAnalysisMissingDefinition = {
  definitionId: string;
  definitionName: string;
  reasonCode: DomainAnalysisMissingReasonCode;
  reasonLabel: string;
  missingAllModels: boolean;
  missingModelIds: string[];
  missingModelLabels: string[];
};

export type DomainAnalysisValueDetailResult = {
  domainId: string;
  domainName: string;
  modelId: string;
  modelLabel: string;
  valueKey: DomainAnalysisValueKey;
  score: number;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  targetedDefinitions: number;
  coveredDefinitions: number;
  missingDefinitionIds: string[];
  vignettes: DomainAnalysisVignetteDetail[];
  generatedAt: Date;
};

export type DomainAvailableSignature = {
  signature: string;
  label: string;
  isVirtual: boolean;
  temperature: number | null;
};

export type DomainTrialPlanModel = {
  modelId: string;
  label: string;
  isDefault: boolean;
  supportsTemperature: boolean;
};

export type DomainTrialPlanVignette = {
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  signature: string;
  scenarioCount: number;
  existingBatchCount: number;
};

export type DomainTrialPlanCellEstimate = {
  definitionId: string;
  modelId: string;
  estimatedCost: number;
};

export type DomainEvaluationEstimateConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type DomainEvaluationEstimateModel = {
  modelId: string;
  label: string;
  isDefault: boolean;
  supportsTemperature: boolean;
  estimatedCost: number;
  basedOnSampleCount: number;
  isUsingFallback: boolean;
};

export type DomainEvaluationEstimateDefinition = {
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  signature: string;
  scenarioCount: number;
  estimatedCost: number;
  basedOnSampleCount: number;
  isUsingFallback: boolean;
};

export type DomainEvaluationCostEstimate = {
  domainId: string;
  domainName: string;
  scopeCategory: string;
  targetedDefinitions: number;
  totalScenarioCount: number;
  totalEstimatedCost: number;
  basedOnSampleCount: number;
  isUsingFallback: boolean;
  fallbackReason: string | null;
  estimateConfidence: DomainEvaluationEstimateConfidence;
  knownExclusions: string[];
  models: DomainEvaluationEstimateModel[];
  definitions: DomainEvaluationEstimateDefinition[];
  existingTemperatures: number[];
  defaultTemperature: number | null;
  temperatureWarning: string | null;
};

export type DomainTrialPlanResult = {
  domainId: string;
  domainName: string;
  vignettes: DomainTrialPlanVignette[];
  models: DomainTrialPlanModel[];
  cellEstimates: DomainTrialPlanCellEstimate[];
  totalEstimatedCost: number;
  existingTemperatures: number[];
  defaultTemperature: number | null;
  temperatureWarning: string | null;
};

export type DomainTrialModelStatus = {
  modelId: string;
  generationCompleted: number;
  generationFailed: number;
  generationTotal: number;
  summarizationCompleted: number;
  summarizationFailed: number;
  summarizationTotal: number;
  latestErrorMessage: string | null;
};

export type DomainTrialRunStatus = {
  runId: string;
  definitionId: string;
  status: string;
  updatedAt: Date;
  stalledModels: string[];
  analysisStatus: string | null;
  modelStatuses: DomainTrialModelStatus[];
};

export type DomainAnalysisMissingReasonCode =
  | 'NO_COMPLETED_RUNS'
  | 'NO_SIGNATURE_MATCH'
  | 'NO_TRANSCRIPTS'
  | 'NO_ANALYSIS';

type SignatureResolutionResult = {
  selectedSignature: string | null;
  filteredSourceRunIds: string[];
  filteredSourceRunDefinitionById: Map<string, string>;
  coveredDefinitionIds: Set<string>;
  missingReasonByDefinitionId: Map<string, DomainAnalysisMissingReasonCode>;
};

export function runModelsContainAll(config: unknown, defaultModelIds: string[]): boolean {
  if (defaultModelIds.length === 0) return true;
  const models = (config as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return false;
  return defaultModelIds.every((id) => (models as unknown[]).includes(id));
}


export function parseDomainAnalysisScoreMethod(value: string | null | undefined): DomainAnalysisScoreMethod {
  return value === 'FULL_BT' ? 'FULL_BT' : 'LOG_ODDS';
}

export function getMissingReasonLabel(reasonCode: DomainAnalysisMissingReasonCode): string {
  switch (reasonCode) {
    case 'NO_COMPLETED_RUNS':
      return 'No completed runs were found for this vignette.';
    case 'NO_SIGNATURE_MATCH':
      return 'Completed runs exist, but none matched the selected signature.';
    case 'NO_TRANSCRIPTS':
      return 'Matching runs exist, but no analyzed transcripts were found for this signature.';
    case 'NO_ANALYSIS':
      return 'Matching runs exist, but the fast domain snapshot has not been built yet.';
    default:
      return 'No compatible runs were found for this vignette.';
  }
}

/**
 * Resolves the effective set of model IDs to use for coverage and analysis filtering.
 *
 * When the domain has explicit defaultModelIds configured, those are used as-is.
 * When the domain list is empty, falls back to globally defaulted models
 * (llmModel rows where isDefault=true and status=ACTIVE), which mirrors what the
 * user sees on the Models settings page.
 */
export async function resolveEffectiveDefaultModelIds(domainModelIds: string[]): Promise<string[]> {
  if (domainModelIds.length > 0) return domainModelIds;
  const globalDefaults = await db.llmModel.findMany({
    where: { isDefault: true, status: 'ACTIVE' },
    select: { modelId: true },
  });
  return globalDefaults.map((m) => m.modelId);
}

export async function resolveSignatureRuns(
  latestDefinitionIds: string[],
  selectedSignature: string | null,
  defaultModelIds: string[] = [],
): Promise<SignatureResolutionResult> {
  if (latestDefinitionIds.length === 0) {
    return {
      selectedSignature,
      filteredSourceRunIds: [],
      filteredSourceRunDefinitionById: new Map(),
      coveredDefinitionIds: new Set<string>(),
      missingReasonByDefinitionId: new Map<string, DomainAnalysisMissingReasonCode>(),
    };
  }

  const completedRuns = await db.run.findMany({
    where: {
      definitionId: { in: latestDefinitionIds },
      status: 'COMPLETED',
      deletedAt: null,
    },
    orderBy: [{ definitionId: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      definitionId: true,
      config: true,
    },
  });

  const effectiveSignature = selectedSignature ?? selectDefaultVnewSignature(completedRuns);
  const runsByDefinitionId = new Map<string, Array<{ id: string; definitionId: string; config: unknown }>>();
  for (const run of completedRuns) {
    const current = runsByDefinitionId.get(run.definitionId) ?? [];
    current.push(run);
    runsByDefinitionId.set(run.definitionId, current);
  }

  const filteredSourceRunIds: string[] = [];
  const filteredSourceRunDefinitionById = new Map<string, string>();
  const coveredDefinitionIds = new Set<string>();
  const missingReasonByDefinitionId = new Map<string, DomainAnalysisMissingReasonCode>();

  for (const definitionId of latestDefinitionIds) {
    const runs = runsByDefinitionId.get(definitionId) ?? [];
    if (runs.length === 0) {
      missingReasonByDefinitionId.set(definitionId, 'NO_COMPLETED_RUNS');
      continue;
    }

    const matchedRuns = effectiveSignature === null
      ? runs
      : runs.filter((run) => runMatchesSignature(run.config, effectiveSignature));
    if (matchedRuns.length === 0) {
      missingReasonByDefinitionId.set(definitionId, 'NO_SIGNATURE_MATCH');
      continue;
    }

    const modelFilteredRuns = defaultModelIds.length === 0
      ? matchedRuns
      : matchedRuns.filter((run) => runModelsContainAll(run.config, defaultModelIds));
    if (modelFilteredRuns.length === 0) {
      missingReasonByDefinitionId.set(definitionId, 'NO_SIGNATURE_MATCH');
      continue;
    }

    for (const matchedRun of modelFilteredRuns) {
      filteredSourceRunIds.push(matchedRun.id);
      filteredSourceRunDefinitionById.set(matchedRun.id, definitionId);
    }
    coveredDefinitionIds.add(definitionId);
  }

  return {
    selectedSignature: effectiveSignature,
    filteredSourceRunIds,
    filteredSourceRunDefinitionById,
    coveredDefinitionIds,
    missingReasonByDefinitionId,
  };
}

export async function resolveValuePairsInChunks(
  definitionIds: string[],
): Promise<Map<string, DomainAnalysisValuePair>> {
  const valuePairByDefinition = new Map<string, DomainAnalysisValuePair>();

  for (let offset = 0; offset < definitionIds.length; offset += VALUE_PAIR_RESOLVE_CHUNK_SIZE) {
    const batch = definitionIds.slice(offset, offset + VALUE_PAIR_RESOLVE_CHUNK_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (definitionId) => {
        const resolved = await resolveDefinitionContent(definitionId);
        const pair = extractValuePair(resolved.resolvedContent);
        if (!pair) return;
        valuePairByDefinition.set(definitionId, pair);
      }),
    );
    settled.forEach(() => undefined);
  }

  return valuePairByDefinition;
}

export function supportsTemperature(apiConfig: unknown): boolean {
  if (apiConfig === null || typeof apiConfig !== 'object') return true;
  const candidate = (apiConfig as Record<string, unknown>).supportsTemperature;
  if (typeof candidate === 'boolean') return candidate;
  return true;
}
