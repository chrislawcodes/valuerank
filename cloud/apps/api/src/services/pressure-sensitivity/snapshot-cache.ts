import { db } from '@valuerank/db';
import { AppError, createLogger } from '@valuerank/shared';
import { getBoss, isBossRunning } from '../../queue/boss.js';
import { DEFAULT_JOB_OPTIONS } from '../../queue/types.js';
import type {
  DirectionalSanityCheckEntryShape,
  DirectionalSanityCheckShape,
  PressureSensitivityModelShape,
  PressureSensitivityResultShape,
} from '../../graphql/types/pressure-sensitivity.js';
import { FLAT_DELTA_THRESHOLD } from './aggregation.js';
import {
  PRESSURE_SENSITIVITY_ASSUMPTION_PREFIX,
  PRESSURE_SENSITIVITY_SNAPSHOT_TYPE,
} from './snapshot-types.js';
import {
  emptyPressureConditionExclusionBreakdown,
  PAIR_KEY_COMPANION_COLLISION,
  PAIR_KEY_COMPANION_MIRROR_FAILURE,
  preparePressureSensitivityState,
  writeSnapshot,
} from './snapshot-builder.js';
import { buildPressureSensitivitySnapshotOutput } from './snapshot-compute.js';

const log = createLogger('pressure-sensitivity:cache');

export function parseSnapshotOutput(raw: unknown): PressureSensitivityResultShape | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const result = raw as PressureSensitivityResultShape;
  // Snapshots written before v1.4.0 lack the domain-by-value high-pressure rates.
  // Return null so the caller falls through to synchronous recompute rather than
  // serving stale data that renders the new report incomplete.
  const missingNewFields = result.models.some((m) => {
    const model = m as {
      pushedEffectPairsUsed?: unknown;
      domainPressureEffects?: unknown;
      valueRates?: Array<{ highPressureOnThisValueDomainRates?: unknown }>;
    };
    return (
      model.pushedEffectPairsUsed == null
      || model.domainPressureEffects == null
      || model.valueRates == null
      || model.valueRates.some((valueRate) => valueRate.highPressureOnThisValueDomainRates == null)
    );
  });
  if (missingNewFields) return null;
  return result;
}

function recomputeSanityCheck(models: PressureSensitivityModelShape[]): DirectionalSanityCheckShape {
  let positive = 0;
  let flat = 0;
  let negative = 0;
  let unmeasurable = 0;
  const breakdown: DirectionalSanityCheckEntryShape[] = [];

  for (const model of models) {
    for (const pair of model.valuePairs) {
      const val = pair.pressureResponse.value;
      if (val !== null) {
        const classification: 'positive' | 'flat' | 'negative' =
          Math.abs(val) < FLAT_DELTA_THRESHOLD ? 'flat'
          : val > 0 ? 'positive'
          : 'negative';
        if (classification === 'positive') positive += 1;
        else if (classification === 'flat') flat += 1;
        else negative += 1;
        breakdown.push({ modelId: model.modelId, pairKey: pair.pairKey, pressureResponse: val, classification });
      } else {
        unmeasurable += 1;
      }
    }
  }

  const measured = positive + flat + negative;
  return {
    positivePct: measured === 0 ? 0 : (positive / measured) * 100,
    flatPct: measured === 0 ? 0 : (flat / measured) * 100,
    negativePct: measured === 0 ? 0 : (negative / measured) * 100,
    measuredCount: measured,
    unmeasurableCount: unmeasurable,
    breakdown,
  };
}

function filterResult(
  result: PressureSensitivityResultShape,
  modelIds: string[] | null,
  providerId: string | null,
): PressureSensitivityResultShape {
  if (modelIds == null && providerId == null) return result;

  function matches(modelId: string, providerName: string): boolean {
    const modelOk = modelIds == null || modelIds.includes(modelId);
    const providerOk = providerId == null || providerName === providerId;
    return modelOk && providerOk;
  }

  const filteredModels = result.models.filter((m) => matches(m.modelId, m.providerName));
  const filteredInsufficient = result.insufficient.filter((m) => matches(m.modelId, m.providerName));

  return {
    ...result,
    models: filteredModels,
    insufficient: filteredInsufficient,
    directionalSanityCheck: recomputeSanityCheck(filteredModels),
  };
}

