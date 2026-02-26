import { useMemo, useRef, useState } from 'react';
import { VALUES, VALUE_LABELS, type ModelEntry, type ValueKey } from '../../data/domainAnalysisData';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import type { ClusterAnalysis, DomainCluster, ClusterPairFaultLines } from '../../api/operations/domainAnalysis';

type PairMetric = {
  a: string;
  b: string;
  similarity: number;
  distance: number;
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }
  if (aNorm === 0 || bNorm === 0) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function getSimilarityColor(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));
  if (clamped === 1) return 'rgba(255, 255, 255, 0.35)';
  const stops = [
    { at: -1, rgb: [153, 27, 27] },
    { at: -0.6, rgb: [239, 68, 68] },
    { at: -0.2, rgb: [254, 202, 202] },
    { at: 0, rgb: [250, 204, 21] },
    { at: 0.44, rgb: [134, 239, 172] },
    { at: 0.76, rgb: [22, 163, 74] },
    { at: 1, rgb: [21, 128, 61] },
  ] as const;

  const rightIndex = stops.findIndex((stop) => clamped <= stop.at);
  if (rightIndex <= 0) {
    const [r, g, b] = stops[0].rgb;
    return `rgba(${r}, ${g}, ${b}, 0.35)`;
  }

  const left = stops[rightIndex - 1]!;
  const right = stops[rightIndex]!;
  const localT = (clamped - left.at) / (right.at - left.at);
  const r = Math.round(left.rgb[0] + (right.rgb[0] - left.rgb[0]) * localT);
  const g = Math.round(left.rgb[1] + (right.rgb[1] - left.rgb[1]) * localT);
  const b = Math.round(left.rgb[2] + (right.rgb[2] - left.rgb[2]) * localT);
  return `rgba(${r}, ${g}, ${b}, 0.35)`;
}

