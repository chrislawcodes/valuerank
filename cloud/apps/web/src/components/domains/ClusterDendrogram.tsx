/**
 * ClusterDendrogram — SVG hierarchical-clustering dendrogram.
 *
 * Leaves are arranged at y = maxHeight (bottom), internal nodes at their
 * merge height. Lines are L-shaped: horizontal at the merge height,
 * vertical down to each child.
 */
import type React from 'react';

const COLORS = [
  '#2563eb', // blue
  '#d97706', // amber
  '#059669', // emerald
  '#e11d48', // rose
  '#7c3aed', // violet
  '#0ea5e9', // sky
  '#ea580c', // orange
  '#65a30d', // lime
  '#d946ef', // fuchsia
  '#4f46e5', // indigo
  '#14b8a6', // teal
  '#ca8a04', // yellow
] as const;

const CLUSTER_COLOR_ORDER = Object.values(COLORS);

function getLeafColor(clusterIdByModelId: Record<string, string>, modelId: string, clusterIds: string[]): string {
  const clusterId = clusterIdByModelId[modelId];
  if (clusterId == null) return '#9ca3af';
  const index = clusterIds.indexOf(clusterId);
  return CLUSTER_COLOR_ORDER[index % CLUSTER_COLOR_ORDER.length] ?? '#9ca3af';
}

export type DendrogramMerge = {
  leftMemberIds: string[];
  rightMemberIds: string[];
  height: number;
};

type ClusterDendrogramProps = {
  merges: DendrogramMerge[];
  leafOrder: string[];
  modelLabels: Record<string, string>;
  clusterIdByModelId: Record<string, string>;
  cutLineHeight?: number;
};

// SVG layout constants
const MARGIN = { top: 20, right: 20, bottom: 80, left: 20 };
const SVG_HEIGHT = 420;
const LABEL_FONT_SIZE = 10;
const LEAF_CIRCLE_RADIUS = 3;

