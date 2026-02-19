type ScenarioRecord = {
  id: string;
  name: string;
  content: unknown;
};

type NormalizedArtifacts = {
  visualizationData: Record<string, unknown> | null;
  varianceAnalysis: Record<string, unknown> | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isDimensionValue(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
}

function toDimensionRecord(value: unknown): Record<string, number | string> | null {
  if (!isPlainObject(value)) return null;
  const sanitized: Record<string, number | string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isDimensionValue(entry)) continue;
    sanitized[key] = entry;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function resolveScenarioId(
  scenarioKey: string,
  knownScenarioIds: Set<string>,
  scenarioNameToId: Map<string, string>
): string | null {
  if (knownScenarioIds.has(scenarioKey)) return scenarioKey;
  return scenarioNameToId.get(scenarioKey) ?? null;
}

function normalizeScenarioDimensions(
  rawDimensions: unknown,
  scenarios: ScenarioRecord[]
): Record<string, Record<string, number | string>> {
  const canonical: Record<string, Record<string, number | string>> = {};
  for (const scenario of scenarios) {
    const content = scenario.content;
    if (!isPlainObject(content)) continue;
    const dims = toDimensionRecord(content.dimensions);
    if (dims !== null) {
      canonical[scenario.id] = dims;
    }
  }

  if (Object.keys(canonical).length > 0) {
    return canonical;
  }

  if (!isPlainObject(rawDimensions)) {
    return {};
  }

  const fallback: Record<string, Record<string, number | string>> = {};
  for (const [scenarioId, dims] of Object.entries(rawDimensions)) {
    const validated = toDimensionRecord(dims);
    if (validated !== null) {
      fallback[scenarioId] = validated;
    }
  }
  return fallback;
}

function normalizeModelScenarioMatrix(
  rawMatrix: unknown,
  knownScenarioIds: Set<string>,
  scenarioNameToId: Map<string, string>
): Record<string, Record<string, number>> | undefined {
  if (!isPlainObject(rawMatrix)) return undefined;

  const normalized: Record<string, Record<string, number>> = {};
  for (const [modelId, scenarios] of Object.entries(rawMatrix)) {
    if (!isPlainObject(scenarios)) continue;
    const outScenarios: Record<string, number> = {};
    for (const [scenarioKey, score] of Object.entries(scenarios)) {
      if (typeof score !== 'number' || !Number.isFinite(score)) continue;
      const canonicalScenarioId = resolveScenarioId(scenarioKey, knownScenarioIds, scenarioNameToId);
      if (canonicalScenarioId === null) continue;
      if (scenarioKey === canonicalScenarioId || outScenarios[canonicalScenarioId] === undefined) {
        outScenarios[canonicalScenarioId] = score;
      }
    }
    normalized[modelId] = outScenarios;
  }
  return normalized;
}

function normalizeVarianceAnalysis(
  rawVariance: unknown,
  knownScenarioIds: Set<string>,
  scenarioNameToId: Map<string, string>,
  scenarioIdToName: Map<string, string>
): Record<string, unknown> | null {
  if (!isPlainObject(rawVariance)) return null;

  const out: Record<string, unknown> = { ...rawVariance };

  const perModel = out.perModel;
  if (isPlainObject(perModel)) {
    const normalizedPerModel: Record<string, unknown> = {};
    for (const [modelId, modelStats] of Object.entries(perModel)) {
      if (!isPlainObject(modelStats)) {
        normalizedPerModel[modelId] = modelStats;
        continue;
      }
      const normalizedModelStats: Record<string, unknown> = { ...modelStats };
      const perScenario = modelStats.perScenario;
      if (isPlainObject(perScenario)) {
        const normalizedPerScenario: Record<string, unknown> = {};
        for (const [scenarioKey, stats] of Object.entries(perScenario)) {
          const canonicalScenarioId = resolveScenarioId(scenarioKey, knownScenarioIds, scenarioNameToId);
          if (canonicalScenarioId === null) continue;
          if (scenarioKey === canonicalScenarioId || normalizedPerScenario[canonicalScenarioId] === undefined) {
            normalizedPerScenario[canonicalScenarioId] = stats;
          }
        }
        normalizedModelStats.perScenario = normalizedPerScenario;
      }
      normalizedPerModel[modelId] = normalizedModelStats;
    }
    out.perModel = normalizedPerModel;
  }

  const normalizeScenarioList = (value: unknown): unknown => {
    if (!isUnknownArray(value)) return value;
    return value.map((entry: unknown) => {
      if (!isPlainObject(entry)) return entry;
      const rawScenarioId = typeof entry.scenarioId === 'string' ? entry.scenarioId : null;
      if (rawScenarioId === null) return entry;
      const canonicalScenarioId = resolveScenarioId(rawScenarioId, knownScenarioIds, scenarioNameToId);
      if (canonicalScenarioId === null) return entry;
      const scenarioName = scenarioIdToName.get(canonicalScenarioId);
      return {
        ...entry,
        scenarioId: canonicalScenarioId,
        ...(typeof scenarioName === 'string' && scenarioName !== '' ? { scenarioName } : {}),
      };
    });
  };

  out.mostVariableScenarios = normalizeScenarioList(out.mostVariableScenarios);
  out.leastVariableScenarios = normalizeScenarioList(out.leastVariableScenarios);

  return out;
}

export function normalizeAnalysisArtifacts(params: {
  visualizationData: unknown;
  varianceAnalysis: unknown;
  scenarios: ScenarioRecord[];
}): NormalizedArtifacts {
  const { visualizationData, varianceAnalysis, scenarios } = params;
  const scenarioNameToId = new Map<string, string>();
  const scenarioIdToName = new Map<string, string>();
  const knownScenarioIds = new Set<string>();

  for (const scenario of scenarios) {
    knownScenarioIds.add(scenario.id);
    scenarioNameToId.set(scenario.name, scenario.id);
    scenarioIdToName.set(scenario.id, scenario.name);
  }

  let normalizedVisualizationData: Record<string, unknown> | null = null;
  if (isPlainObject(visualizationData)) {
    const scenarioDimensions = normalizeScenarioDimensions(visualizationData.scenarioDimensions, scenarios);
    const matrix = normalizeModelScenarioMatrix(
      visualizationData.modelScenarioMatrix,
      knownScenarioIds,
      scenarioNameToId
    );
    normalizedVisualizationData = {
      ...visualizationData,
      scenarioDimensions,
      ...(matrix ? { modelScenarioMatrix: matrix } : {}),
    };
  }

  const normalizedVarianceAnalysis = normalizeVarianceAnalysis(
    varianceAnalysis,
    knownScenarioIds,
    scenarioNameToId,
    scenarioIdToName
  );

  return {
    visualizationData: normalizedVisualizationData,
    varianceAnalysis: normalizedVarianceAnalysis,
  };
}