// Up to 4 distinct cluster colors
const CLUSTER_COLORS = [
  { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-700', light: 'bg-blue-50', hex: '#3b82f6' },
  { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-700', light: 'bg-amber-50', hex: '#f59e0b' },
  { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50', hex: '#10b981' },
  { bg: 'bg-rose-500', border: 'border-rose-500', text: 'text-rose-700', light: 'bg-rose-50', hex: '#f43f5e' },
] as const;

function getClusterColor(index: number) {
  return CLUSTER_COLORS[index % CLUSTER_COLORS.length]!;
}

function getShortValueLabel(valueKey: string): string {
  return VALUE_LABELS[valueKey as ValueKey] ?? valueKey.replace(/_/g, ' ');
}

type ClusterMapProps = {
  clusters: DomainCluster[];
  clusterIndexById: Map<string, number>;
};

function ClusterMap({ clusters, clusterIndexById }: ClusterMapProps) {
  return (
    <div className="flex flex-wrap gap-4">
      {clusters.map((cluster) => {
        const idx = clusterIndexById.get(cluster.id) ?? 0;
        const color = getClusterColor(idx);
        return (
          <div key={cluster.id} className={`rounded-lg border ${color.border} ${color.light} p-3`}>
            <p className={`mb-2 text-xs font-semibold ${color.text}`}>{cluster.name}</p>
            <div className="flex flex-wrap gap-1">
              {cluster.members.map((member) => (
                <span
                  key={member.model}
                  title={member.isOutlier ? `Outlier (silhouette: ${member.silhouetteScore.toFixed(2)})` : undefined}
                  className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-white ${color.bg} ${
                    member.isOutlier ? 'outline outline-2 outline-offset-1 outline-dashed outline-gray-400' : ''
                  }`}
                >
                  {member.label}
                  {member.isOutlier && <span className="ml-1 opacity-80">⚠</span>}
                </span>
              ))}
            </div>
            {cluster.definingValues.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {cluster.definingValues.map((vk) => (
                  <span key={vk} className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] text-gray-600">
                    {getShortValueLabel(vk)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type FaultLineBarProps = {
  pair: ClusterPairFaultLines;
  clusterIndexById: Map<string, number>;
  clusters: DomainCluster[];
};

function FaultLinesPanel({ pair, clusterIndexById, clusters }: FaultLineBarProps) {
  const clusterA = clusters.find((c) => c.id === pair.clusterAId);
  const clusterB = clusters.find((c) => c.id === pair.clusterBId);
  const idxA = clusterIndexById.get(pair.clusterAId) ?? 0;
  const idxB = clusterIndexById.get(pair.clusterBId) ?? 0;
  const colorA = getClusterColor(idxA);
  const colorB = getClusterColor(idxB);

  if (pair.faultLines.length === 0) return null;

  // Find scale: max abs score across all fault line values
  const allScores = pair.faultLines.flatMap((fl) => [Math.abs(fl.clusterAScore), Math.abs(fl.clusterBScore)]);
  const maxScore = Math.max(...allScores, 0.01);

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span className={`inline-block h-3 w-3 rounded-sm ${colorA.bg}`} />
          {clusterA?.name ?? pair.clusterAId}
        </span>
        <span className="text-gray-400">vs</span>
        <span className="flex items-center gap-1">
          <span className={`inline-block h-3 w-3 rounded-sm ${colorB.bg}`} />
          {clusterB?.name ?? pair.clusterBId}
        </span>
        <span className="ml-auto text-gray-400">distance: {pair.distance.toFixed(3)}</span>
      </div>
      <div className="space-y-2">
        {pair.faultLines.map((fl) => {
          const barA = (Math.abs(fl.clusterAScore) / maxScore) * 100;
          const barB = (Math.abs(fl.clusterBScore) / maxScore) * 100;
          return (
            <div key={fl.valueKey} className="rounded border border-gray-100 bg-gray-50 p-2">
              <p className="mb-1 text-xs font-medium text-gray-700">{getShortValueLabel(fl.valueKey)}</p>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`w-20 truncate text-right text-[10px] ${colorA.text}`}>{clusterA?.name ?? pair.clusterAId}</span>
                  <div className="flex flex-1 items-center gap-1">
                    <div className={`h-4 rounded-sm ${colorA.bg}`} style={{ width: `${barA}%` }} />
                    <span className="text-[10px] text-gray-500">{fl.clusterAScore.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-20 truncate text-right text-[10px] ${colorB.text}`}>{clusterB?.name ?? pair.clusterBId}</span>
                  <div className="flex flex-1 items-center gap-1">
                    <div className={`h-4 rounded-sm ${colorB.bg}`} style={{ width: `${barB}%` }} />
                    <span className="text-[10px] text-gray-500">{fl.clusterBScore.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ClusterSectionProps = {
  clusterAnalysis: ClusterAnalysis;
};

function ClusterSection({ clusterAnalysis }: ClusterSectionProps) {
  const { clusters, faultLinesByPair, defaultPair, skipped, skipReason } = clusterAnalysis;

  const clusterIndexById = useMemo(() => {
    const map = new Map<string, number>();
    clusters.forEach((c, i) => map.set(c.id, i));
    return map;
  }, [clusters]);

  const pairKeys = useMemo(() => Object.keys(faultLinesByPair), [faultLinesByPair]);

  const defaultPairKey = useMemo(() => {
    if (defaultPair == null || defaultPair.length < 2) return pairKeys[0] ?? null;
    return `${defaultPair[0]}:${defaultPair[1]}`;
  }, [defaultPair, pairKeys]);

  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null);
  const activePairKey = selectedPairKey ?? defaultPairKey;
  const activePair = activePairKey != null ? faultLinesByPair[activePairKey] : null;

  if (skipped) {
    return (
      <p className="text-sm text-gray-500 italic">
        {skipReason ?? 'Cluster analysis not available.'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-800">Model Clusters</h3>
        <ClusterMap
          clusters={clusters}
          clusterIndexById={clusterIndexById}
        />
      </div>

      {activePair != null && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-800">Fault Lines</h3>
            {pairKeys.length > 1 && (
              <select
                className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                value={activePairKey ?? ''}
                onChange={(e) => setSelectedPairKey(e.target.value)}
              >
                {pairKeys.map((key) => {
                  const p = faultLinesByPair[key];
                  if (p == null) return null;
                  const idxA = clusterIndexById.get(p.clusterAId) ?? 0;
                  const idxB = clusterIndexById.get(p.clusterBId) ?? 0;
                  const nameA = clusters[idxA]?.name ?? p.clusterAId;
                  const nameB = clusters[idxB]?.name ?? p.clusterBId;
                  return <option key={key} value={key}>{nameA} vs {nameB}</option>;
                })}
              </select>
            )}
          </div>
          <FaultLinesPanel
            pair={activePair}
            clusterIndexById={clusterIndexById}
            clusters={clusters}
          />
        </div>
      )}
    </div>
  );
}

type SimilaritySectionProps = {
  models: ModelEntry[];
  clusterAnalysis?: ClusterAnalysis;
};

export function SimilaritySection({ models, clusterAnalysis }: SimilaritySectionProps) {
  const matrixRef = useRef<HTMLDivElement>(null);
  const matrix = useMemo(() => {
    const vectors = new Map<string, number[]>();
    for (const model of models) {
      vectors.set(model.model, VALUES.map((value) => model.values[value]));
    }

    const similarities = new Map<string, Map<string, number>>();
    const pairs: PairMetric[] = [];

    for (const a of models) {
      const row = new Map<string, number>();
      for (const b of models) {
        const av = vectors.get(a.model) ?? [];
        const bv = vectors.get(b.model) ?? [];
        const similarity = cosineSimilarity(av, bv);
        row.set(b.model, similarity);
        if (a.model < b.model) {
          pairs.push({
            a: a.label,
            b: b.label,
            similarity,
            distance: (1 - similarity) / 2,
          });
        }
      }
      similarities.set(a.model, row);
    }

    return { similarities, pairs };
  }, [models]);

  // Build a model → cluster index map for matrix header coloring
  const modelClusterIndex = useMemo(() => {
    const map = new Map<string, number>();
    if (clusterAnalysis == null || clusterAnalysis.skipped) return map;
    clusterAnalysis.clusters.forEach((cluster, ci) => {
      for (const member of cluster.members) {
        map.set(member.model, ci);
      }
    });
    return map;
  }, [clusterAnalysis]);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <h2 className="text-base font-medium text-gray-900">3. Similarity and Differences</h2>
        <p className="text-sm text-gray-600">Pairwise similarity of model value profiles (cosine similarity).</p>
      </div>

      {clusterAnalysis != null && (
        <div className="mb-4 rounded border border-gray-100 bg-white p-3">
          <ClusterSection clusterAnalysis={clusterAnalysis} />
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        {[-1, -0.5, 0, 0.5, 1].map((tick) => (
          <div
            key={tick}
            className="flex h-6 w-14 items-center justify-center rounded text-[10px] font-medium text-gray-900"
            style={{ background: getSimilarityColor(tick) }}
          >
            {tick}
          </div>
        ))}
        <span className="ml-1 text-xs text-gray-600">Red = less similar, Yellow = mid, Green = more similar</span>
      </div>

      <div ref={matrixRef} className="rounded border border-gray-100 bg-white p-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-gray-600">Pairwise similarity matrix.</p>
          <CopyVisualButton targetRef={matrixRef} label="similarity matrix table" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-600">
              <th scope="col" className="px-2 py-2 text-left font-medium">
                Model
              </th>
              {models.map((model) => {
                const ci = modelClusterIndex.get(model.model);
                const colStyle = ci != null ? { backgroundColor: `${CLUSTER_COLORS[ci % CLUSTER_COLORS.length]!.hex}22` } : undefined;
                return (
                  <th key={model.model} scope="col" className="px-2 py-2 text-right font-medium" style={colStyle}>
                    {model.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {models.map((row) => {
              const rowCi = modelClusterIndex.get(row.model);
              const rowStyle = rowCi != null ? { backgroundColor: `${CLUSTER_COLORS[rowCi % CLUSTER_COLORS.length]!.hex}11` } : undefined;
              return (
                <tr key={row.model} className="border-b border-gray-100" style={rowStyle}>
                  <th scope="row" className="px-2 py-2 text-left font-medium text-gray-900">
                    {row.label}
                  </th>
                  {models.map((col) => {
                    const similarity = row.model === col.model ? 1 : (matrix.similarities.get(row.model)?.get(col.model) ?? 0);
                    return (
                      <td
                        key={col.model}
                        className="px-2 py-2 text-right text-gray-800"
                        style={{ background: getSimilarityColor(similarity) }}
                      >
                        {similarity.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
