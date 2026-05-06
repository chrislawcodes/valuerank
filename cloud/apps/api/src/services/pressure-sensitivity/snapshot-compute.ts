import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { resolveTranscriptDecisionModel } from '../../graphql/queries/domain/shared.js';
import type {
  DirectionalSanityCheckEntryShape,
  DirectionalSanityCheckShape,
  DomainPressureEffectShape,
  ExcludedDefinitionShape,
  InsufficientPressureSensitivityModelShape,
  PressureSensitivityModelShape,
  PressureSensitivityResultShape,
  PressureSensitivityValuePairShape,
  PressureSensitivityValueRateShape,
  SensitivityCellShape,
} from '../../graphql/types/pressure-sensitivity.js';
import { buildSafeLevelLookup, type DefinitionDimension } from '../../graphql/queries/scenarios-utils.js';
import { normalizeScenarioAnalysisMetadata } from '../../services/analysis/scenario-metadata.js';
import {
  buildCellMetrics,
  buildVignetteWeightedCellMetrics,
  computeDirectionBalancedPairWinRates,
  pooledDirectionalReduction,
  summarizePressureResponse,
  FLAT_DELTA_THRESHOLD,
  type Observation,
} from './aggregation.js';
import { validateDefinitionForPressureSensitivity } from './definition-validation.js';
import {
  assignOwnOpponent,
  assignOwnOpponentLevels,
  canonicalOwnOpponent,
  canonicalValuePairKey,
  type CanonicalDirection,
} from './value-pair.js';
import { buildPressureSensitivityDecisionSnapshot } from './decision-snapshot.js';
import { aggregateValueWinRates } from '../analysis/value-win-rate-aggregation.js';
import type {
  ModelRow,
  TranscriptRow,
  DefinitionMetadata,
  PressureConditionExclusionBreakdown,
  PressureSensitivityPreparedState,
} from './snapshot-builder.js';
import {
  emptyPressureConditionExclusionBreakdown,
  buildEmptyResult,
  fetchTranscriptsFromSourceRuns,
} from './snapshot-builder.js';

const log = createLogger('pressure-sensitivity:snapshot');
const MIN_N = 3;
const TRANSCRIPT_PAGE_SIZE = 5_000;

type ScenarioRow = {
  id: string;
  definitionId: string;
  content: unknown;
  orientationFlipped: boolean;
};

type CellAccumulator = {
  ownLevel: number;
  opponentLevel: number;
  observationsByDefinition: Map<string, Observation[]>;
};

type PairAccumulator = {
  pairKey: string;
  firstValueToken: string;
  secondValueToken: string;
  cells: Map<string, CellAccumulator>;
  definitionsMeasured: Set<string>;
};

type ValueRateFilter =
  | 'all'
  | 'balanced'
  | 'highPressureOnValue'
  | 'highPressureOnOpposingValue';

type ValueRateCellAccumulator = {
  valueKey: string;
  definitionId: string;
  domainId: string;
  pairKey: string;
  directionKey: string;
  cellRates: number[];
};

function cellKey(ownLevel: number, opponentLevel: number): string {
  return `${ownLevel}::${opponentLevel}`;
}

function strengthFromCanonical(strength: 'strong' | 'lean' | 'neutral' | 'unknown'): 'strong' | 'lean' | null {
  if (strength === 'strong') return 'strong';
  if (strength === 'lean') return 'lean';
  return null;
}

function formatValueLabel(token: string): string {
  return token.replaceAll('_', ' ').trim();
}

function totalPressureConditionExclusions(breakdown: PressureConditionExclusionBreakdown): number {
  return breakdown.sourceRunMapping + breakdown.definitionMetadata + breakdown.missingScenario + breakdown.invalidMetadata + breakdown.levelAssignment;
}

function shouldIncludeValueRateCell(
  filter: ValueRateFilter,
  isCanonicalFirst: boolean,
  ownLevel: number,
  opponentLevel: number,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'balanced') return ownLevel === opponentLevel;
  if (isCanonicalFirst) {
    if (filter === 'highPressureOnValue') return ownLevel >= 4 && opponentLevel <= 3;
    return opponentLevel >= 4 && ownLevel <= 3;
  }
  if (filter === 'highPressureOnValue') return opponentLevel >= 4 && ownLevel <= 3;
  return ownLevel >= 4 && opponentLevel <= 3;
}

