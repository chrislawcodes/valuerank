import { parseTemperature } from '../../../utils/temperature.js';
import { BASELINE_COMPATIBLE_ASSUMPTION_KEYS } from './constants.js';
import type { RunConfig } from './contracts.js';

export function parseDefinitionVersion(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getSnapshotMeta(config: RunConfig): { preambleVersionId: string | null; definitionVersion: number | null } {
  const snapshot = config.definitionSnapshot;
  const preambleVersionId =
    snapshot?._meta?.preambleVersionId ??
    snapshot?.preambleVersionId ??
    null;
  const definitionVersion =
    parseDefinitionVersion(snapshot?._meta?.definitionVersion) ??
    parseDefinitionVersion(snapshot?.version);
  return { preambleVersionId, definitionVersion };
}

export function getConfigTemperature(config: RunConfig): number | null {
  return parseTemperature(config.temperature);
}

export function getAssumptionKey(config: RunConfig): string | null {
  return typeof config.assumptionKey === 'string' && config.assumptionKey.trim() !== ''
    ? config.assumptionKey
    : null;
}

export function hasAssumptionRunTag(tags: Array<{ tag: { name: string } }>): boolean {
  return tags.some((entry) => entry.tag.name === 'assumption-run');
}

export function isBaselineCompatibleRun(config: RunConfig | null, tags: Array<{ tag: { name: string } }>): boolean {
  if (config == null) return false;

  const assumptionKey = getAssumptionKey(config);
  if (assumptionKey === null) {
    return !hasAssumptionRunTag(tags);
  }

  return BASELINE_COMPATIBLE_ASSUMPTION_KEYS.has(assumptionKey);
}
