const CONDITION_LEVEL_ORDER = ['negligible', 'minimal', 'moderate', 'substantial', 'full'] as const;

const CONDITION_LEVEL_RANK = new Map<string, number>(
  CONDITION_LEVEL_ORDER.map((level, index) => [level, index]),
);

function normalizeConditionLevel(level: string): string {
  return level.trim().toLowerCase();
}

export function compareConditionLevels(left: string, right: string): number {
  const leftRank = CONDITION_LEVEL_RANK.get(normalizeConditionLevel(left));
  const rightRank = CONDITION_LEVEL_RANK.get(normalizeConditionLevel(right));

  const leftSortRank = leftRank ?? Number.MAX_SAFE_INTEGER;
  const rightSortRank = rightRank ?? Number.MAX_SAFE_INTEGER;
  if (leftSortRank !== rightSortRank) {
    return leftSortRank - rightSortRank;
  }

  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

export type ConditionRowLike = {
  attributeALevel: string;
  attributeBLevel: string;
  orientationBucket?: string;
};

export function compareConditionRows(left: ConditionRowLike, right: ConditionRowLike): number {
  const byAttributeA = compareConditionLevels(left.attributeALevel, right.attributeALevel);
  if (byAttributeA !== 0) {
    return byAttributeA;
  }

  const byAttributeB = compareConditionLevels(left.attributeBLevel, right.attributeBLevel);
  if (byAttributeB !== 0) {
    return byAttributeB;
  }

  const leftOrientationBucket = left.orientationBucket ?? '';
  const rightOrientationBucket = right.orientationBucket ?? '';
  return leftOrientationBucket.localeCompare(rightOrientationBucket, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}
