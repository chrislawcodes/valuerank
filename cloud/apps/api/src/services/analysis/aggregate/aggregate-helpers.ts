import { createHash } from 'crypto';
import { zRunConfig, type RunConfig } from './contracts.js';
import { getSnapshotMeta, getConfigTemperature } from './config.js';
import { prepareAggregateRunSnapshot } from './aggregate-run-workflow.js';
import { AggregateRecomputeRetryableError } from './aggregate-types.js';
import type {
  AggregateRecomputeClaim,
  AggregateRunConfig,
  AggregateRunPreparation,
  AggregateRunSelection,
} from './aggregate-types.js';

type AggregateSourceRunRecord = { id: string; config: unknown } & Record<string, unknown>;

export function buildValueOutcomes(
  score: number | null,
  orientationFlipped: boolean,
  valueA: string | null,
  valueB: string | null
): Record<string, 'prioritized' | 'deprioritized' | 'neutral'> | undefined {
  if (score == null || valueA == null || valueB == null) return undefined;
  const normalizedScore = orientationFlipped ? 6 - score : score;

  if (normalizedScore >= 4) {
    return {
      [valueA]: 'prioritized',
      [valueB]: 'deprioritized',
    };
  }
  if (normalizedScore <= 2) {
    return {
      [valueA]: 'deprioritized',
      [valueB]: 'prioritized',
    };
  }
  return {
    [valueA]: 'neutral',
    [valueB]: 'neutral',
  };
}

export function buildCanonicalValueOutcomes(
  direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown',
  valueA: string | null,
  valueB: string | null,
): Record<string, 'prioritized' | 'deprioritized' | 'neutral'> | undefined {
  if (valueA == null || valueB == null || direction === 'unknown') {
    return undefined;
  }

  if (direction === 'neutral') {
    return {
      [valueA]: 'neutral',
      [valueB]: 'neutral',
    };
  }

  if (direction === 'favor_first') {
    return {
      [valueA]: 'prioritized',
      [valueB]: 'deprioritized',
    };
  }

  return {
    [valueA]: 'deprioritized',
    [valueB]: 'prioritized',
  };
}

export function buildClaimConfig(
  prepared: AggregateRunPreparation,
  existingConfig: RunConfig | null
): AggregateRunConfig {
  const nextConfig: Record<string, unknown> = {
    ...(existingConfig ?? {}),
    ...prepared.finalRunConfig,
    aggregateRecomputeClaim: prepared.claim,
    aggregateSourceFingerprint: prepared.sourceFingerprint,
  };
  return nextConfig as AggregateRunConfig;
}

export function getAggregateRecomputeClaim(config: RunConfig): AggregateRecomputeClaim | null {
  const claim = (config as RunConfig & { aggregateRecomputeClaim?: unknown }).aggregateRecomputeClaim;
  if (claim == null || typeof claim !== 'object') return null;

  const token = (claim as Record<string, unknown>).token;
  const sourceFingerprint = (claim as Record<string, unknown>).sourceFingerprint;
  const leaseExpiresAt = (claim as Record<string, unknown>).leaseExpiresAt;

  if (
    typeof token !== 'string' ||
    token.trim() === '' ||
    typeof sourceFingerprint !== 'string' ||
    sourceFingerprint.trim() === '' ||
    typeof leaseExpiresAt !== 'string' ||
    leaseExpiresAt.trim() === ''
  ) {
    return null;
  }

  return {
    token,
    sourceFingerprint,
    leaseExpiresAt,
  };
}

export function findMatchingAggregateRun(
  runs: AggregateSourceRunRecord[],
  selection: AggregateRunSelection
): AggregateSourceRunRecord | null {
  return runs.find((run) => {
    const parseResult = zRunConfig.safeParse(run.config);
    if (!parseResult.success) return false;

    const config = parseResult.data;
    const runMeta = getSnapshotMeta(config);
    const runTemperature = getConfigTemperature(config);
    const preambleMatch =
      selection.preambleVersionId === null
        ? runMeta.preambleVersionId === null
        : runMeta.preambleVersionId === selection.preambleVersionId;
    const definitionVersionMatch =
      selection.definitionVersion === null
        ? runMeta.definitionVersion === null
        : runMeta.definitionVersion === selection.definitionVersion;
    const temperatureMatch = runTemperature === selection.temperature;
    return preambleMatch && definitionVersionMatch && temperatureMatch;
  }) ?? null;
}

export function computeAggregateFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(stableStringify(value))
    .digest('hex');
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (value != null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

export async function verifyAggregateSnapshot(prepared: AggregateRunPreparation): Promise<void> {
  const currentPreparation = await prepareAggregateRunSnapshot(
    prepared.definitionId,
    prepared.selection.preambleVersionId,
    prepared.selection.definitionVersion,
    prepared.selection.temperature
  );

  if (currentPreparation == null) {
    throw new AggregateRecomputeRetryableError('Aggregate snapshot became stale before the final persist step');
  }

  if (currentPreparation.sourceFingerprint !== prepared.sourceFingerprint) {
    throw new AggregateRecomputeRetryableError('Aggregate snapshot fingerprint changed before the final persist step');
  }
}
