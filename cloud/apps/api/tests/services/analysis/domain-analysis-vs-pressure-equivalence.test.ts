import { describe, expect, it } from 'vitest';
import type { DomainAnalysisValueKey } from '../../../src/graphql/queries/domain-analysis-values.js';
import { computePooledWinRate } from '../../../src/graphql/queries/models-analysis-math.js';
import { computePairwiseWinRate } from '../../../src/utils/pairwise-math.js';
import { computeCellWeightedDomainRates } from '../../../src/services/analysis/domain-analysis-cell-win-rates.js';
import { encodeCellKey, type CellCounts } from '../../../src/services/analysis/transcript-cell-accumulator.js';
import { aggregateValueWinRates } from '../../../src/services/analysis/value-win-rate-aggregation.js';

type DefinitionFixture = {
  id: string;
  domainId: string;
  valueA: DomainAnalysisValueKey;
  valueB: DomainAnalysisValueKey;
  valueFirst: DomainAnalysisValueKey;
};

type CanonicalCellFixture = {
  definitionId: string;
  modelId: string;
  ownLevel: number;
  opponentLevel: number;
  wins: number;
  losses: number;
  neutrals: number;
};

function buildDefinitionFixture(
  id: string,
  domainId: string,
  valueA: DomainAnalysisValueKey,
  valueB: DomainAnalysisValueKey,
  valueFirst: DomainAnalysisValueKey,
): DefinitionFixture {
  return { id, domainId, valueA, valueB, valueFirst };
}

function buildSeededCells(seed: number): Array<Omit<CanonicalCellFixture, 'definitionId' | 'modelId'>> {
  const winsA = (seed % 5) + 1;
  const lossesA = ((seed * 2) % 4) + 1;
  const winsB = ((seed * 3) % 5) + 1;
  const lossesB = ((seed * 5) % 4) + 1;

  return [
    {
      ownLevel: 5,
      opponentLevel: 1,
      wins: winsA,
      losses: lossesA,
      neutrals: 10 - winsA - lossesA,
    },
    {
      ownLevel: 2,
      opponentLevel: 4,
      wins: winsB,
      losses: lossesB,
      neutrals: 10 - winsB - lossesB,
    },
  ];
}

function addMirroredCellCounts(
  cellMap: Map<string, CellCounts>,
  definition: DefinitionFixture,
  cell: CanonicalCellFixture,
): void {
  cellMap.set(
    encodeCellKey({
      definitionId: cell.definitionId,
      modelId: cell.modelId,
      valueKey: definition.valueA,
      ownLevel: cell.ownLevel,
      opponentLevel: cell.opponentLevel,
    }),
    { wins: cell.wins, losses: cell.losses, neutrals: cell.neutrals },
  );
  cellMap.set(
    encodeCellKey({
      definitionId: cell.definitionId,
      modelId: cell.modelId,
      valueKey: definition.valueB,
      ownLevel: cell.opponentLevel,
      opponentLevel: cell.ownLevel,
    }),
    { wins: cell.losses, losses: cell.wins, neutrals: cell.neutrals },
  );
}

