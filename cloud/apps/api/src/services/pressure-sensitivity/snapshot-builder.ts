import { db } from '@valuerank/db';
import { AppError, NotFoundError } from '@valuerank/shared';
import { runMatchesSignature } from '../../graphql/queries/domain-coverage-gql-types.js';
import type { DefinitionDimension } from '../../graphql/queries/scenarios-utils.js';
import type { PressureSensitivityResultShape } from '../../graphql/types/pressure-sensitivity.js';
import { findPairedCompanion } from '../../utils/auto-pair.js';
import { type PressureSensitivityDecisionSnapshot } from './decision-snapshot.js';
import { computeAggregateFingerprint } from '../analysis/aggregate/aggregate-helpers.js';
import {
  PRESSURE_SENSITIVITY_SNAPSHOT_CODE_VERSION,
  PRESSURE_SENSITIVITY_SNAPSHOT_TYPE,
  PRESSURE_SENSITIVITY_ASSUMPTION_PREFIX,
} from './snapshot-types.js';

const TRANSCRIPT_FETCH_LIMIT = 500_000;

export const PAIR_KEY_COMPANION_COLLISION = 'pair_key_companion_collision';
export const PAIR_KEY_COMPANION_MIRROR_FAILURE = 'pair_key_companion_mirror_failure';

export type CompanionExpansionStatus = 'paired' | 'companion_missing' | 'not_paired';

export type CompanionExpansionResult = {
  ids: string[];
  status: CompanionExpansionStatus;
};

export type ModelRow = {
  id: string;
  modelId: string;
  displayName: string;
  providerId: string;
  provider: { id: string; name: string; displayName: string | null };
};

export type RunRow = {
  id: string;
  config: unknown;
  definitionId: string;
  definition: { id: string; name: string; domainId: string | null } | null;
};

export type TranscriptRow = {
  id: string;
  modelId: string;
  runId: string;
  scenarioId: string | null;
  decisionMetadata: unknown;
};

export type DefinitionMetadata = {
  id: string;
  name: string;
  domainId: string | null;
  valueFirstToken: string;
  valueSecondToken: string;
  firstValueToken: string;
  secondValueToken: string;
  pairKey: string;
  decisionSnapshot: PressureSensitivityDecisionSnapshot;
  ownLookup: (raw: unknown) => number | null;
  opponentLookup: (raw: unknown) => number | null;
  dimensions: ReadonlyArray<DefinitionDimension>;
};

export type PressureConditionExclusionBreakdown = {
  sourceRunMapping: number;
  definitionMetadata: number;
  missingScenario: number;
  invalidMetadata: number;
  levelAssignment: number;
};

export type PressureSensitivityPreparedState = {
  domainId: string | null;
  signature: string;
  eligibleRuns: RunRow[];
  inputHash: string;
};

export type WarningLogger = {
  warn: (data: Record<string, unknown>, message: string) => void;
};

type TranscriptPage = {
  rows: TranscriptRow[];
  hasMore: boolean;
};

type TranscriptPageFetcher = (cursor: { id: string } | undefined) => Promise<TranscriptPage>;

function extractSourceRunIds(config: unknown): string[] {
  if (config === null || typeof config !== 'object') return [];
  const sourceRunIds = (config as { sourceRunIds?: unknown }).sourceRunIds;
  if (!Array.isArray(sourceRunIds)) return [];
  return sourceRunIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export function emptyPressureConditionExclusionBreakdown(): PressureConditionExclusionBreakdown {
  return { sourceRunMapping: 0, definitionMetadata: 0, missingScenario: 0, invalidMetadata: 0, levelAssignment: 0 };
}

/** Exported for testing the defense-in-depth exclusion paths (SC-010). */
export function emptyPressureConditionExclusionBreakdownForTest(): PressureConditionExclusionBreakdown {
  return emptyPressureConditionExclusionBreakdown();
}

export function buildSourceRunToDefIdMap(
  eligibleRuns: ReadonlyArray<RunRow>,
  definitionMeta: ReadonlyMap<string, DefinitionMetadata>,
  warningLogger: WarningLogger,
): Map<string, string> {
  const map = new Map<string, string>();
  const orderedRuns = [...eligibleRuns].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const run of orderedRuns) {
    const defId = run.definition?.id ?? run.definitionId;
    if (!definitionMeta.has(defId)) continue;
    for (const sourceRunId of extractSourceRunIds(run.config)) {
      const existingDefinitionId = map.get(sourceRunId);
      if (existingDefinitionId !== undefined && existingDefinitionId !== defId) {
        warningLogger.warn(
          { sourceRunId, existingDefinitionId, newDefinitionId: defId, code: 'source_run_collision' },
          'sourceRunId mapped to multiple definitions; last write wins',
        );
      }
      map.set(sourceRunId, defId);
    }
  }
  return map;
}

