/**
 * Domain Coverage GQL Types
 *
 * Pothos objectRef implementations and shared types for the domainValueCoverage
 * query. Extracted to keep domain-coverage.ts under the 400-line limit.
 */

import { builder } from '../builder.js';
import {
  formatTrialSignature,
  isVnewSignature,
  parseVnewTemperature,
} from '@valuerank/shared/trial-signature';
import { parseDefinitionVersion } from '../../utils/definition-version.js';
import { parseTemperature } from '../../utils/temperature.js';
import type { CoverageModelBreakdown } from './domain-coverage-utils.js';

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type DomainValueCoverageCell = {
  valueA: string;
  valueB: string;
  batchCount: number;
  pairedBatchCount: number;
  /** Number of non-aggregate runs whose transcript count is less than expected. */
  incompleteBatchCount: number;
  definitionId: string | null;
  definitionName: string | null;
  aggregateRunId: string | null;
  minTrialCount: number | null;
  maxTrialCount: number | null;
  modelBreakdown: CoverageModelBreakdown[] | null;
};

export type CoverageModelOption = {
  modelId: string;
  label: string;
};

export type DomainValueCoverageResult = {
  domainId: string;
  values: string[];
  cells: DomainValueCoverageCell[];
  availableModels: CoverageModelOption[];
};

// ─── Pothos GQL objectRefs ────────────────────────────────────────────────────

const CoverageModelOptionRef = builder
  .objectRef<CoverageModelOption>('CoverageModelOption')
  .implement({
    fields: (t) => ({
      modelId: t.exposeString('modelId'),
      label: t.exposeString('label'),
    }),
  });

const CoverageModelBreakdownRef = builder
  .objectRef<CoverageModelBreakdown>('CoverageModelBreakdown')
  .implement({
    fields: (t) => ({
      modelId: t.exposeString('modelId'),
      label: t.exposeString('label'),
      trialCount: t.exposeInt('trialCount'),
    }),
  });

const DomainValueCoverageCellRef = builder
  .objectRef<DomainValueCoverageCell>('DomainValueCoverageCell')
  .implement({
    fields: (t) => ({
      valueA: t.exposeString('valueA'),
      valueB: t.exposeString('valueB'),
      batchCount: t.exposeInt('batchCount'),
      pairedBatchCount: t.exposeInt('pairedBatchCount'),
      incompleteBatchCount: t.exposeInt('incompleteBatchCount'),
      definitionId: t.exposeString('definitionId', { nullable: true }),
      definitionName: t.exposeString('definitionName', { nullable: true }),
      aggregateRunId: t.exposeString('aggregateRunId', { nullable: true }),
      minTrialCount: t.exposeInt('minTrialCount', { nullable: true }),
      maxTrialCount: t.exposeInt('maxTrialCount', { nullable: true }),
      modelBreakdown: t.expose('modelBreakdown', {
        type: [CoverageModelBreakdownRef],
        nullable: true,
      }),
    }),
  });

export const DomainValueCoverageResultRef = builder
  .objectRef<DomainValueCoverageResult>('DomainValueCoverageResult')
  .implement({
    fields: (t) => ({
      domainId: t.exposeString('domainId'),
      values: t.exposeStringList('values'),
      cells: t.field({
        type: [DomainValueCoverageCellRef],
        resolve: (parent) => parent.cells,
      }),
      availableModels: t.field({
        type: [CoverageModelOptionRef],
        resolve: (parent) => parent.availableModels,
      }),
    }),
  });

// ─── Signature helpers ────────────────────────────────────────────────────────

export function formatRunSignature(config: unknown): string {
  const runConfig = config as {
    definitionSnapshot?: {
      _meta?: { definitionVersion?: unknown };
      version?: unknown;
    };
    temperature?: unknown;
  } | null;
  const definitionVersion =
    parseDefinitionVersion(runConfig?.definitionSnapshot?._meta?.definitionVersion) ??
    parseDefinitionVersion(runConfig?.definitionSnapshot?.version);
  const temperature = parseTemperature(runConfig?.temperature);
  return formatTrialSignature(definitionVersion, temperature);
}

export function runMatchesSignature(runConfig: unknown, signature: string): boolean {
  if (isVnewSignature(signature)) {
    return (
      parseTemperature((runConfig as { temperature?: unknown } | null)?.temperature) ===
      parseVnewTemperature(signature)
    );
  }
  return formatRunSignature(runConfig) === signature;
}
