import { useMemo, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { VALUES, type ModelEntry } from '../../data/domainAnalysisData';
import { Button } from '../ui/Button';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import type { ClusterAnalysis } from '../../api/operations/domainAnalysis';

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

const CLUSTER_COLORS = [
  { hex: '#3b82f6' },
  { hex: '#f59e0b' },
  { hex: '#10b981' },
  { hex: '#f43f5e' },
] as const;

type SimilaritySectionProps = {
  models: ModelEntry[];
  clusterAnalysis?: ClusterAnalysis;
};

export function SimilaritySection({ models, clusterAnalysis }: SimilaritySectionProps) {
  const matrixRef = useRef<HTMLDivElement>(null);
  const [showMatrixHelp, setShowMatrixHelp] = useState(false);

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

      <div ref={matrixRef} className="rounded border border-gray-100 bg-white p-2">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-medium text-gray-800">Pairwise Similarity Matrix</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMatrixHelp((v) => !v)}
              className="h-8 w-8 text-gray-500 hover:text-gray-700"
              aria-label={showMatrixHelp ? 'Hide explanation' : 'Show explanation'}
            >
              {showMatrixHelp ? <X className="h-8 w-8" /> : <HelpCircle className="h-8 w-8" />}
            </Button>
            {showMatrixHelp && (
              <div className="mt-2 basis-full rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-xs text-gray-700">
                Each cell shows how similar two models&apos; value profiles are — how much they agree on
                which values matter most. 1.0 = identical priorities, 0 = unrelated.
                Green = think alike, yellow = partial overlap, red = consistently prioritize different things.
                The diagonal is always 1.0 (a model compared to itself).
              </div>
            )}
          </div>
          <CopyVisualButton targetRef={matrixRef} label="similarity matrix table" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th scope="col" className="px-2 py-2 text-left font-medium">Model</th>
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
                    <th scope="row" className="px-2 py-2 text-left font-medium text-gray-900">{row.label}</th>
                    {models.map((col) => {
                      const similarity = row.model === col.model ? 1 : (matrix.similarities.get(row.model)?.get(col.model) ?? 0);
                      return (
                        <td key={col.model} className="px-2 py-2 text-right text-gray-800" style={{ background: getSimilarityColor(similarity) }}>
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
        <div className="mt-3 flex items-center gap-2">
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
      </div>
    </section>
  );
}
