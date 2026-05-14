import { describe, expect, it } from 'vitest';
import {
  buildWinRateStabilityAssumptionKey,
  dedupeRunsBySignature,
  normalizeWinRateStabilitySignature,
} from '../../../../src/services/analysis/win-rate-stability/snapshot-builder.js';
import { parseWinRateStabilitySnapshotOutput } from '../../../../src/services/analysis/win-rate-stability/snapshot-cache.js';

describe('dedupeRunsBySignature', () => {
  const config = { temperature: null, definitionSnapshot: { version: 1 } };

  it('keeps the first (most-recent) run per definitionId when signature is pinned', () => {
    const runs = [
      { id: 'run-new', definitionId: 'def-1', config },
      { id: 'run-old', definitionId: 'def-1', config },
    ];
    const deduped = dedupeRunsBySignature(runs, 'v1td');
    expect(deduped.map((run) => run.id)).toEqual(['run-new']);
  });

  it('keeps runs for distinct definitionIds', () => {
    const runs = [
      { id: 'run-a', definitionId: 'def-1', config },
      { id: 'run-b', definitionId: 'def-2', config },
    ];
    const deduped = dedupeRunsBySignature(runs, 'v1td');
    expect(deduped.map((run) => run.id).sort()).toEqual(['run-a', 'run-b']);
  });

  it('treats the same definitionId under different resolved signatures as distinct when signature is null', () => {
    const runs = [
      { id: 'run-v1', definitionId: 'def-1', config: { temperature: null, definitionSnapshot: { version: 1 } } },
      { id: 'run-v2', definitionId: 'def-1', config: { temperature: null, definitionSnapshot: { version: 2 } } },
    ];
    const deduped = dedupeRunsBySignature(runs, null);
    expect(deduped.map((run) => run.id).sort()).toEqual(['run-v1', 'run-v2']);
  });
});

describe('normalizeWinRateStabilitySignature', () => {
  it('maps null to the none sentinel', () => {
    expect(normalizeWinRateStabilitySignature(null)).toBe('__none__');
  });

  it('passes a pinned signature through unchanged', () => {
    expect(normalizeWinRateStabilitySignature('v1td')).toBe('v1td');
  });
});

describe('buildWinRateStabilityAssumptionKey', () => {
  it('namespaces the scope id under the win-rate-stability prefix', () => {
    expect(buildWinRateStabilityAssumptionKey('all-domains')).toBe('win-rate-stability::all-domains');
    expect(buildWinRateStabilityAssumptionKey('domain-cuid-123')).toBe('win-rate-stability::domain-cuid-123');
  });
});

describe('parseWinRateStabilitySnapshotOutput', () => {
  it('returns the normalized output for a well-formed snapshot', () => {
    const raw = {
      models: [{ modelId: 'm1', label: 'M1' }],
      skippedVignettes: [{ definitionId: 'd1', vignetteName: 'V1', reason: 'normalization-failed' }],
      extraneous: 'ignored',
    };
    const parsed = parseWinRateStabilitySnapshotOutput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.models).toHaveLength(1);
    expect(parsed?.skippedVignettes).toHaveLength(1);
    expect(parsed).not.toHaveProperty('extraneous');
  });

  it('returns null when models or skippedVignettes are missing or not arrays', () => {
    expect(parseWinRateStabilitySnapshotOutput({ skippedVignettes: [] })).toBeNull();
    expect(parseWinRateStabilitySnapshotOutput({ models: [], skippedVignettes: 'nope' })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseWinRateStabilitySnapshotOutput(null)).toBeNull();
    expect(parseWinRateStabilitySnapshotOutput('snapshot')).toBeNull();
    expect(parseWinRateStabilitySnapshotOutput([])).toBeNull();
  });
});
