/**
 * ClusterOrderedKappaHeatmap — N×N kappa heatmap with rows and columns
 * ordered by leaf order from the dendrogram, with cluster boundary boxes
 * overlaid as outlined rectangles.
 *
 * Color scale: red (#dc2626) → white (#ffffff) at kappa=0 → green (#15803d)
 * This matches the scale used in ModelAgreementHeatmap.tsx.
 */

// ---------------------------------------------------------------------------
// Color helpers (mirrored from ModelAgreementHeatmap.tsx)
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return [red, green, blue];
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function interpolateHex(start: string, end: string, t: number): string {
  const [startR, startG, startB] = hexToRgb(start);
  const [endR, endG, endB] = hexToRgb(end);
  const red = Math.round(startR + (endR - startR) * t);
  const green = Math.round(startG + (endG - startG) * t);
  const blue = Math.round(startB + (endB - startB) * t);
  return rgbToHex(red, green, blue);
}

function getKappaColor(kappa: number): string {
  const clamped = clamp(kappa, -1, 1);
  if (clamped <= 0) {
    return interpolateHex('#dc2626', '#ffffff', clamped + 1);
  }
  return interpolateHex('#ffffff', '#15803d', clamped);
}

function getRelativeLuminance(hex: string): number {
  const [red8, green8, blue8] = hexToRgb(hex);
  const toLinear = (channel: number): number => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(red8) + 0.7152 * toLinear(green8) + 0.0722 * toLinear(blue8);
}

function getTextColor(backgroundHex: string): string {
  return getRelativeLuminance(backgroundHex) > 0.55 ? '#111827' : '#ffffff';
}

function formatKappa(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KappaPairInput = {
  modelAId: string;
  modelBId: string;
  kappa?: number | null;
};

type ClusterOrderedKappaHeatmapProps = {
  leafOrder: string[];
  modelLabels: Record<string, string>;
  kappaPairs: KappaPairInput[];
  clusterIdByModelId: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildKappaLookup(
  kappaPairs: KappaPairInput[],
): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const { modelAId, modelBId, kappa } of kappaPairs) {
    const keyAB = `${modelAId}::${modelBId}`;
    const keyBA = `${modelBId}::${modelAId}`;
    map.set(keyAB, kappa ?? null);
    map.set(keyBA, kappa ?? null);
  }
  return map;
}

type ClusterBlock = {
  start: number;
  end: number;  // exclusive
  clusterId: string;
};

