export type LaunchTrialCountInput = {
  scenarioCount: number;
  samplePercentage: number;
  samplesPerScenario: number;
  scenarioIds?: string[] | null;
  modelCount: number;
};

export function computeLaunchTrialCount({
  scenarioCount,
  samplePercentage,
  samplesPerScenario,
  scenarioIds,
  modelCount,
}: LaunchTrialCountInput): number {
  const hasExplicitScenarios = Array.isArray(scenarioIds) && scenarioIds.length > 0;
  const effectiveScenarioCount = hasExplicitScenarios
    ? scenarioIds.length
    : Math.max(1, Math.floor((scenarioCount * samplePercentage) / 100));

  return modelCount * effectiveScenarioCount * samplesPerScenario;
}
