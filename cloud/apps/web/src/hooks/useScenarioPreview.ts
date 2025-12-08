import { useMemo } from 'react';
import type { DefinitionContent, Dimension, DimensionLevel } from '../api/operations/definitions';

export type PreviewScenario = {
  id: number;
  filledTemplate: string;
  dimensionValues: {
    name: string;
    level: DimensionLevel;
  }[];
};

export type UseScenarioPreviewResult = {
  scenarios: PreviewScenario[];
  totalCount: number;
  displayedCount: number;
  error: string | null;
};

// Generate cartesian product of all dimension levels
function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];
  if (arrays.some((arr) => arr.length === 0)) return [];

  return arrays.reduce<T[][]>(
    (acc, curr) =>
      acc.flatMap((prev) => curr.map((item) => [...prev, item])),
    [[]]
  );
}

// Fill template placeholders with dimension values (case-insensitive)
function fillTemplate(
  template: string,
  dimensions: Dimension[],
  levelIndices: number[]
): { filledTemplate: string; dimensionValues: { name: string; level: DimensionLevel }[] } {
  let filled = template;
  const dimensionValues: { name: string; level: DimensionLevel }[] = [];

  dimensions.forEach((dim, i) => {
    const levelIndex = levelIndices[i];
    if (levelIndex === undefined) return;
    const levels = dim.levels ?? [];
    const level = levels[levelIndex];
    if (!level) return;

    dimensionValues.push({ name: dim.name, level });

    // Replace placeholder with label or first option (case-insensitive)
    const replacement = level.options?.[0] ?? level.label;
    const placeholderRegex = new RegExp(`\\[${escapeRegex(dim.name)}\\]`, 'gi');

    filled = filled.replace(placeholderRegex, replacement);
  });

  return { filledTemplate: filled, dimensionValues };
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Validate definition content for preview
function validateContent(content: DefinitionContent | null): string | null {
  if (!content) {
    return 'No definition content provided';
  }

  if (!content.template || content.template.trim().length === 0) {
    return 'Template is empty';
  }

  if (!content.dimensions || content.dimensions.length === 0) {
    return 'No dimensions defined';
  }

  // Check for dimensions with no levels
  const emptyDimension = content.dimensions.find(
    (d) => !d.levels || d.levels.length === 0
  );
  if (emptyDimension) {
    return `Dimension "${emptyDimension.name}" has no levels`;
  }

  // Check for template placeholders that don't match dimensions (case-insensitive)
  const placeholderRegex = /\[([^\]]+)\]/g;
  const placeholders = new Set<string>();
  let match;
  while ((match = placeholderRegex.exec(content.template)) !== null) {
    const placeholderName = match[1];
    if (placeholderName) {
      placeholders.add(placeholderName);
    }
  }

  const dimensionNamesLower = new Set(content.dimensions.map((d) => d.name.toLowerCase()));

  for (const placeholder of placeholders) {
    if (!dimensionNamesLower.has(placeholder.toLowerCase())) {
      return `Template placeholder [${placeholder}] doesn't match any dimension`;
    }
  }

  return null;
}

export function useScenarioPreview(
  content: DefinitionContent | null,
  maxSamples: number = 10
): UseScenarioPreviewResult {
  return useMemo(() => {
    // Validate content
    const error = validateContent(content);
    if (error || !content) {
      return {
        scenarios: [],
        totalCount: 0,
        displayedCount: 0,
        error,
      };
    }

    // Calculate total combinations
    const totalCount = content.dimensions.reduce(
      (acc, dim) => acc * (dim.levels?.length ?? 0),
      1
    );

    // Generate level index combinations
    const levelIndexArrays = content.dimensions.map((dim) =>
      (dim.levels ?? []).map((_, i) => i)
    );

    // Generate all combinations (limited for performance)
    const allCombinations = cartesianProduct(levelIndexArrays);

    // Limit to maxSamples
    const sampledCombinations = allCombinations.slice(0, maxSamples);

    // Generate preview scenarios
    const scenarios: PreviewScenario[] = sampledCombinations.map(
      (levelIndices, index) => {
        const { filledTemplate, dimensionValues } = fillTemplate(
          content.template,
          content.dimensions,
          levelIndices
        );

        return {
          id: index + 1,
          filledTemplate,
          dimensionValues,
        };
      }
    );

    return {
      scenarios,
      totalCount,
      displayedCount: scenarios.length,
      error: null,
    };
  }, [content, maxSamples]);
}