export async function fetchTranscriptsFromSourceRuns(
  sourceRunIds: ReadonlyArray<string>,
  rosterModelIds: ReadonlyArray<string>,
  fetchPage: TranscriptPageFetcher,
  warningLogger: WarningLogger,
  limit = TRANSCRIPT_FETCH_LIMIT,
): Promise<{ transcripts: TranscriptRow[]; transcriptCapHit: boolean }> {
  const transcripts: TranscriptRow[] = [];
  let cursor: { id: string } | undefined;
  let transcriptCapHit = false;

  if (sourceRunIds.length === 0 || rosterModelIds.length === 0) {
    return { transcripts, transcriptCapHit: false };
  }

  while (transcripts.length < limit) {
    const page = await fetchPage(cursor);
    if (page.rows.length === 0) break;

    const remaining = limit - transcripts.length;
    if (page.rows.length > remaining) {
      transcripts.push(...page.rows.slice(0, remaining));
      transcriptCapHit = true;
      break;
    }

    transcripts.push(...page.rows);
    if (page.hasMore && transcripts.length >= limit) {
      transcriptCapHit = true;
      break;
    }
    if (!page.hasMore) break;

    cursor = { id: page.rows[page.rows.length - 1]!.id };
  }

  if (transcriptCapHit) {
    warningLogger.warn(
      { sourceRunIds: [...sourceRunIds], scanned: transcripts.length, limit, code: 'transcript_cap_hit' },
      'Transcript fetch hit cap; results may be biased',
    );
  }

  return { transcripts, transcriptCapHit };
}

export function buildEmptyResult(
  models: ModelRow[],
  transcriptCapHit = false,
): PressureSensitivityResultShape {
  return {
    models: [],
    insufficient: models.map((m) => ({
      modelId: m.modelId,
      label: m.displayName,
      providerName: m.provider.displayName ?? m.provider.name,
      reason: 'no-coverage',
    })),
    excludedDefinitions: [],
    pressureConditionExcludedCount: 0,
    pressureConditionExclusionBreakdown: emptyPressureConditionExclusionBreakdown(),
    directionalSanityCheck: { positivePct: 0, flatPct: 0, negativePct: 0, measuredCount: 0, unmeasurableCount: 0, breakdown: [] },
    transcriptCapHit,
  };
}

