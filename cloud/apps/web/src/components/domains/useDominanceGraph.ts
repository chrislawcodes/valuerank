import { useMemo } from 'react';
import type { ModelEntry, ValueKey } from '../../data/domainAnalysisData';

export const CLOSE_WINRATE_DELTA = 0.08;
export const CLOSE_EDGE_MEDIUM_WIDTH = 3.2;
export const CHART_WIDTH = 1280;
export const CHART_HEIGHT = 1120;
export const CHART_CENTER_X = CHART_WIDTH / 2;
export const CHART_CENTER_Y = CHART_HEIGHT / 2;
export const NODE_RING_RADIUS = 450;
export const QUADRANT_SECTOR_RADIUS = 520;
export const QUADRANT_RING_RADIUS = 536;
export const QUADRANT_LABEL_RADIUS = 640;
export const NODE_RADIUS = 68;
export const NODE_ANIMATION_BASE_DURATION_MS = 360;
export const NODE_ANIMATION_PER_NODE_SLOWDOWN_MS = 120;

// Domain analysis intentionally renders the 10 canonical Schwartz values only.
// The UI uses one representative value per mapped quadrant slot for readability.
export const DISPLAY_VALUES: ValueKey[] = [
  'Universalism_Nature',
  'Benevolence_Dependability',
  'Conformity_Interpersonal',
  'Tradition',
  'Security_Personal',
  'Power_Dominance',
  'Achievement',
  'Hedonism',
  'Stimulation',
  'Self_Direction_Action',
];

export const QUADRANT_ARCS = [
  {
    label: 'Self-Transcendence',
    startAngle: -Math.PI / 2,
    endAngle: 0,
    fill: 'rgba(245, 158, 11, 0.15)',
    ring: '#f59e0b',
  },
  {
    label: 'Conservation',
    startAngle: 0,
    endAngle: Math.PI / 2,
    fill: 'rgba(132, 204, 22, 0.16)',
    ring: '#84cc16',
  },
  {
    label: 'Self-Enhancement',
    startAngle: Math.PI / 2,
    endAngle: Math.PI,
    fill: 'rgba(249, 115, 22, 0.15)',
    ring: '#f97316',
  },
  {
    label: 'Openness to Change',
    startAngle: Math.PI,
    endAngle: Math.PI * 1.5,
    fill: 'rgba(244, 114, 182, 0.15)',
    ring: '#f472b6',
  },
] as const;

const SELF_ENHANCEMENT_VALUES: ReadonlyArray<ValueKey> = ['Power_Dominance', 'Achievement'];
const OPENNESS_NON_STRADDLE_VALUES: ReadonlyArray<ValueKey> = [
  'Stimulation',
  'Self_Direction_Action',
];

type DominanceEdge = {
  from: ValueKey;
  to: ValueKey;
  gap: number;
};

export type ContestedPair = {
  a: ValueKey;
  b: ValueKey;
  gap: number;
  winner: ValueKey;
};

export type NodePosition = {
  value: ValueKey;
  x: number;
  y: number;
};

type UseDominanceGraphParams = {
  focusedValue: ValueKey | null;
  models: ModelEntry[];
  selectedModel: ModelEntry | undefined;
};

function buildValueAngles(): Map<ValueKey, number> {
  const result = new Map<ValueKey, number>();

  const selfTranscendence = QUADRANT_ARCS[0];
  ['Universalism_Nature', 'Benevolence_Dependability'].forEach((value, index) => {
    const t = (index + 0.5) / 2;
    result.set(
      value as ValueKey,
      selfTranscendence.startAngle +
        t * (selfTranscendence.endAngle - selfTranscendence.startAngle),
    );
  });

  const conservation = QUADRANT_ARCS[1];
  ['Conformity_Interpersonal', 'Tradition', 'Security_Personal'].forEach((value, index) => {
    const t = (index + 0.5) / 3;
    result.set(
      value as ValueKey,
      conservation.startAngle + t * (conservation.endAngle - conservation.startAngle),
    );
  });

  const selfEnhancement = QUADRANT_ARCS[2];
  SELF_ENHANCEMENT_VALUES.forEach((value, index) => {
    const t = (index + 1) / (SELF_ENHANCEMENT_VALUES.length + 1);
    result.set(
      value,
      selfEnhancement.startAngle + t * (selfEnhancement.endAngle - selfEnhancement.startAngle),
    );
  });

  // Hedonism straddles Self-Enhancement and Openness to Change at the shared boundary.
  result.set('Hedonism', Math.PI);

  const openness = QUADRANT_ARCS[3];
  OPENNESS_NON_STRADDLE_VALUES.forEach((value, index) => {
    const t = (index + 1) / (OPENNESS_NON_STRADDLE_VALUES.length + 1);
    result.set(value, openness.startAngle + t * (openness.endAngle - openness.startAngle));
  });

  return result;
}

