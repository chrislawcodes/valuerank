import { ValidationError } from '@valuerank/shared';
import {
  DOMAIN_ANALYSIS_VALUE_KEYS,
  type DomainAnalysisValueKey,
} from '../../graphql/queries/domain-analysis-values.js';
import { buildSafeLevelLookup, type DefinitionDimension } from '../../graphql/queries/scenarios-utils.js';
import { resolveTranscriptDecisionModel } from '../../graphql/queries/domain/decision-model.js';
import {
  assignOwnOpponent,
  assignOwnOpponentLevels,
  canonicalOwnOpponent,
  type AssignedOutcome,
} from '../pressure-sensitivity/value-pair.js';
import { isRecord } from '../../utils/isRecord.js';

export type CellKey = {
  definitionId: string;
  modelId: string;
  valueKey: DomainAnalysisValueKey;
  ownLevel: number;
  opponentLevel: number;
};

export type CellCounts = {
  wins: number;
  losses: number;
  neutrals: number;
};

export function encodeCellKey(key: CellKey): string {
  return `${key.definitionId}::${key.modelId}::${key.valueKey}::${key.ownLevel}::${key.opponentLevel}`;
}

function parseEncodedLevel(raw: string, fieldName: string): number {
  const level = Number(raw);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new ValidationError(`Invalid ${fieldName} in encoded cell key`);
  }
  return level;
}

export function decodeCellKey(encoded: string): CellKey {
  const parts = encoded.split('::');
  if (parts.length !== 5) {
    throw new ValidationError('Invalid encoded cell key');
  }
  const [definitionId, modelId, valueKey, ownLevelStr, opponentLevelStr] = parts;
  if (definitionId === undefined || modelId === undefined || valueKey === undefined || ownLevelStr === undefined || opponentLevelStr === undefined) {
    throw new ValidationError('Invalid encoded cell key');
  }
  if (!(DOMAIN_ANALYSIS_VALUE_KEYS as readonly string[]).includes(valueKey)) {
    throw new ValidationError('Invalid encoded cell key value token');
  }
  return {
    definitionId,
    modelId,
    valueKey: valueKey as DomainAnalysisValueKey,
    ownLevel: parseEncodedLevel(ownLevelStr, 'own level'),
    opponentLevel: parseEncodedLevel(opponentLevelStr, 'opponent level'),
  };
}

export type TranscriptForAccumulation = {
  id: string;
  runId: string;
  modelId: string;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  deletedAt: Date | null;
  scenario: {
    id: string;
    content: unknown;
    orientationFlipped: boolean;
    deletedAt: Date | null;
  } | null;
};

function isDomainAnalysisValueKey(value: string): value is DomainAnalysisValueKey {
  return (DOMAIN_ANALYSIS_VALUE_KEYS as readonly string[]).includes(value);
}

function normalizeToDomainAnalysisValueKey(rawToken: string): DomainAnalysisValueKey | null {
  const lower = rawToken.trim().toLowerCase();
  const match = (DOMAIN_ANALYSIS_VALUE_KEYS as readonly string[]).find((key) => key.toLowerCase() === lower);
  return match !== undefined ? (match as DomainAnalysisValueKey) : null;
}