export function ClusterDendrogram({
  merges,
  leafOrder,
  modelLabels,
  clusterIdByModelId,
  cutLineHeight,
}: ClusterDendrogramProps) {
  const n = leafOrder.length;
  if (n === 0 || merges.length === 0) {
    return (
      <div className="text-xs text-gray-500 italic">No dendrogram data available.</div>
    );
  }

  // Unique cluster IDs in a stable order for color assignment
  const clusterIds = [...new Set(Object.values(clusterIdByModelId))].sort();

  // Layout dimensions
  const innerWidth = Math.max(n * 28, 400);
  const innerHeight = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;
  const svgWidth = innerWidth + MARGIN.left + MARGIN.right;
  const svgHeight = SVG_HEIGHT;

  // Compute max height for y-axis scaling
  const maxHeight = Math.max(...merges.map((m) => m.height), 0.01);

  // Map merge height to SVG y coordinate.
  // height=0 → y = innerHeight (bottom), height=maxHeight → y = 0 (top)
  function heightToY(h: number): number {
    return innerHeight - (h / maxHeight) * innerHeight;
  }

  // Leaf x positions (evenly spaced)
  const leafX = new Map<string, number>();
  for (let i = 0; i < leafOrder.length; i++) {
    const modelId = leafOrder[i]!;
    leafX.set(modelId, ((i + 0.5) / n) * innerWidth);
  }

  // Build a map from sorted member ID set → merge, for bottom-up traversal
  function memberKey(ids: string[]): string {
    return [...ids].sort().join('|');
  }

  const mergeByKey = new Map<string, DendrogramMerge>();
  for (const merge of merges) {
    const combined = [...merge.leftMemberIds, ...merge.rightMemberIds];
    mergeByKey.set(memberKey(combined), merge);
  }

  // Compute the center x of a subtree (average of its leaf positions)
  function subtreeCenterX(memberIds: string[]): number {
    let sum = 0;
    let count = 0;
    for (const id of memberIds) {
      const x = leafX.get(id);
      if (x != null) { sum += x; count++; }
    }
    return count > 0 ? sum / count : 0;
  }

  // Render all L-shaped connectors recursively
  const lines: React.ReactElement[] = [];

  function renderConnectors(memberIds: string[]): void {
    if (memberIds.length <= 1) return;
    const key = memberKey(memberIds);
    const merge = mergeByKey.get(key);
    if (merge == null) return;

    const parentY = heightToY(merge.height);
    const leftX = subtreeCenterX(merge.leftMemberIds);
    const rightX = subtreeCenterX(merge.rightMemberIds);

    // Left child connector
    const leftChildH = merge.leftMemberIds.length > 1
      ? mergeByKey.get(memberKey(merge.leftMemberIds))?.height ?? 0
      : 0;
    const leftChildY = heightToY(leftChildH);
    lines.push(
      <polyline
        key={`left-${key}`}
        points={`${leftX},${leftChildY} ${leftX},${parentY} ${rightX},${parentY}`}
        fill="none"
        stroke="#6b7280"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />,
    );

    // Right child connector (just the vertical part down from parentY)
    const rightChildH = merge.rightMemberIds.length > 1
      ? mergeByKey.get(memberKey(merge.rightMemberIds))?.height ?? 0
      : 0;
    const rightChildY = heightToY(rightChildH);
    lines.push(
      <line
        key={`right-${key}`}
        x1={rightX}
        y1={parentY}
        x2={rightX}
        y2={rightChildY}
        stroke="#6b7280"
        strokeWidth={1.5}
      />,
    );

    renderConnectors(merge.leftMemberIds);
    renderConnectors(merge.rightMemberIds);
  }

  // Start from the root merge (last merge = all models)
  const rootMerge = merges[merges.length - 1]!;
  const rootMemberIds = [...rootMerge.leftMemberIds, ...rootMerge.rightMemberIds];
  renderConnectors(rootMemberIds);

  return (
    <div className="overflow-x-auto">
      <svg
        width={svgWidth}
        height={svgHeight}
        role="img"
        aria-label="Cluster dendrogram showing model merge tree by kappa distance"
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Y-axis ticks */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
            const h = frac * maxHeight;
            const y = heightToY(h);
            return (
              <g key={frac}>
                <line x1={-6} y1={y} x2={-2} y2={y} stroke="#9ca3af" strokeWidth={1} />
                <text
                  x={-8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={9}
                  fill="#6b7280"
                >
                  {h.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Y-axis label */}
          <text
            x={-MARGIN.left + 2}
            y={innerHeight / 2}
            textAnchor="middle"
            fontSize={9}
            fill="#6b7280"
            transform={`rotate(-90, ${-MARGIN.left + 2}, ${innerHeight / 2})`}
          >
            kappa distance
          </text>

          {/* Dendrogram lines */}
          {lines}

          {/* Cut line */}
          {cutLineHeight != null && (
            <line
              x1={0}
              y1={heightToY(cutLineHeight)}
              x2={innerWidth}
              y2={heightToY(cutLineHeight)}
              stroke="#0d9488"
              strokeWidth={1.5}
              strokeDasharray="5,3"
            />
          )}

          {/* Leaf nodes and labels */}
          {leafOrder.map((modelId) => {
            const x = leafX.get(modelId) ?? 0;
            const y = innerHeight;
            const color = getLeafColor(clusterIdByModelId, modelId, clusterIds);
            const label = modelLabels[modelId] ?? modelId;
            return (
              <g key={modelId}>
                <circle cx={x} cy={y} r={LEAF_CIRCLE_RADIUS} fill={color} />
                <text
                  x={x}
                  y={y + LEAF_CIRCLE_RADIUS + 4}
                  textAnchor="end"
                  fontSize={LABEL_FONT_SIZE}
                  fill={color}
                  transform={`rotate(-55, ${x}, ${y + LEAF_CIRCLE_RADIUS + 4})`}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