function addValueRateCell(
  groups: Map<string, ValueRateCellAccumulator>,
  params: {
    valueKey: string;
    definitionId: string;
    domainId: string;
    pairKey: string;
    directionKey: string;
    cellRate: number;
  },
): void {
  const key = [params.valueKey, params.definitionId, params.domainId, params.pairKey, params.directionKey].join('||');
  const existing = groups.get(key) ?? {
    valueKey: params.valueKey,
    definitionId: params.definitionId,
    domainId: params.domainId,
    pairKey: params.pairKey,
    directionKey: params.directionKey,
    cellRates: [],
  };
  existing.cellRates.push(params.cellRate);
  groups.set(key, existing);
}

function toValueRateInputs(groups: Map<string, ValueRateCellAccumulator>) {
  const inputs = [];
  for (const group of groups.values()) {
    if (group.cellRates.length === 0) continue;
    const vignetteRate = group.cellRates.reduce((sum, rate) => sum + rate, 0) / group.cellRates.length;
    inputs.push({
      domainId: group.domainId,
      definitionId: group.definitionId,
      valueKey: group.valueKey,
      pairKey: group.pairKey,
      directionKey: group.directionKey,
      vignetteRate,
    });
  }
  return inputs;
}

function computeModelPushedEffects(
  pairs: ReadonlyMap<string, PairAccumulator>,
  authoredFirstTokenByDef: ReadonlyMap<string, string>,
  domainByDef: ReadonlyMap<string, string>,
  domainNameById: ReadonlyMap<string, string>,
): { pushedForEffect: number | null; pushedAgainstEffect: number | null; pairsUsed: number; domainPressureEffects: DomainPressureEffectShape[] } {
  type DirBuckets = { first: number[]; second: number[] };

  const pushBuckets = new Map<string, DirBuckets>();
  const balancedBuckets = new Map<string, DirBuckets>();
  const mirrorBuckets = new Map<string, DirBuckets>();

  function getOrCreate(map: Map<string, DirBuckets>, key: string): DirBuckets {
    let b = map.get(key);
    if (b == null) { b = { first: [], second: [] }; map.set(key, b); }
    return b;
  }

  for (const acc of pairs.values()) {
    for (const cellAcc of acc.cells.values()) {
      const { ownLevel, opponentLevel } = cellAcc;
      const isPush = ownLevel >= 4 && opponentLevel <= 3;
      const isBalanced = ownLevel === opponentLevel;
      const isMirror = opponentLevel >= 4 && ownLevel <= 3;
      if (!isPush && !isBalanced && !isMirror) continue;

      for (const [defId, observations] of cellAcc.observationsByDefinition) {
        const authoredFirst = authoredFirstTokenByDef.get(defId);
        if (authoredFirst == null) continue;
        const metrics = buildCellMetrics([...observations]);
        if (metrics.n === 0 || metrics.winRate == null) continue;

        const domainKey = domainByDef.get(defId) ?? defId;
        const pdKey = `${acc.pairKey}||${domainKey}`;
        const dir: 'first' | 'second' = authoredFirst === acc.firstValueToken ? 'first' : 'second';

        if (isPush) getOrCreate(pushBuckets, pdKey)[dir].push(metrics.winRate);
        if (isBalanced) getOrCreate(balancedBuckets, pdKey)[dir].push(metrics.winRate);
        if (isMirror) getOrCreate(mirrorBuckets, pdKey)[dir].push(metrics.winRate);
      }
    }
  }

  function dirBalance(b: DirBuckets): number | null {
    const f = b.first.length > 0 ? b.first.reduce((a, v) => a + v, 0) / b.first.length : null;
    const s = b.second.length > 0 ? b.second.reduce((a, v) => a + v, 0) / b.second.length : null;
    const vals = [f, s].filter((v): v is number => v != null);
    return vals.length > 0 ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
  }

  function splitPD(pdKey: string): { pairKey: string; domainKey: string } {
    const idx = pdKey.indexOf('||');
    return idx === -1
      ? { pairKey: pdKey, domainKey: pdKey }
      : { pairKey: pdKey.slice(0, idx), domainKey: pdKey.slice(idx + 2) };
  }

  type DomainAccum = { push: number[]; balanced: number[]; mirror: number[]; pairKeys: Set<string> };
  const domainAccum = new Map<string, DomainAccum>();

  function getOrCreateDomain(key: string): DomainAccum {
    let d = domainAccum.get(key);
    if (d == null) { d = { push: [], balanced: [], mirror: [], pairKeys: new Set() }; domainAccum.set(key, d); }
    return d;
  }

  for (const [pdKey, bucket] of pushBuckets) {
    const rate = dirBalance(bucket);
    if (rate == null) continue;
    const { pairKey, domainKey } = splitPD(pdKey);
    const d = getOrCreateDomain(domainKey);
    d.push.push(rate);
    d.pairKeys.add(pairKey);
  }
  for (const [pdKey, bucket] of balancedBuckets) {
    const rate = dirBalance(bucket);
    if (rate == null) continue;
    getOrCreateDomain(splitPD(pdKey).domainKey).balanced.push(rate);
  }
  for (const [pdKey, bucket] of mirrorBuckets) {
    const rate = dirBalance(bucket);
    if (rate == null) continue;
    getOrCreateDomain(splitPD(pdKey).domainKey).mirror.push(rate);
  }

  const mean = (arr: number[]): number | null =>
    arr.length > 0 ? arr.reduce((a, v) => a + v, 0) / arr.length : null;

  const pushedForDomains: number[] = [];
  const pushedAgainstDomains: number[] = [];
  const allPairKeys = new Set<string>();

  for (const d of domainAccum.values()) {
    const [dp, db, dm] = [mean(d.push), mean(d.balanced), mean(d.mirror)];
    const fxs: number[] = [];
    if (dp != null && db != null) { fxs.push(dp - db); for (const pk of d.pairKeys) allPairKeys.add(pk); }
    if (db != null && dm != null) { fxs.push(db - dm); pushedAgainstDomains.push(db - dm); }
    const fx = mean(fxs); if (fx != null) pushedForDomains.push(fx);
  }

  const domainPressureEffects: DomainPressureEffectShape[] = [...domainAccum.entries()]
    .filter(([dk]) => domainNameById.has(dk))
    .map(([dk, d]) => {
      const [dp, db, dm] = [mean(d.push), mean(d.balanced), mean(d.mirror)];
      const fx = [dp != null && db != null ? dp - db : null, db != null && dm != null ? db - dm : null].filter((v): v is number => v != null);
      return { domainId: dk, domainName: domainNameById.get(dk)!, pushedForEffect: mean(fx) };
    });

  return {
    pushedForEffect: mean(pushedForDomains),
    pushedAgainstEffect: mean(pushedAgainstDomains),
    pairsUsed: allPairKeys.size,
    domainPressureEffects,
  };
}

