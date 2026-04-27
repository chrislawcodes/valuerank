import { VALUE_LABELS } from '../components/domains/domainAnalysisData';

export type CoverageGapDirectionalCoverage = {
  direction: string;
  completeBatches: number;
  filledSlots: number;
  definitionIds: string[];
};

export type CoverageGapCell = {
  valueA: string;
  valueB: string;
  definitionId: string | null;
  directionalCoverage: CoverageGapDirectionalCoverage[];
};

export function formatPairLabel(valueA: string, valueB: string): string {
  const labelA = VALUE_LABELS[valueA as keyof typeof VALUE_LABELS] ?? valueA;
  const labelB = VALUE_LABELS[valueB as keyof typeof VALUE_LABELS] ?? valueB;
  return `${labelA} vs ${labelB}`;
}

export function computeLaggingDirection(
  cell: CoverageGapCell,
): { direction: string; definitionId: string } | null {
  const coverageByDirection = new Map(
    cell.directionalCoverage.map((coverage) => [coverage.direction, coverage] as const),
  );

  const candidateDirections = [cell.valueA, cell.valueB];

  const directionStats = candidateDirections.map((direction) => {
    const coverage = coverageByDirection.get(direction);
    return {
      direction,
      filledSlots: coverage?.filledSlots ?? 0,
      completeBatches: coverage?.completeBatches ?? 0,
      definitionIds: coverage?.definitionIds ?? [],
    };
  });

  if (directionStats.length === 0) {
    return null;
  }

  const allEqual = directionStats.every(
    (stat) =>
      stat.filledSlots === directionStats[0]!.filledSlots &&
      stat.completeBatches === directionStats[0]!.completeBatches,
  );
  if (allEqual) {
    const onlyStat = directionStats[0]!;
    if (onlyStat.filledSlots === 0 && onlyStat.completeBatches === 0) {
      return null;
    }
    return null;
  }

  const sortedStats = [...directionStats].sort((left, right) => {
    if (left.filledSlots !== right.filledSlots) {
      return left.filledSlots - right.filledSlots;
    }
    if (left.completeBatches !== right.completeBatches) {
      return left.completeBatches - right.completeBatches;
    }
    return left.direction.localeCompare(right.direction);
  });

  const lagging = sortedStats[0];
  if (lagging == null) {
    return null;
  }

  const definitionId = lagging.definitionIds[0] ?? cell.definitionId;
  if (definitionId == null) {
    return null;
  }

  return {
    direction: lagging.direction,
    definitionId,
  };
}