describe('domain analysis vs pressure value aggregation', () => {
  it('matches per-(model,value) pooled win rates even with uneven domain coverage', () => {
    const definitions: DefinitionFixture[] = [
      buildDefinitionFixture(
        'domain-a-p1-achievement-first',
        'domain-a',
        'Achievement',
        'Security_Personal',
        'Achievement',
      ),
      buildDefinitionFixture(
        'domain-a-p1-security-first',
        'domain-a',
        'Achievement',
        'Security_Personal',
        'Security_Personal',
      ),
      buildDefinitionFixture(
        'domain-a-p2-achievement-first',
        'domain-a',
        'Achievement',
        'Hedonism',
        'Achievement',
      ),
      buildDefinitionFixture(
        'domain-a-p2-hedonism-first',
        'domain-a',
        'Achievement',
        'Hedonism',
        'Hedonism',
      ),
      buildDefinitionFixture(
        'domain-a-p3-security-first',
        'domain-a',
        'Hedonism',
        'Security_Personal',
        'Security_Personal',
      ),
      buildDefinitionFixture(
        'domain-a-p4-achievement-first',
        'domain-a',
        'Achievement',
        'Stimulation',
        'Achievement',
      ),
      buildDefinitionFixture(
        'domain-b-p1-achievement-first',
        'domain-b',
        'Achievement',
        'Security_Personal',
        'Achievement',
      ),
      buildDefinitionFixture(
        'domain-b-p2-hedonism-first',
        'domain-b',
        'Achievement',
        'Hedonism',
        'Hedonism',
      ),
      buildDefinitionFixture(
        'domain-b-p3-hedonism-first',
        'domain-b',
        'Hedonism',
        'Security_Personal',
        'Hedonism',
      ),
      buildDefinitionFixture(
        'domain-b-p4-stimulation-first',
        'domain-b',
        'Achievement',
        'Stimulation',
        'Stimulation',
      ),
      buildDefinitionFixture(
        'domain-c-p1-security-first',
        'domain-c',
        'Achievement',
        'Security_Personal',
        'Security_Personal',
      ),
      buildDefinitionFixture(
        'domain-c-p2-achievement-first',
        'domain-c',
        'Achievement',
        'Hedonism',
        'Achievement',
      ),
      buildDefinitionFixture(
        'domain-c-p3-security-first',
        'domain-c',
        'Hedonism',
        'Security_Personal',
        'Security_Personal',
      ),
    ];

    const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
    const canonicalCells: CanonicalCellFixture[] = [];
    const modelIds = ['model-a', 'model-b'];

    definitions.forEach((definition, definitionIndex) => {
      modelIds.forEach((modelId, modelIndex) => {
        const seed = definitionIndex * 11 + modelIndex * 17 + 3;
        buildSeededCells(seed).forEach((cell) => {
          canonicalCells.push({
            definitionId: definition.id,
            modelId,
            ...cell,
          });
        });
      });
    });

    const domainIds = [...new Set(definitions.map((definition) => definition.domainId))];
    const snapshotContributions = new Map<
      string,
      Array<{ evidenceWeight: number; winRate: number }>
    >();

    for (const domainId of domainIds) {
      const domainDefinitions = definitions.filter((definition) => definition.domainId === domainId);
      const domainDefinitionMap = new Map(
        domainDefinitions.map((definition) => [
          definition.id,
          {
            valueA: definition.valueA,
            valueB: definition.valueB,
            valueFirst: definition.valueFirst,
          },
        ]),
      );
      const domainCellMap = new Map<string, CellCounts>();

      for (const cell of canonicalCells) {
        const definition = definitionById.get(cell.definitionId);
        if (definition == null || definition.domainId !== domainId) continue;
        addMirroredCellCounts(domainCellMap, definition, cell);
      }

      const result = computeCellWeightedDomainRates({
        cellMap: domainCellMap,
        filteredSourceRunDefinitionById: new Map(),
        definitionValuePairById: domainDefinitionMap,
      });

      for (const model of result.models) {
        for (const [valueKey, winRate] of Object.entries(model.valueWinRates)) {
          const contributionKey = `${model.model}||${valueKey}`;
          const contributions = snapshotContributions.get(contributionKey) ?? [];
          contributions.push({
            evidenceWeight: model.vignetteCount[valueKey] ?? 0,
            winRate,
          });
          snapshotContributions.set(contributionKey, contributions);
        }
      }
    }

    const pooledSnapshotRates = new Map(
      Array.from(snapshotContributions.entries()).map(([key, contributions]) => [
        key,
        computePooledWinRate(contributions),
      ]),
    );

    const groupedByModel = new Map<
      string,
      Map<
        string,
        {
          domainId: string;
          definitionId: string;
          valueKey: string;
          pairKey: string;
          directionKey: string;
          cellRates: number[];
        }
      >
    >();

    for (const cell of canonicalCells) {
      const definition = definitionById.get(cell.definitionId);
      if (definition == null) continue;

      const firstRate = computePairwiseWinRate(cell.wins, cell.losses, cell.neutrals);
      const secondRate = computePairwiseWinRate(cell.losses, cell.wins, cell.neutrals);
      const pairKey = `${definition.valueA}::${definition.valueB}`;
      const modelGroups = groupedByModel.get(cell.modelId) ?? new Map();
      groupedByModel.set(cell.modelId, modelGroups);

      if (firstRate != null) {
        const key = [
          definition.valueA,
          definition.domainId,
          definition.id,
          pairKey,
          definition.valueFirst,
        ].join('||');
        const existing = modelGroups.get(key) ?? {
          domainId: definition.domainId,
          definitionId: definition.id,
          valueKey: definition.valueA,
          pairKey,
          directionKey: definition.valueFirst,
          cellRates: [],
        };
        existing.cellRates.push(firstRate);
        modelGroups.set(key, existing);
      }

      if (secondRate != null) {
        const key = [
          definition.valueB,
          definition.domainId,
          definition.id,
          pairKey,
          definition.valueFirst,
        ].join('||');
        const existing = modelGroups.get(key) ?? {
          domainId: definition.domainId,
          definitionId: definition.id,
          valueKey: definition.valueB,
          pairKey,
          directionKey: definition.valueFirst,
          cellRates: [],
        };
        existing.cellRates.push(secondRate);
        modelGroups.set(key, existing);
      }
    }

    const aggregatedPressureRates = new Map<string, Map<string, number | null>>();
    for (const [modelId, groups] of groupedByModel.entries()) {
      const inputs = Array.from(groups.values()).map((group) => ({
        domainId: group.domainId,
        definitionId: group.definitionId,
        valueKey: group.valueKey,
        pairKey: group.pairKey,
        directionKey: group.directionKey,
        vignetteRate: group.cellRates.reduce((sum, rate) => sum + rate, 0) / group.cellRates.length,
      }));
      const aggregated = aggregateValueWinRates(inputs);
      aggregatedPressureRates.set(
        modelId,
        new Map(
          Array.from(aggregated.entries()).map(([valueKey, result]) => [
            valueKey,
            result.crossDomainRate == null ? null : result.crossDomainRate * 100,
          ]),
        ),
      );
    }

    const allModelValueKeys = new Set<string>([
      ...pooledSnapshotRates.keys(),
      ...Array.from(aggregatedPressureRates.entries()).flatMap(([modelId, values]) =>
        Array.from(values.keys()).map((valueKey) => `${modelId}||${valueKey}`),
      ),
    ]);

    for (const modelValueKey of allModelValueKeys) {
      const [modelId, valueKey] = modelValueKey.split('||');
      if (modelId == null || valueKey == null) {
        throw new Error(`Invalid model/value key: ${modelValueKey}`);
      }

      const snapshotRate = pooledSnapshotRates.get(modelValueKey) ?? null;
      const pressureRate = aggregatedPressureRates.get(modelId)?.get(valueKey) ?? null;

      expect(snapshotRate).not.toBeNull();
      expect(pressureRate).not.toBeNull();
      expect(pressureRate).toBeCloseTo(snapshotRate, 9);
    }
  });
});