function ensurePairAccumulator(
  perModel: Map<string, Map<string, PairAccumulator>>,
  modelId: string,
  meta: DefinitionMetadata,
): PairAccumulator {
  let pairs = perModel.get(modelId);
  if (pairs == null) { pairs = new Map(); perModel.set(modelId, pairs); }
  let acc = pairs.get(meta.pairKey);
  if (acc == null) {
    acc = {
      pairKey: meta.pairKey,
      firstValueToken: meta.firstValueToken,
      secondValueToken: meta.secondValueToken,
      cells: new Map(),
      definitionsMeasured: new Set(),
    };
    pairs.set(meta.pairKey, acc);
  }
  return acc;
}

function ensureUnscoredCell(pairAcc: PairAccumulator): CellAccumulator {
  const key = cellKey(0, 0);
  let cell = pairAcc.cells.get(key);
  if (cell == null) {
    cell = { ownLevel: 0, opponentLevel: 0, observationsByDefinition: new Map() };
    pairAcc.cells.set(key, cell);
  }
  return cell;
}

export async function buildPressureSensitivitySnapshotOutput(
  state: PressureSensitivityPreparedState,
): Promise<PressureSensitivityResultShape> {
  const activeModels = (await db.llmModel.findMany({
    where: { status: 'ACTIVE' },
    include: { provider: true },
  })) as ModelRow[];

  if (state.eligibleRuns.length === 0) return buildEmptyResult(activeModels);

  const distinctDefIds = new Set<string>();
  const defNames = new Map<string, string>();
  const defDomainId = new Map<string, string>();
  for (const r of state.eligibleRuns) {
    if (r.definition?.id != null) {
      distinctDefIds.add(r.definition.id);
      defNames.set(r.definition.id, r.definition.name);
      if (r.definition.domainId != null) defDomainId.set(r.definition.id, r.definition.domainId);
    } else {
      distinctDefIds.add(r.definitionId);
    }
  }

  const validationResults = await Promise.all(
    [...distinctDefIds].map(async (defId) => ({
      defId,
      validation: await validateDefinitionForPressureSensitivity(defId),
    })),
  );

  const definitionMeta = new Map<string, DefinitionMetadata>();
  const excludedDefinitions: ExcludedDefinitionShape[] = [];

  for (const { defId, validation } of validationResults) {
    if (validation.status === 'excluded') {
      excludedDefinitions.push({ definitionId: defId, name: defNames.get(defId) ?? defId, reason: validation.reason });
      continue;
    }
    const content = validation.resolvedContent;
    const components = content.components;
    if (components == null) {
      excludedDefinitions.push({ definitionId: defId, name: defNames.get(defId) ?? defId, reason: 'missing-or-self-pair-tokens' });
      continue;
    }
    const pairKey = canonicalValuePairKey(components.value_first.token, components.value_second.token);
    if (pairKey === null) {
      excludedDefinitions.push({ definitionId: defId, name: defNames.get(defId) ?? defId, reason: 'missing-or-self-pair-tokens' });
      continue;
    }
    const [firstValueToken, secondValueToken] = canonicalOwnOpponent(components.value_first.token, components.value_second.token);

    const dimensions: DefinitionDimension[] = (content.dimensions ?? []).map((d) => ({ name: d.name, levels: d.levels, values: d.values }));
    const ownDim = dimensions.find((d) => typeof d.name === 'string' && d.name.trim() === firstValueToken);
    const opponentDim = dimensions.find((d) => typeof d.name === 'string' && d.name.trim() === secondValueToken);
    if (ownDim == null || opponentDim == null) {
      excludedDefinitions.push({ definitionId: defId, name: defNames.get(defId) ?? defId, reason: 'missing-or-empty-levels' });
      continue;
    }

    const ownLookupResult = buildSafeLevelLookup(ownDim);
    const opponentLookupResult = buildSafeLevelLookup(opponentDim);
    if (ownLookupResult.exclusionReason !== null || opponentLookupResult.exclusionReason !== null) {
      const reason = ownLookupResult.exclusionReason ?? opponentLookupResult.exclusionReason;
      const mapped =
        reason === 'collision' ? 'normalization-collision'
        : reason === 'out-of-range' ? 'score-out-of-range'
        : reason === 'legacy-values-only' ? 'legacy-single-dimension'
        : 'missing-or-empty-levels';
      excludedDefinitions.push({ definitionId: defId, name: defNames.get(defId) ?? defId, reason: mapped });
      continue;
    }

    const decisionSnapshot = buildPressureSensitivityDecisionSnapshot(content);
    if (decisionSnapshot === null) {
      excludedDefinitions.push({ definitionId: defId, name: defNames.get(defId) ?? defId, reason: 'missing-or-self-pair-tokens' });
      continue;
    }

    definitionMeta.set(defId, {
      id: defId,
      name: defNames.get(defId) ?? defId,
      domainId: defDomainId.get(defId) ?? null,
      valueFirstToken: components.value_first.token,
      valueSecondToken: components.value_second.token,
      firstValueToken,
      secondValueToken,
      pairKey,
      decisionSnapshot,
      ownLookup: ownLookupResult.lookup,
      opponentLookup: opponentLookupResult.lookup,
      dimensions,
    });
  }

  const authoredFirstTokenByDef = new Map<string, string>(
    [...definitionMeta.entries()].map(([id, meta]) => [id, meta.valueFirstToken]),
  );
  const domainByDef = new Map<string, string>();
  for (const [defId, meta] of definitionMeta.entries()) {
    if (meta.domainId != null) domainByDef.set(defId, meta.domainId);
  }
  const distinctDomainIds = [...new Set(domainByDef.values())];
  const domainNameById = new Map<string, string>(
    (distinctDomainIds.length === 0 ? [] : await db.domain.findMany({ where: { id: { in: distinctDomainIds } }, select: { id: true, name: true } }))
      .map((d) => [d.id, d.name]),
  );

  const sourceRunToDefId = new Map<string, string>();
  for (const run of state.eligibleRuns) {
    const defId = run.definition?.id ?? run.definitionId;
    if (definitionMeta.has(defId)) sourceRunToDefId.set(run.id, defId);
  }
  const sourceRunIds = [...sourceRunToDefId.keys()];
  const rosterModelIds = activeModels.map((m) => m.modelId);
  const pressureConditionExclusionBreakdown = emptyPressureConditionExclusionBreakdown();

  const eligibleDefIds = [...definitionMeta.keys()];
  const scenarioRows = eligibleDefIds.length === 0 ? [] : (await db.scenario.findMany({
    where: { definitionId: { in: eligibleDefIds }, deletedAt: null },
    select: { id: true, definitionId: true, content: true, orientationFlipped: true },
  })) as ScenarioRow[];
  const scenarioById = new Map<string, ScenarioRow>();
  for (const s of scenarioRows) scenarioById.set(s.id, s);

  const { transcripts, transcriptCapHit } = await fetchTranscriptsFromSourceRuns(
    sourceRunIds,
    rosterModelIds,
    async (cursor) => {
      const page = (await db.transcript.findMany({
        where: { runId: { in: sourceRunIds }, modelId: { in: rosterModelIds }, deletedAt: null },
        select: { id: true, modelId: true, runId: true, scenarioId: true, decisionMetadata: true },
        orderBy: { id: 'asc' },
        take: TRANSCRIPT_PAGE_SIZE + 1,
        ...(cursor != null ? { skip: 1, cursor } : {}),
      })) as TranscriptRow[];
      const hasMore = page.length > TRANSCRIPT_PAGE_SIZE;
      return { rows: hasMore ? page.slice(0, TRANSCRIPT_PAGE_SIZE) : page, hasMore };
    },
    log,
  );

  const perModel = new Map<string, Map<string, PairAccumulator>>();
  for (const m of activeModels) perModel.set(m.modelId, new Map());

  for (const tx of transcripts) {
    const defId = sourceRunToDefId.get(tx.runId);
    if (defId == null) { pressureConditionExclusionBreakdown.sourceRunMapping += 1; continue; }
    const meta = definitionMeta.get(defId);
    if (meta == null) { pressureConditionExclusionBreakdown.definitionMetadata += 1; continue; }
    const scenario = tx.scenarioId != null ? scenarioById.get(tx.scenarioId) ?? null : null;

    const decision = resolveTranscriptDecisionModel({
      decisionMetadata: tx.decisionMetadata,
      definitionSnapshot: meta.decisionSnapshot,
      orientationFlipped: scenario?.orientationFlipped ?? null,
    });
    const outcome = assignOwnOpponent(meta.firstValueToken, meta.secondValueToken, decision.canonical.direction as CanonicalDirection);
    const strength = strengthFromCanonical(decision.canonical.strength);
    const pairAcc = ensurePairAccumulator(perModel, tx.modelId, meta);
    pairAcc.definitionsMeasured.add(defId);

    if (outcome === 'unscored') {
      const unscoredCell = ensureUnscoredCell(pairAcc);
      const observations = unscoredCell.observationsByDefinition.get(defId);
      if (observations != null) { observations.push({ outcome, strength }); }
      else { unscoredCell.observationsByDefinition.set(defId, [{ outcome, strength }]); }
      continue;
    }

    if (scenario == null) { pressureConditionExclusionBreakdown.missingScenario += 1; continue; }
    const normalized = normalizeScenarioAnalysisMetadata(scenario.content);
    if (normalized === null) { pressureConditionExclusionBreakdown.invalidMetadata += 1; continue; }

    const levels = assignOwnOpponentLevels(meta.dimensions, normalized.groupingDimensions, meta.ownLookup, meta.opponentLookup, meta.firstValueToken, meta.secondValueToken);
    if (levels === null) { pressureConditionExclusionBreakdown.levelAssignment += 1; continue; }

    const key = cellKey(levels.ownLevel, levels.opponentLevel);
    let cell = pairAcc.cells.get(key);
    if (cell == null) {
      cell = { ownLevel: levels.ownLevel, opponentLevel: levels.opponentLevel, observationsByDefinition: new Map() };
      pairAcc.cells.set(key, cell);
    }
    const observations = cell.observationsByDefinition.get(defId);
    if (observations != null) { observations.push({ outcome, strength }); }
    else { cell.observationsByDefinition.set(defId, [{ outcome, strength }]); }
  }

  const outputModels: PressureSensitivityModelShape[] = [];
  const insufficient: InsufficientPressureSensitivityModelShape[] = [];
  const sanityBreakdown: DirectionalSanityCheckEntryShape[] = [];
  let sanityPositive = 0;
  let sanityFlat = 0;
  let sanityNegative = 0;
  let sanityUnmeasurable = 0;

  for (const model of activeModels) {
    const pairs = perModel.get(model.modelId) ?? new Map<string, PairAccumulator>();
    const valuePairs: PressureSensitivityValuePairShape[] = [];
    const pairKeysByValue = new Map<string, Set<string>>();
    let modelUnscored = 0;
    const perPairPressureResponses: number[] = [];

    for (const acc of pairs.values()) {
      const grid: SensitivityCellShape[] = [];
      let pairN = 0;
      let pairUnscored = 0;
      for (const [, cellAcc] of acc.cells) {
        const metrics = buildVignetteWeightedCellMetrics([...cellAcc.observationsByDefinition.values()], MIN_N);
        pairN += metrics.n;
        pairUnscored += metrics.unscoredCount;
        grid.push({
          ownLevel: cellAcc.ownLevel,
          opponentLevel: cellAcc.opponentLevel,
          n: metrics.n,
          successes: metrics.successes,
          opponentSuccesses: metrics.opponentSuccesses,
          unscoredCount: metrics.unscoredCount,
          winRate: metrics.winRate,
          opponentWinRate: metrics.opponentWinRate,
          conviction: metrics.conviction,
          netScore: metrics.netScore,
          lowData: metrics.lowData,
        });
      }
      modelUnscored += pairUnscored;

      const pressureResponse = pooledDirectionalReduction(grid, MIN_N);
      const dbCommonParams = {
        cells: acc.cells,
        definitionsMeasured: acc.definitionsMeasured,
        canonicalFirstValueToken: acc.firstValueToken,
        authoredFirstTokenByDef,
        domainByDef,
      };
      const dbAll = computeDirectionBalancedPairWinRates(dbCommonParams);
      const dbBalanced = computeDirectionBalancedPairWinRates({ ...dbCommonParams, cellFilter: (own, opp) => own === opp });
      const dbHighOwn = computeDirectionBalancedPairWinRates({ ...dbCommonParams, cellFilter: (own, opp) => own >= 4 && opp <= 3 });
      const dbHighOpponent = computeDirectionBalancedPairWinRates({ ...dbCommonParams, cellFilter: (own, opp) => opp >= 4 && own <= 3 });

      valuePairs.push({
        pairKey: acc.pairKey,
        firstValueToken: acc.firstValueToken,
        firstValueLabel: formatValueLabel(acc.firstValueToken),
        secondValueToken: acc.secondValueToken,
        secondValueLabel: formatValueLabel(acc.secondValueToken),
        pressureResponse: {
          value: pressureResponse.value,
          ciLow: pressureResponse.ciLow,
          ciHigh: pressureResponse.ciHigh,
          baselineRate: pressureResponse.baselineRate,
          pushTowardFirstRate: pressureResponse.pushTowardFirstRate,
          pushTowardSecondRate: pressureResponse.pushTowardSecondRate,
          qualifyingTrials: pressureResponse.qualifyingTrials,
          reason: pressureResponse.reason,
        },
        n: pairN,
        unscoredCount: pairUnscored,
        grid,
        definitionsMeasured: acc.definitionsMeasured.size,
        directionBalancedWinRate: dbAll.ownRate,
        directionBalancedOpponentWinRate: dbAll.opponentRate,
        directionBalancedBalancedWinRate: dbBalanced.ownRate,
        directionBalancedBalancedOpponentWinRate: dbBalanced.opponentRate,
        directionBalancedHighPressureOwnWinRate: dbHighOwn.ownRate,
        directionBalancedHighPressureOwnOpponentWinRate: dbHighOwn.opponentRate,
        directionBalancedHighPressureOpponentWinRate: dbHighOpponent.ownRate,
        directionBalancedHighPressureOpponentOpponentWinRate: dbHighOpponent.opponentRate,
      });

      const firstPairKeys = pairKeysByValue.get(acc.firstValueToken) ?? new Set<string>();
      firstPairKeys.add(acc.pairKey);
      pairKeysByValue.set(acc.firstValueToken, firstPairKeys);
      const secondPairKeys = pairKeysByValue.get(acc.secondValueToken) ?? new Set<string>();
      secondPairKeys.add(acc.pairKey);
      pairKeysByValue.set(acc.secondValueToken, secondPairKeys);

      if (pressureResponse.value !== null) {
        perPairPressureResponses.push(pressureResponse.value);
        const classification: 'positive' | 'flat' | 'negative' =
          Math.abs(pressureResponse.value) < FLAT_DELTA_THRESHOLD ? 'flat'
          : pressureResponse.value > 0 ? 'positive'
          : 'negative';
        if (classification === 'positive') sanityPositive += 1;
        else if (classification === 'flat') sanityFlat += 1;
        else sanityNegative += 1;
        sanityBreakdown.push({ modelId: model.modelId, pairKey: acc.pairKey, pressureResponse: pressureResponse.value, classification });
      } else {
        sanityUnmeasurable += 1;
      }
    }

    const valueRateGroupsByFilter: Record<ValueRateFilter, Map<string, ValueRateCellAccumulator>> = {
      all: new Map(), balanced: new Map(), highPressureOnValue: new Map(), highPressureOnOpposingValue: new Map(),
    };

    for (const acc of pairs.values()) {
      for (const [, cellAcc] of acc.cells) {
        for (const [defId, observations] of cellAcc.observationsByDefinition.entries()) {
          const authoredFirstToken = authoredFirstTokenByDef.get(defId);
          if (authoredFirstToken == null) continue;
          const metrics = buildCellMetrics([...observations]);
          if (metrics.n === 0 || metrics.winRate == null || metrics.opponentWinRate == null) continue;
          const domainForDefinition = domainByDef.get(defId) ?? defId;
          const sides = [
            { valueToken: acc.firstValueToken, cellRate: metrics.winRate, isCanonicalFirst: true },
            { valueToken: acc.secondValueToken, cellRate: metrics.opponentWinRate, isCanonicalFirst: false },
          ] as const;
          for (const side of sides) {
            if (side.cellRate == null) continue;
            for (const filter of Object.keys(valueRateGroupsByFilter) as ValueRateFilter[]) {
              if (!shouldIncludeValueRateCell(filter, side.isCanonicalFirst, cellAcc.ownLevel, cellAcc.opponentLevel)) continue;
              addValueRateCell(valueRateGroupsByFilter[filter], {
                valueKey: side.valueToken, definitionId: defId, domainId: domainForDefinition,
                pairKey: acc.pairKey, directionKey: authoredFirstToken, cellRate: side.cellRate,
              });
            }
          }
        }
      }
    }

    const allValueRates = aggregateValueWinRates(toValueRateInputs(valueRateGroupsByFilter.all));
    const balancedValueRates = aggregateValueWinRates(toValueRateInputs(valueRateGroupsByFilter.balanced));
    const highPressureOnValueRates = aggregateValueWinRates(toValueRateInputs(valueRateGroupsByFilter.highPressureOnValue));
    const highPressureOnOpposingValueRates = aggregateValueWinRates(toValueRateInputs(valueRateGroupsByFilter.highPressureOnOpposingValue));

    const valueTokens = [...pairKeysByValue.keys()].sort((a, b) => a.localeCompare(b));
    const valueRates: PressureSensitivityValueRateShape[] = valueTokens.map((valueToken) => ({
      valueToken,
      valueLabel: formatValueLabel(valueToken),
      averageWinRate: allValueRates.get(valueToken)?.crossDomainRate ?? null,
      balancedWinRate: balancedValueRates.get(valueToken)?.crossDomainRate ?? null,
      highPressureOnThisValueWinRate: highPressureOnValueRates.get(valueToken)?.crossDomainRate ?? null,
      highPressureOnOpposingValueWinRate: highPressureOnOpposingValueRates.get(valueToken)?.crossDomainRate ?? null,
      highPressureOnThisValueDomainRates: (highPressureOnValueRates.get(valueToken)?.domainRates ?? []).map((domainRate) => ({
        domainId: domainRate.domainId,
        domainName: domainNameById.get(domainRate.domainId) ?? domainRate.domainId,
        rate: domainRate.rate,
        pairsMeasured: domainRate.pairsCounted,
      })),
      pairsMeasured: pairKeysByValue.get(valueToken)?.size ?? 0,
    }));

    const pressureResponseSummary = summarizePressureResponse(perPairPressureResponses);
    if (valuePairs.length === 0 || pressureResponseSummary.pairsMeasured === 0) {
      insufficient.push({ modelId: model.modelId, label: model.displayName, providerName: model.provider.displayName ?? model.provider.name, reason: 'no-coverage' });
      continue;
    }
    const { pushedForEffect, pushedAgainstEffect, pairsUsed: pushedEffectPairsUsed, domainPressureEffects } =
      computeModelPushedEffects(pairs, authoredFirstTokenByDef, domainByDef, domainNameById);
    outputModels.push({
      modelId: model.modelId,
      label: model.displayName,
      providerName: model.provider.displayName ?? model.provider.name,
      pressureResponseSummary,
      valuePairs: valuePairs.sort((a, b) => a.pairKey.localeCompare(b.pairKey)),
      valueRates,
      unscoredCount: modelUnscored,
      pushedForEffect,
      pushedAgainstEffect,
      pushedEffectPairsUsed,
      domainPressureEffects,
    });
  }

  const measuredCount = sanityPositive + sanityFlat + sanityNegative;
  const directionalSanityCheck: DirectionalSanityCheckShape = {
    positivePct: measuredCount === 0 ? 0 : (sanityPositive / measuredCount) * 100,
    flatPct: measuredCount === 0 ? 0 : (sanityFlat / measuredCount) * 100,
    negativePct: measuredCount === 0 ? 0 : (sanityNegative / measuredCount) * 100,
    measuredCount,
    unmeasurableCount: sanityUnmeasurable,
    breakdown: sanityBreakdown,
  };

  return {
    models: outputModels.sort((a, b) => {
      const aMean = a.pressureResponseSummary.mean;
      const bMean = b.pressureResponseSummary.mean;
      if (aMean === null && bMean === null) return a.label.localeCompare(b.label);
      if (aMean === null) return 1;
      if (bMean === null) return -1;
      if (bMean !== aMean) return bMean - aMean;
      return a.label.localeCompare(b.label);
    }),
    insufficient,
    excludedDefinitions,
    pressureConditionExcludedCount: totalPressureConditionExclusions(pressureConditionExclusionBreakdown),
    pressureConditionExclusionBreakdown,
    directionalSanityCheck,
    transcriptCapHit,
  };
}
