/**
 * ClusterDendrogram — SVG hierarchical-clustering dendrogram, oriented
 * horizontally so leaf labels read left-to-right without rotation.
 *
 * Leaves sit on the left side at x = 0 (in the inner coord system); the tree
 * extends rightward, and the root merge lands at the far right. The X-axis
 * encodes kappa distance; each leaf gets one row in the Y-axis.
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

// SVG layout constants — horizontal orientation
const MARGIN = { top: 16, right: 24, bottom: 36, left: 180 };
const SVG_WIDTH = 720;
const ROW_HEIGHT = 22;
const MIN_INNER_HEIGHT = 160;
const LABEL_FONT_SIZE = 11;
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

  // Layout dimensions — leaves stack vertically, distance goes horizontal
  const innerWidth = SVG_WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = Math.max(n * ROW_HEIGHT, MIN_INNER_HEIGHT);
  const svgWidth = SVG_WIDTH;
  const svgHeight = innerHeight + MARGIN.top + MARGIN.bottom;

  // Compute max height for x-axis scaling
  const maxHeight = Math.max(...merges.map((m) => m.height), 0.01);

  // Map kappa distance to SVG x coordinate.
  // height=0 → x = 0 (leaves on the left), height=maxHeight → x = innerWidth (root on the right).
  function heightToX(h: number): number {
    return (h / maxHeight) * innerWidth;
  }

  // Leaf y positions (evenly spaced top to bottom)
  const leafY = new Map<string, number>();
  for (let i = 0; i < leafOrder.length; i++) {
    const modelId = leafOrder[i]!;
    leafY.set(modelId, ((i + 0.5) / n) * innerHeight);
  }

  // Build a map from sorted member ID set → merge, for tree traversal
  function memberKey(ids: string[]): string {
    return [...ids].sort().join('|');
  }

  const mergeByKey = new Map<string, DendrogramMerge>();
  for (const merge of merges) {
    const combined = [...merge.leftMemberIds, ...merge.rightMemberIds];
    mergeByKey.set(memberKey(combined), merge);
  }

  // Compute the center y of a subtree (average of its leaf positions)
  function subtreeCenterY(memberIds: string[]): number {
    let sum = 0;
    let count = 0;
    for (const id of memberIds) {
      const y = leafY.get(id);
      if (y != null) { sum += y; count++; }
    }
    return count > 0 ? sum / count : 0;
  }

  // Render all L-shaped connectors recursively (now rotated 90° clockwise
  // relative to a vertical layout: horizontal segments are at constant Y,
  // vertical segments are at constant X = parent's height position).
  const lines: React.ReactElement[] = [];

  function renderConnectors(memberIds: string[]): void {
    if (memberIds.length <= 1) return;
    const key = memberKey(memberIds);
    const merge = mergeByKey.get(key);
    if (merge == null) return;

    const parentX = heightToX(merge.height);
    const topY = subtreeCenterY(merge.leftMemberIds);
    const bottomY = subtreeCenterY(merge.rightMemberIds);

    // Left child: horizontal from child x out to parent x at child y
    const leftChildH = merge.leftMemberIds.length > 1
      ? mergeByKey.get(memberKey(merge.leftMemberIds))?.height ?? 0
      : 0;
    const leftChildX = heightToX(leftChildH);
    lines.push(
      <polyline
        key={`top-${key}`}
        points={`${leftChildX},${topY} ${parentX},${topY} ${parentX},${bottomY}`}
        fill="none"
        stroke="#6b7280"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />,
    );

    // Right child: horizontal from child x out to parent x at child y
    const rightChildH = merge.rightMemberIds.length > 1
      ? mergeByKey.get(memberKey(merge.rightMemberIds))?.height ?? 0
      : 0;
    const rightChildX = heightToX(rightChildH);
    lines.push(
      <line
        key={`bottom-${key}`}
        x1={rightChildX}
        y1={bottomY}
        x2={parentX}
        y2={bottomY}
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
          {/* X-axis ticks (along the bottom of the inner area) */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
            const h = frac * maxHeight;
            const x = heightToX(h);
            return (
              <g key={frac}>
                <line x1={x} y1={innerHeight + 2} x2={x} y2={innerHeight + 6} stroke="#9ca3af" strokeWidth={1} />
                <text
                  x={x}
                  y={innerHeight + 18}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#6b7280"
                >
                  {h.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* X-axis label (centered below ticks) */}
          <text
            x={innerWidth / 2}
            y={innerHeight + 32}
            textAnchor="middle"
            fontSize={9}
            fill="#6b7280"
          >
            kappa distance
          </text>

          {/* Dendrogram lines */}
          {lines}

          {/* Cut line — vertical when oriented horizontally. Marks where the
              clustering algorithm split into the displayed clusters. */}
          {cutLineHeight != null && (
            <g>
              <line
                x1={heightToX(cutLineHeight)}
                y1={0}
                x2={heightToX(cutLineHeight)}
                y2={innerHeight}
                stroke="#0d9488"
                strokeWidth={1.5}
                strokeDasharray="5,3"
              />
              <text
                x={heightToX(cutLineHeight) + 4}
                y={-4}
                textAnchor="start"
                fontSize={9}
                fill="#0d9488"
                fontWeight={600}
              >
                cluster cut
              </text>
              <text
                x={heightToX(cutLineHeight) + 4}
                y={6}
                textAnchor="start"
                fontSize={9}
                fill="#0d9488"
              >
                {cutLineHeight.toFixed(2)}
              </text>
            </g>
          )}

          {/* Leaf nodes and labels (on the left side, label reads naturally) */}
          {leafOrder.map((modelId) => {
            const y = leafY.get(modelId) ?? 0;
            const x = 0;
            const color = getLeafColor(clusterIdByModelId, modelId, clusterIds);
            const label = modelLabels[modelId] ?? modelId;
            return (
              <g key={modelId}>
                <circle cx={x} cy={y} r={LEAF_CIRCLE_RADIUS} fill={color} />
                <text
                  x={x - LEAF_CIRCLE_RADIUS - 4}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={LABEL_FONT_SIZE}
                  fill={color}
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