export async function preparePressureSensitivityState(params: {
  domainId: string | null;
  signature: string;
  definitionId?: string | null;
}): Promise<PressureSensitivityPreparedState & { companionStatus?: CompanionExpansionStatus }> {
  let expandedDefinitionIds: string[] | null = null;
  let companionStatus: CompanionExpansionStatus | undefined;
  if (params.definitionId != null) {
    const expanded = await expandToCompanionDefinition(params.definitionId);
    expandedDefinitionIds = expanded.ids;
    companionStatus = expanded.status;
  }

  const runs = (await db.run.findMany({
    where: {
      status: 'COMPLETED',
      deletedAt: null,
      tags: { none: { tag: { name: 'Aggregate' } } },
      ...(expandedDefinitionIds != null
        ? { definitionId: { in: expandedDefinitionIds } }
        : params.domainId != null
          ? { definition: { domainId: params.domainId } }
          : {}),
    },
    include: { definition: { select: { id: true, name: true, domainId: true } } },
    orderBy: { id: 'asc' },
  })) as RunRow[];

  const eligibleRuns = runs.filter((r) => runMatchesSignature(r.config, params.signature));

  const distinctDefIds = new Set<string>();
  for (const r of eligibleRuns) {
    distinctDefIds.add(r.definition?.id ?? r.definitionId);
  }

  const defRows = distinctDefIds.size === 0 ? [] : await db.definition.findMany({
    where: { id: { in: [...distinctDefIds] } },
    select: { id: true, updatedAt: true },
  });

  const inputHash = computeAggregateFingerprint({
    codeVersion: PRESSURE_SENSITIVITY_SNAPSHOT_CODE_VERSION,
    domainId: params.domainId ?? '__all__',
    signature: params.signature,
    runIds: eligibleRuns.map((r) => r.id).sort(),
    definitions: defRows
      .map((d) => ({ id: d.id, updatedAt: d.updatedAt.toISOString() }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }).slice(0, 16);

  return companionStatus == null
    ? { domainId: params.domainId, signature: params.signature, eligibleRuns, inputHash }
    : { domainId: params.domainId, signature: params.signature, eligibleRuns, inputHash, companionStatus };
}

export async function expandToCompanionDefinition(definitionId: string): Promise<CompanionExpansionResult> {
  const definition = await db.definition.findUnique({
    where: { id: definitionId },
    select: { id: true, domainId: true, content: true, deletedAt: true },
  });

  if (definition === null || definition.deletedAt !== null) {
    throw new NotFoundError('Definition', definitionId);
  }

  const content = definition.content as Record<string, unknown> | null;
  const methodology =
    content !== null && typeof content === 'object' && !Array.isArray(content)
      ? (content.methodology as Record<string, unknown> | null)
      : null;
  const pairKey =
    methodology !== null && typeof methodology.pair_key === 'string' && methodology.pair_key.length > 0
      ? methodology.pair_key
      : null;

  if (pairKey === null) {
    return { ids: [definitionId], status: 'not_paired' };
  }

  const candidates = await db.definition.findMany({
    where: {
      id: { not: definitionId },
      domainId: definition.domainId,
      deletedAt: null,
      content: {
        path: ['methodology', 'pair_key'],
        equals: pairKey,
      },
    },
    select: { id: true, content: true },
  });

  if (candidates.length > 1) {
    throw new AppError(
      'Multiple companion vignettes share this pair_key',
      PAIR_KEY_COMPANION_COLLISION,
      500,
      { pairKey, definitionId, candidateCount: candidates.length },
    );
  }

  if (candidates.length === 0) {
    return { ids: [definitionId], status: 'companion_missing' };
  }

  const companion = findPairedCompanion(
    { id: definition.id, content: definition.content },
    candidates,
  );

  if (companion === null || companion === undefined) {
    throw new AppError(
      'Paired vignette companion mirroring failed',
      PAIR_KEY_COMPANION_MIRROR_FAILURE,
      500,
      { pairKey, definitionId },
    );
  }

  return { ids: [definitionId, companion.id], status: 'paired' };
}

export async function writeSnapshot(params: {
  domainId: string | null;
  signature: string;
  inputHash: string;
  output: PressureSensitivityResultShape;
}) {
  const assumptionKey = `${PRESSURE_SENSITIVITY_ASSUMPTION_PREFIX}::${params.domainId ?? '__all__'}`;

  await db.assumptionAnalysisSnapshot.updateMany({
    where: {
      assumptionKey,
      analysisType: PRESSURE_SENSITIVITY_SNAPSHOT_TYPE,
      status: 'CURRENT',
      deletedAt: null,
      OR: [{ configSignature: params.signature }, { inputHash: params.inputHash }],
    },
    data: { status: 'SUPERSEDED' },
  });

  return db.assumptionAnalysisSnapshot.create({
    data: {
      assumptionKey,
      analysisType: PRESSURE_SENSITIVITY_SNAPSHOT_TYPE,
      inputHash: params.inputHash,
      codeVersion: PRESSURE_SENSITIVITY_SNAPSHOT_CODE_VERSION,
      configSignature: params.signature,
      config: { domainId: params.domainId, signature: params.signature },
      output: params.output as object,
      status: 'CURRENT',
    },
  });
}