async function buildCompanionFailureResult(
  definitionId: string,
  reason: string,
): Promise<PressureSensitivityResultShape> {
  const definition = await db.definition.findUnique({
    where: { id: definitionId },
    select: { name: true },
  });

  const name = definition?.name ?? definitionId;
  return {
    models: [],
    insufficient: [],
    excludedDefinitions: [{ definitionId, name, reason }],
    pressureConditionExcludedCount: 0,
    pressureConditionExclusionBreakdown: emptyPressureConditionExclusionBreakdown(),
    directionalSanityCheck: {
      positivePct: 0,
      flatPct: 0,
      negativePct: 0,
      measuredCount: 0,
      unmeasurableCount: 0,
      breakdown: [],
    },
    transcriptCapHit: false,
  };
}

export async function queuePressureSensitivityRefresh(params: {
  domainId: string | null;
  signature: string;
  reason: string;
}): Promise<boolean> {
  if (!isBossRunning()) {
    log.warn(
      { domainId: params.domainId, signature: params.signature, reason: params.reason },
      'Pressure sensitivity refresh skipped — queue unavailable',
    );
    return false;
  }

  const boss = getBoss();
  const domainKey = params.domainId ?? '__all__';
  await boss.send(
    'refresh_pressure_sensitivity_snapshot',
    { domainId: params.domainId, signature: params.signature, reason: params.reason },
    {
      ...DEFAULT_JOB_OPTIONS.refresh_pressure_sensitivity_snapshot,
      singletonKey: `pressure-sensitivity:${domainKey}:${params.signature}`,
    },
  );
  return true;
}

export async function refreshPressureSensitivitySnapshot(params: {
  domainId: string | null;
  signature: string;
}): Promise<void> {
  const state = await preparePressureSensitivityState(params);
  const output = await buildPressureSensitivitySnapshotOutput(state);
  await writeSnapshot({
    domainId: params.domainId,
    signature: params.signature,
    inputHash: state.inputHash,
    output,
  });
}

export async function getPressureSensitivityResult(params: {
  domainId: string | null;
  modelIds: string[] | null;
  providerId: string | null;
  signature: string;
  definitionId?: string | null;
}): Promise<PressureSensitivityResultShape> {
  if (params.definitionId != null) {
    const startMs = Date.now();
    let state: Awaited<ReturnType<typeof preparePressureSensitivityState>>;
    try {
      state = await preparePressureSensitivityState({
        domainId: params.domainId,
        signature: params.signature,
        definitionId: params.definitionId,
      });
    } catch (err) {
      if (
        err instanceof AppError &&
        (err.code === PAIR_KEY_COMPANION_COLLISION || err.code === PAIR_KEY_COMPANION_MIRROR_FAILURE)
      ) {
        log.warn({ definitionId: params.definitionId, code: err.code }, 'Vignette-paired companion expansion failed');
        return buildCompanionFailureResult(params.definitionId, err.code);
      }
      throw err;
    }
    const output = await buildPressureSensitivitySnapshotOutput(state);
    const durationMs = Date.now() - startMs;
    log.info(
      { definitionId: params.definitionId, runCount: state.eligibleRuns.length, durationMs },
      'Vignette-paired pressure sensitivity computed',
    );
    return filterResult(output, params.modelIds, params.providerId);
  }

  const state = await preparePressureSensitivityState({
    domainId: params.domainId,
    signature: params.signature,
  });

  const assumptionKey = `${PRESSURE_SENSITIVITY_ASSUMPTION_PREFIX}::${params.domainId ?? '__all__'}`;
  const currentSnapshot = await db.assumptionAnalysisSnapshot.findFirst({
    where: {
      assumptionKey,
      analysisType: PRESSURE_SENSITIVITY_SNAPSHOT_TYPE,
      configSignature: params.signature,
      status: 'CURRENT',
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  if (currentSnapshot != null) {
    const parsed = parseSnapshotOutput(currentSnapshot.output);
    if (parsed != null) {
      if (currentSnapshot.inputHash === state.inputHash) {
        log.info({ assumptionKey, signature: params.signature }, 'Pressure sensitivity snapshot FRESH');
        return filterResult(parsed, params.modelIds, params.providerId);
      }

      await queuePressureSensitivityRefresh({
        domainId: params.domainId,
        signature: params.signature,
        reason: 'page-load-stale',
      });
      log.info({ assumptionKey, signature: params.signature }, 'Pressure sensitivity snapshot STALE — returning cached, rebuild queued');
      return filterResult(parsed, params.modelIds, params.providerId);
    }
  }

  log.info({ assumptionKey, signature: params.signature }, 'Pressure sensitivity snapshot MISSING — computing synchronously');
  const output = await buildPressureSensitivitySnapshotOutput(state);
  await writeSnapshot({
    domainId: params.domainId,
    signature: params.signature,
    inputHash: state.inputHash,
    output,
  });
  return filterResult(output, params.modelIds, params.providerId);
}
