import { db } from '@valuerank/db';

type LevelPresetWords = {
  l1: string;
  l2: string;
  l3: string;
  l4: string;
  l5: string;
};

function hasMissingDimensionLevels(content: unknown): content is Record<string, unknown> & { dimensions: Array<Record<string, unknown>> } {
  if (content == null || typeof content !== 'object' || Array.isArray(content)) return false;

  const dimensions = (content as { dimensions?: unknown }).dimensions;
  if (!Array.isArray(dimensions) || dimensions.length === 0) return false;

  return dimensions.some((dimension) => {
    if (dimension == null || typeof dimension !== 'object' || Array.isArray(dimension)) return false;
    const levels = (dimension as { levels?: unknown }).levels;
    return !Array.isArray(levels) || levels.length === 0;
  });
}

export function applyLevelPresetToDefinitionContent<T>(content: T, levelPresetWords: LevelPresetWords | null | undefined): T {
  if (levelPresetWords == null || !hasMissingDimensionLevels(content)) {
    return content;
  }

  const presetLevels = [
    { score: 1, label: levelPresetWords.l1 },
    { score: 2, label: levelPresetWords.l2 },
    { score: 3, label: levelPresetWords.l3 },
    { score: 4, label: levelPresetWords.l4 },
    { score: 5, label: levelPresetWords.l5 },
  ];

  return {
    ...(content as Record<string, unknown>),
    dimensions: content.dimensions.map((dimension) => {
      const levels = (dimension as { levels?: unknown }).levels;
      if (Array.isArray(levels) && levels.length > 0) {
        return dimension;
      }

      return {
        ...dimension,
        levels: presetLevels,
      };
    }),
  } as T;
}

export async function hydrateDefinitionContentWithLevelPreset<T>(
  content: T,
  levelPresetVersionId: string | null | undefined,
): Promise<T> {
  if (levelPresetVersionId == null || !hasMissingDimensionLevels(content)) {
    return content;
  }

  const levelPresetWords = await db.levelPresetVersion.findUnique({
    where: { id: levelPresetVersionId },
    select: { l1: true, l2: true, l3: true, l4: true, l5: true },
  });

  return applyLevelPresetToDefinitionContent(content, levelPresetWords);
}
