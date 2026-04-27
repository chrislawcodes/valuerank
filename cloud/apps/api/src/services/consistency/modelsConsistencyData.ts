import { coherenceForPair, dersimonianLairdPool, wilsonInterval } from './statistics.js';

type RawRecord = Record<string, unknown>;

export type ConsistencyParsedScenario = {
  scenarioId: string;
  matches: number;
  trials: number;
  domainId: string;
  domainName: string;
};

export type ConsistencyParsedPairCondition = {
  scenarioId: string;
  netPressureRank: number;
  winRate: number | null;
  matches: number;
  trials: number;
};

export type ConsistencyParsedPair = {
  domainId: string;
  valueKey: string;
  rho: number | null;
  pValue: number | null;
  coherent: boolean | null;
  determinate: boolean | null;
  targetAnalysisRunId: string | null;
  targetCompanionRunId: string | null;
  primaryConditionIds: string[];
  companionConditionIds: string[];
  perCondition: ConsistencyParsedPairCondition[];
};

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function readConsistencySummary(raw: unknown): RawRecord | null {
  if (!isRecord(raw)) return null;
  const modelsConsistency = raw.modelsConsistency;
  if (isRecord(modelsConsistency) && isRecord(modelsConsistency.perModel)) {
    return modelsConsistency;
  }
  const reliabilitySummary = raw.reliabilitySummary;
  if (isRecord(reliabilitySummary) && isRecord(reliabilitySummary.perModel)) {
    return reliabilitySummary;
  }
  return null;
}

function parseScenario(value: unknown, scenarioIdFallback?: string): ConsistencyParsedScenario | null {
  if (!isRecord(value)) return null;
  const scenarioId = toStringOrNull(value.scenarioId) ?? scenarioIdFallback ?? null;
  if (scenarioId === null) return null;

  const matches = toNumberOrNull(value.matches)
    ?? toNumberOrNull(value.matchCount)
    ?? toNumberOrNull(value.prioritized);
  const trials = toNumberOrNull(value.trials)
    ?? toNumberOrNull(value.totalTrials)
    ?? toNumberOrNull(value.total);
  if (matches === null || trials === null || trials <= 0) return null;

  return {
    scenarioId,
    matches: Math.max(0, Math.min(trials, Math.round(matches))),
    trials: Math.max(0, Math.round(trials)),
    domainId: toStringOrNull(value.domainId) ?? 'unknown',
    domainName: toStringOrNull(value.domainName) ?? 'Unknown domain',
  };
}

export function parseScenarioList(raw: unknown): ConsistencyParsedScenario[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => parseScenario(item)).filter((item): item is ConsistencyParsedScenario => item !== null);
  }
  if (!isRecord(raw)) return [];
  return Object.entries(raw)
    .map(([scenarioId, value]) => parseScenario(value, scenarioId))
    .filter((item): item is ConsistencyParsedScenario => item !== null);
}

function parsePairConditions(raw: unknown): ConsistencyParsedPairCondition[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((value): ConsistencyParsedPairCondition | null => {
    if (!isRecord(value)) return null;
    const scenarioId = toStringOrNull(value.scenarioId);
    const pressure = toNumberOrNull(value.netPressureRank) ?? toNumberOrNull(value.pressureRank);
    const winRate = toNumberOrNull(value.winRate) ?? toNumberOrNull(value.p);
    const matches = toNumberOrNull(value.matches);
    const trials = toNumberOrNull(value.trials);
    if (scenarioId === null || pressure === null) return null;
    return {
      scenarioId,
      netPressureRank: pressure,
      winRate,
      matches: matches === null ? (winRate !== null ? Math.round(clamp01(winRate) * 100) : 0) : Math.max(0, Math.round(matches)),
      trials: trials === null ? 100 : Math.max(0, Math.round(trials)),
    };
  }).filter((item): item is ConsistencyParsedPairCondition => item !== null);
}

function parsePair(value: unknown): ConsistencyParsedPair | null {
  if (!isRecord(value)) return null;
  const domainId = toStringOrNull(value.domainId) ?? 'unknown';
  const valueKey = toStringOrNull(value.valueKey) ?? 'unknown';
  const targetAnalysisRunId = toStringOrNull(value.targetAnalysisRunId);
  const targetCompanionRunId = toStringOrNull(value.targetCompanionRunId);
  const primaryConditionIds = toStringArray(value.primaryConditionIds);
  const companionConditionIds = toStringArray(value.companionConditionIds);
  const perCondition = parsePairConditions(value.perCondition);

  const determinateConditions = perCondition.filter(
    (c): c is ConsistencyParsedPairCondition & { winRate: number } => c.winRate !== null,
  );
  const coherence = determinateConditions.length >= 3
    ? coherenceForPair(determinateConditions.map((condition) => ({
        pressureRank: condition.netPressureRank,
        winRate: condition.winRate,
      })))
    : null;

  return {
    domainId,
    valueKey,
    rho: toNumberOrNull(value.rho) ?? coherence?.rho ?? null,
    pValue: toNumberOrNull(value.pValue) ?? toNumberOrNull(value.p) ?? coherence?.p ?? null,
    coherent: typeof value.coherent === 'boolean' ? value.coherent : coherence?.coherent ?? false,
    determinate: typeof value.determinate === 'boolean' ? value.determinate : coherence?.determinate ?? false,
    targetAnalysisRunId,
    targetCompanionRunId,
    primaryConditionIds,
    companionConditionIds,
    perCondition,
  };
}

export function parsePairList(raw: unknown): ConsistencyParsedPair[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => parsePair(item)).filter((item): item is ConsistencyParsedPair => item !== null);
  }
  if (!isRecord(raw)) return [];
  return Object.values(raw)
    .map((item) => parsePair(item))
    .filter((item): item is ConsistencyParsedPair => item !== null);
}

export function computeRepeatability(perScenario: ConsistencyParsedScenario[]) {
  const ordered = [...perScenario].sort((left, right) => left.scenarioId.localeCompare(right.scenarioId));
  const pooled = dersimonianLairdPool(ordered.map((scenario) => ({ p: scenario.matches / scenario.trials, n: scenario.trials })));
  return {
    value: pooled.estimate,
    ciLow: pooled.ciLow,
    ciHigh: pooled.ciHigh,
    withinScenarioSd: pooled.withinSd,
    betweenScenarioSd: pooled.betweenSd,
    scenariosMeasured: ordered.length,
    perDomain: [] as Array<{ domainId: string; domainName: string; value: number; ciLow: number; ciHigh: number; scenariosMeasured: number }>,
    perScenario: ordered.map((scenario) => {
      const interval = wilsonInterval(scenario.matches, scenario.trials);
      return {
        scenarioId: scenario.scenarioId,
        matches: scenario.matches,
        trials: scenario.trials,
        p: interval.p,
        ciLow: interval.low,
        ciHigh: interval.high,
      };
    }),
  };
}