export function useDominanceGraph({
  focusedValue,
  models,
  selectedModel,
}: UseDominanceGraphParams) {
  const edges = useMemo(() => {
    if (!selectedModel) return [];

    const allEdges: DominanceEdge[] = [];
    for (let i = 0; i < DISPLAY_VALUES.length; i += 1) {
      for (let j = i + 1; j < DISPLAY_VALUES.length; j += 1) {
        const a = DISPLAY_VALUES[i];
        const b = DISPLAY_VALUES[j];
        if (!a || !b) continue;
        const aValue = selectedModel.values[a];
        const bValue = selectedModel.values[b];
        if (aValue === bValue) continue;
        if (aValue > bValue) allEdges.push({ from: a, to: b, gap: aValue - bValue });
        if (bValue > aValue) allEdges.push({ from: b, to: a, gap: bValue - aValue });
      }
    }

    return allEdges.sort((left, right) => right.gap - left.gap);
  }, [selectedModel]);

  const contestedPairs = useMemo(() => {
    if (!selectedModel) return [];

    const pairs: ContestedPair[] = [];
    for (let i = 0; i < DISPLAY_VALUES.length; i += 1) {
      for (let j = i + 1; j < DISPLAY_VALUES.length; j += 1) {
        const a = DISPLAY_VALUES[i];
        const b = DISPLAY_VALUES[j];
        if (!a || !b) continue;
        const aScore = selectedModel.values[a];
        const bScore = selectedModel.values[b];
        if (aScore === bScore) continue;
        if (aScore > bScore) {
          pairs.push({ a, b, gap: aScore - bScore, winner: a });
        } else {
          pairs.push({ a, b, gap: bScore - aScore, winner: b });
        }
      }
    }

    return pairs.sort((left, right) => left.gap - right.gap).slice(0, 6);
  }, [selectedModel]);

  const priorityValueRange = useMemo(() => {
    const allValues = models.flatMap((model) => DISPLAY_VALUES.map((value) => model.values[value]));
    if (allValues.length === 0) return { min: -1, max: 1 };
    return { min: Math.min(...allValues), max: Math.max(...allValues) };
  }, [models]);

  const valueAngleById = useMemo(() => buildValueAngles(), []);

  const nodePositions = useMemo<NodePosition[]>(() => {
    return DISPLAY_VALUES.map((value) => {
      const theta = valueAngleById.get(value) ?? -Math.PI / 2;
      return {
        value,
        x: CHART_CENTER_X + NODE_RING_RADIUS * Math.cos(theta),
        y: CHART_CENTER_Y + NODE_RING_RADIUS * Math.sin(theta),
      };
    });
  }, [valueAngleById]);

  const positionByValue = useMemo(
    () => new Map(nodePositions.map((node) => [node.value, node])),
    [nodePositions],
  );

  const valueIndexMap = useMemo(() => new Map(DISPLAY_VALUES.map((value, index) => [value, index])), []);

  const edgeClockwiseOrder = useMemo(() => {
    const focusedIndex = focusedValue != null ? (valueIndexMap.get(focusedValue) ?? 0) : 0;
    const displayValueCount = DISPLAY_VALUES.length;
    const indexed = edges.map((edge, index) => {
      const fromIndex = valueIndexMap.get(edge.from) ?? 0;
      const toIndex = valueIndexMap.get(edge.to) ?? 0;
      const otherIndex =
        fromIndex === focusedIndex
          ? toIndex
          : toIndex === focusedIndex
            ? fromIndex
            : Math.min(fromIndex, toIndex);
      const clockwiseDistance = (otherIndex - focusedIndex + displayValueCount) % displayValueCount;
      return { originalIndex: index, sortKey: clockwiseDistance };
    });
    indexed.sort((left, right) => left.sortKey - right.sortKey);

    const orderMap = new Map<number, number>();
    indexed.forEach((item, rank) => orderMap.set(item.originalIndex, rank));
    return orderMap;
  }, [edges, focusedValue, valueIndexMap]);

  return {
    contestedPairs,
    edgeClockwiseOrder,
    edges,
    nodePositions,
    positionByValue,
    priorityValueRange,
  };
}