function getStringToken(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function getSnapshotValuePair(definitionSnapshot: unknown): [DomainAnalysisValueKey, DomainAnalysisValueKey] | null {
  if (!isRecord(definitionSnapshot)) return null;
  const components = definitionSnapshot.components;
  if (!isRecord(components)) return null;
  const valueFirstComponent = components.value_first;
  const valueSecondComponent = components.value_second;
  const valueFirstRaw = getStringToken(isRecord(valueFirstComponent) ? valueFirstComponent.token : undefined);
  const valueSecondRaw = getStringToken(isRecord(valueSecondComponent) ? valueSecondComponent.token : undefined);
  if (valueFirstRaw === null || valueSecondRaw === null) return null;
  const valueFirstToken = normalizeToDomainAnalysisValueKey(valueFirstRaw);
  const valueSecondToken = normalizeToDomainAnalysisValueKey(valueSecondRaw);
  if (valueFirstToken === null || valueSecondToken === null) return null;
  const [ownToken, opponentToken] = canonicalOwnOpponent(valueFirstToken, valueSecondToken);
  if (!isDomainAnalysisValueKey(ownToken) || !isDomainAnalysisValueKey(opponentToken)) return null;
  return [ownToken, opponentToken];
}

function isDimensionMatch(dimension: unknown, token: string): dimension is DefinitionDimension {
  return isRecord(dimension) && typeof dimension.name === 'string' && dimension.name.trim().toLowerCase() === token.toLowerCase();
}

function getDefinitionDimensions(definitionSnapshot: unknown, firstValueToken: string, secondValueToken: string): {
  dimensions: DefinitionDimension[];
  ownDimension: DefinitionDimension | undefined;
  opponentDimension: DefinitionDimension | undefined;
} | null {
  if (!isRecord(definitionSnapshot)) return null;
  const dimensionsRaw = definitionSnapshot.dimensions;
  if (!Array.isArray(dimensionsRaw)) return null;
  const dimensions = dimensionsRaw.filter(isRecord) as DefinitionDimension[];
  const ownDimension = dimensions.find((dimension) => isDimensionMatch(dimension, firstValueToken));
  const opponentDimension = dimensions.find((dimension) => isDimensionMatch(dimension, secondValueToken));
  return { dimensions, ownDimension, opponentDimension };
}

function incrementCounts(target: CellCounts, outcome: AssignedOutcome): void {
  if (outcome === 'own_picked') {
    target.wins += 1;
    return;
  }
  if (outcome === 'opponent_picked') {
    target.losses += 1;
    return;
  }
  if (outcome === 'neutral') {
    target.neutrals += 1;
  }
}

function addCellCounts(cellMap: Map<string, CellCounts>, key: string, outcome: AssignedOutcome): void {
  if (outcome === 'unscored') return;
  const counts = cellMap.get(key) ?? { wins: 0, losses: 0, neutrals: 0 };
  incrementCounts(counts, outcome);
  cellMap.set(key, counts);
}

export function accumulateTranscriptCells(params: {
  transcripts: TranscriptForAccumulation[];
  filteredSourceRunDefinitionById: Map<string, string>;
}): Map<string, CellCounts> {
  const cellMap = new Map<string, CellCounts>();

  for (const transcript of params.transcripts) {
    try {
      if (transcript.deletedAt != null) continue;
      if (transcript.scenario == null || transcript.scenario.deletedAt != null) continue;

      const definitionId = params.filteredSourceRunDefinitionById.get(transcript.runId);
      if (definitionId === undefined) continue;

      const valuePair = getSnapshotValuePair(transcript.definitionSnapshot);
      if (valuePair == null) continue;
      const [firstValueToken, secondValueToken] = valuePair;
      if (!isDomainAnalysisValueKey(firstValueToken) || !isDomainAnalysisValueKey(secondValueToken)) continue;

      const dimensions = getDefinitionDimensions(transcript.definitionSnapshot, firstValueToken, secondValueToken);
      if (dimensions == null || dimensions.ownDimension == null || dimensions.opponentDimension == null) continue;

      const ownLookup = buildSafeLevelLookup(dimensions.ownDimension);
      const opponentLookup = buildSafeLevelLookup(dimensions.opponentDimension);
      if (ownLookup.exclusionReason != null || opponentLookup.exclusionReason != null) continue;

      const scenarioContent = transcript.scenario.content;
      if (!isRecord(scenarioContent)) continue;
      // Production scenarios use snake_case `dimension_values`; test/newer data uses camelCase `dimensionValues`.
      const dimensionValues = scenarioContent.dimensionValues ?? scenarioContent.dimension_values;
      if (!isRecord(dimensionValues)) continue;

      const levels = assignOwnOpponentLevels(
        dimensions.dimensions,
        dimensionValues,
        ownLookup.lookup,
        opponentLookup.lookup,
        firstValueToken,
        secondValueToken,
      );
      if (levels == null) continue;

      const resolved = resolveTranscriptDecisionModel({
        decisionMetadata: transcript.decisionMetadata,
        definitionSnapshot: transcript.definitionSnapshot,
        orientationFlipped: transcript.scenario.orientationFlipped,
        pairOverride: { valueA: firstValueToken, valueB: secondValueToken },
      });
      if (resolved.canonical.direction === 'unknown') continue;

      const outcome = assignOwnOpponent(firstValueToken, secondValueToken, resolved.canonical.direction);
      if (outcome === 'unscored') continue;

      const firstKey = encodeCellKey({
        definitionId,
        modelId: transcript.modelId,
        valueKey: firstValueToken,
        ownLevel: levels.ownLevel,
        opponentLevel: levels.opponentLevel,
      });
      const secondKey = encodeCellKey({
        definitionId,
        modelId: transcript.modelId,
        valueKey: secondValueToken,
        ownLevel: levels.opponentLevel,
        opponentLevel: levels.ownLevel,
      });

      addCellCounts(cellMap, firstKey, outcome);
      const mirroredOutcome: AssignedOutcome =
        outcome === 'own_picked' ? 'opponent_picked' : outcome === 'opponent_picked' ? 'own_picked' : outcome;
      addCellCounts(cellMap, secondKey, mirroredOutcome);
    } catch (error) {
      throw new ValidationError('Failed to accumulate transcript for domain analysis', {
        transcriptId: transcript.id,
        runId: transcript.runId,
        modelId: transcript.modelId,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return cellMap;
}
