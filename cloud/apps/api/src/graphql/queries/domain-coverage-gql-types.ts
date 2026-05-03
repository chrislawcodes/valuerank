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

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type CoverageModelCount = {
  modelId: string;
  label: string;
  trialCount: number;
};

export type CoverageWeakestCondition = {
  conditionLabel: string;
  modelCounts: CoverageModelCount[];
  otherConditionsCount: number | null;
};

export type DomainValueCoverageCell = {
  valueA: string;
  valueB: string;
  batchEquivalent: number;
  aFirstBatchEquivalent: number;
  bFirstBatchEquivalent: number;
  aFirstDefinitionName: string | null;
  bFirstDefinitionName: string | null;
  weakestCondition: CoverageWeakestCondition | null;
  contributingDefinitionIds: string[];
  definitionId: string | null;
  aggregateRunId: string | null;
};

export type CoverageModelOption = {
  modelId: string;
  label: string;
};

export type DirectionalCoverage = {
  direction: string;
  completeBatches: number;
  filledSlots: number;
  leftoverConditions: number;
  definitionIds: string[];
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

const CoverageModelCountRef = builder
  .objectRef<CoverageModelCount>('CoverageModelCount')
  .implement({
    fields: (t) => ({
      modelId: t.exposeString('modelId'),
      label: t.exposeString('label'),
      trialCount: t.exposeInt('trialCount'),
    }),
  });

const CoverageWeakestConditionRef = builder
  .objectRef<CoverageWeakestCondition>('CoverageWeakestCondition')
  .implement({
    fields: (t) => ({
      conditionLabel: t.exposeString('conditionLabel'),
      modelCounts: t.field({
        type: [CoverageModelCountRef],
        resolve: (parent) => parent.modelCounts,
      }),
      otherConditionsCount: t.exposeInt('otherConditionsCount', { nullable: true }),
    }),
  });

const DomainValueCoverageCellRef = builder
  .objectRef<DomainValueCoverageCell>('DomainValueCoverageCell')
  .implement({
    fields: (t) => ({
      valueA: t.exposeString('valueA'),
      valueB: t.exposeString('valueB'),
      batchEquivalent: t.exposeInt('batchEquivalent'),
      aFirstBatchEquivalent: t.exposeInt('aFirstBatchEquivalent'),
      bFirstBatchEquivalent: t.exposeInt('bFirstBatchEquivalent'),
      aFirstDefinitionName: t.exposeString('aFirstDefinitionName', { nullable: true }),
      bFirstDefinitionName: t.exposeString('bFirstDefinitionName', { nullable: true }),
      weakestCondition: t.field({
        type: CoverageWeakestConditionRef,
        nullable: true,
        resolve: (parent) => parent.weakestCondition,
      }),
      contributingDefinitionIds: t.exposeStringList('contributingDefinitionIds', {
        description:
          'Union of definition IDs that contribute data to this coverage cell, sorted alphabetically.',
      }),
      definitionId: t.exposeString('definitionId', { nullable: true }),
      aggregateRunId: t.exposeString('aggregateRunId', { nullable: true }),
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