function findClusterBlocks(leafOrder: string[], clusterIdByModelId: Record<string, string>): ClusterBlock[] {
  if (leafOrder.length === 0) return [];
  const blocks: ClusterBlock[] = [];
  let blockStart = 0;
  let currentClusterId = clusterIdByModelId[leafOrder[0]!] ?? '';

  for (let i = 1; i <= leafOrder.length; i++) {
    const clusterId = i < leafOrder.length ? (clusterIdByModelId[leafOrder[i]!] ?? '') : '';
    if (clusterId !== currentClusterId || i === leafOrder.length) {
      blocks.push({ start: blockStart, end: i, clusterId: currentClusterId });
      blockStart = i;
      currentClusterId = clusterId;
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Target cell size; shrinks for large N
const MAX_CELL = 36;
const MIN_CELL = 14;
const LABEL_AREA = 80; // px reserved for row/col labels

function getCellSize(n: number): number {
  if (n <= 20) return MAX_CELL;
  if (n >= 80) return MIN_CELL;
  return Math.round(MAX_CELL - ((n - 20) / 60) * (MAX_CELL - MIN_CELL));
}

export function ClusterOrderedKappaHeatmap({
  leafOrder,
  modelLabels,
  kappaPairs,
  clusterIdByModelId,
}: ClusterOrderedKappaHeatmapProps) {
  const n = leafOrder.length;

  if (n === 0) {
    return <div className="text-xs text-gray-500 italic">No kappa data available.</div>;
  }

  const kappaMap = buildKappaLookup(kappaPairs);
  const clusterBlocks = findClusterBlocks(leafOrder, clusterIdByModelId);
  const cellSize = getCellSize(n);
  const fontSize = Math.max(8, Math.min(11, cellSize - 4));

  const gridWidth = n * cellSize;
  const gridHeight = n * cellSize;
  const svgWidth = gridWidth + LABEL_AREA;
  const svgHeight = gridHeight + LABEL_AREA;

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-gray-500">
        <span>Rows and columns ordered by dendrogram leaf order. Boxes outline cluster boundaries.</span>
        <span>Color: red (negative) → white (0) → green (positive kappa)</span>
      </div>
      <svg
        width={svgWidth}
        height={svgHeight}
        role="img"
        aria-label="Cluster-ordered pairwise kappa heatmap"
      >
        {/* Column labels (rotated, at top) */}
        <g>
          {leafOrder.map((modelId, colIdx) => {
            const x = LABEL_AREA + colIdx * cellSize + cellSize / 2;
            const label = modelLabels[modelId] ?? modelId;
            return (
              <text
                key={`col-${modelId}`}
                x={x}
                y={LABEL_AREA - 4}
                textAnchor="start"
                fontSize={fontSize}
                fill="#374151"
                transform={`rotate(-55, ${x}, ${LABEL_AREA - 4})`}
              >
                {label}
              </text>
            );
          })}
        </g>

        {/* Row labels */}
        <g>
          {leafOrder.map((modelId, rowIdx) => {
            const y = LABEL_AREA + rowIdx * cellSize + cellSize / 2;
            const label = modelLabels[modelId] ?? modelId;
            return (
              <text
                key={`row-${modelId}`}
                x={LABEL_AREA - 4}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={fontSize}
                fill="#374151"
              >
                {label}
              </text>
            );
          })}
        </g>

        {/* Heat cells */}
        <g transform={`translate(${LABEL_AREA}, ${LABEL_AREA})`}>
          {leafOrder.map((rowModelId, rowIdx) =>
            leafOrder.map((colModelId, colIdx) => {
              const isSelf = rowModelId === colModelId;
              const x = colIdx * cellSize;
              const y = rowIdx * cellSize;

              if (isSelf) {
                return (
                  <rect
                    key={`${rowModelId}-${colModelId}`}
                    x={x}
                    y={y}
                    width={cellSize}
                    height={cellSize}
                    fill="#f3f4f6"
                    stroke="#e5e7eb"
                    strokeWidth={0.5}
                  />
                );
              }

              const kappa = kappaMap.get(`${rowModelId}::${colModelId}`) ?? null;
              if (kappa == null) {
                return (
                  <rect
                    key={`${rowModelId}-${colModelId}`}
                    x={x}
                    y={y}
                    width={cellSize}
                    height={cellSize}
                    fill="#e5e7eb"
                    stroke="#e5e7eb"
                    strokeWidth={0.5}
                  />
                );
              }

              const bg = getKappaColor(kappa);
              const textColor = getTextColor(bg);
              const label = formatKappa(kappa);

              return (
                <g key={`${rowModelId}-${colModelId}`}>
                  <rect
                    x={x}
                    y={y}
                    width={cellSize}
                    height={cellSize}
                    fill={bg}
                    stroke={bg}
                    strokeWidth={0.5}
                  />
                  {cellSize >= 20 && (
                    <text
                      x={x + cellSize / 2}
                      y={y + cellSize / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.max(7, fontSize - 2)}
                      fill={textColor}
                      fontWeight="600"
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            }),
          )}

          {/* Cluster boundary boxes */}
          {clusterBlocks.map(({ start, end, clusterId }) => {
            const x = start * cellSize;
            const y = start * cellSize;
            const size = (end - start) * cellSize;
            return (
              <rect
                key={`boundary-${clusterId}`}
                x={x + 1}
                y={y + 1}
                width={size - 2}
                height={size - 2}
                fill="none"
                stroke="#0d9488"
                strokeWidth={2}
                strokeLinejoin="round"
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
