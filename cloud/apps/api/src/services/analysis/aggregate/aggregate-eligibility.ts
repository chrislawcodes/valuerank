import { type AggregateMetadata, type RunConfig } from './contracts.js';
import { isBaselineCompatibleRun } from './config.js';

type TranscriptForEligibility = {
  modelId: string;
  scenarioId: string | null;
  scenario: { deletedAt: Date | null } | null;
};

type RunForEligibility = {
  id: string;
  config: unknown;
  tags: { tag: { name: string } }[];
};

type AnalysisForEligibility = {
  output: { perModel?: Record<string, unknown> };
};

export type EligibilityResult = {
  conditionCoverage: {
    plannedConditionCount: number;
    observedConditionCount: number;
    complete: boolean;
  };
  aggregateEligibility: AggregateMetadata['aggregateEligibility'];
  aggregateIneligibilityReason: string | null;
};

export function computeAggregateEligibility(args: {
  scenarios: { id: string }[];
  allTranscripts: TranscriptForEligibility[];
  validAggregateTranscripts: TranscriptForEligibility[];
  validAnalyses: AnalysisForEligibility[];
  compatibleRuns: RunForEligibility[];
  parsedConfigs: Map<string, RunConfig | null>;
}): EligibilityResult {
  const { scenarios, allTranscripts, validAggregateTranscripts, validAnalyses, compatibleRuns, parsedConfigs } = args;

  const plannedScenarioIds = scenarios.map((s) => s.id).sort();
  const observedScenarioIds = Array.from(
    new Set(
      validAggregateTranscripts
        .map((t) => t.scenarioId)
        .filter((id): id is string => id != null && id !== '')
    )
  ).sort();
  const hasDeletedOrMissingScenarioRows = allTranscripts.some(
    (t) => t.scenario == null || t.scenario.deletedAt != null
  );
  const pooledModelIds = new Set(
    validAnalyses.flatMap((analysis) => Object.keys(analysis.output.perModel ?? {}))
  );
  const observedScenarioIdsByModel = new Map<string, Set<string>>();
  for (const transcript of validAggregateTranscripts) {
    const scenarioId = transcript.scenarioId;
    if (scenarioId == null || scenarioId === '') continue;
    const existing = observedScenarioIdsByModel.get(transcript.modelId) ?? new Set<string>();
    existing.add(scenarioId);
    observedScenarioIdsByModel.set(transcript.modelId, existing);
  }

  const conditionCoverage = {
    plannedConditionCount: plannedScenarioIds.length,
    observedConditionCount: observedScenarioIds.length,
    complete:
      !hasDeletedOrMissingScenarioRows &&
      plannedScenarioIds.length > 0 &&
      plannedScenarioIds.every((id) => observedScenarioIds.includes(id)),
  };

  const baselineEligible = compatibleRuns.every((run) => {
    const config = parsedConfigs.get(run.id);
    return isBaselineCompatibleRun(config ?? null, run.tags);
  });

  const hasStableModelIds = validAggregateTranscripts.every(
    (t) => typeof t.modelId === 'string' && t.modelId !== ''
  );
  const hasPerModelConditionCoverage = Array.from(pooledModelIds).every((modelId) => {
    const scenarioIds = observedScenarioIdsByModel.get(modelId);
    return (
      scenarioIds != null &&
      plannedScenarioIds.length > 0 &&
      plannedScenarioIds.every((id) => scenarioIds.has(id))
    );
  });

  let aggregateEligibility: AggregateMetadata['aggregateEligibility'] = 'eligible_same_signature_baseline';
  let aggregateIneligibilityReason: string | null = null;

  if (!baselineEligible) {
    aggregateEligibility = 'ineligible_run_type';
    aggregateIneligibilityReason = 'This aggregate mixes in assumption or manipulated runs, so it cannot be shown as baseline analysis.';
  } else if (!hasStableModelIds) {
    aggregateEligibility = 'ineligible_model_instability';
    aggregateIneligibilityReason = 'This aggregate is missing stable model identity metadata.';
  } else if (!conditionCoverage.complete || !hasPerModelConditionCoverage) {
    aggregateEligibility = 'ineligible_partial_coverage';
    aggregateIneligibilityReason = !conditionCoverage.complete
      ? 'This aggregate does not cover the full baseline condition set for this signature.'
      : 'At least one model is missing planned baseline conditions, so pooled baseline summaries would be incomplete.';
  }

  return { conditionCoverage, aggregateEligibility, aggregateIneligibilityReason };
}
