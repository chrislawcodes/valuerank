import { useMemo, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { cosineSimilarity } from '@valuerank/shared';
import { VALUES, type ModelEntry } from '../../data/domainAnalysisData';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import type { ClusterAnalysis } from '../../api/operations/domainAnalysis';

type PairMetric = {
  a: string;
  b: string;
  similarity: number;
  distance: number;
};

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
      const raw = VALUES.map((value) => model.winRates?.[value] ?? 0);
      const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
      vectors.set(model.model, raw.map((v) => v - mean));
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
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-medium text-gray-900">Similarities and Differences</h2>
        <button
          type="button"
          onClick={() => setShowMatrixHelp((v) => !v)}
          className="text-gray-400 hover:text-gray-600"
          aria-label={showMatrixHelp ? 'Hide explanation' : 'Show explanation'}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>

      <div ref={matrixRef} className="rounded border border-gray-100 bg-white p-2">
        <div className="mb-3 flex items-center justify-between">
          <CopyVisualButton targetRef={matrixRef} label="similarity matrix table" />
        </div>
        {showMatrixHelp && (
          <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-gray-700">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-2">
                <p>Each number shows how similar two models&apos; value priorities are — not whether their win rates are close, but whether they prioritize the same values relative to their own average.</p>
                <p>For example, if Model A strongly favors Security and avoids Power, and Model B does the same, they score near 1.0 even if Model A wins more overall.</p>
                <p className="font-medium text-gray-800">How it is calculated (Pearson correlation):</p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>Each model&apos;s win rates are centered — subtract that model&apos;s average so the numbers balance around zero. This removes the effect of one model just being more decisive overall.</li>
                  <li>We measure how much the two centered profiles move together across all 10 values.</li>
                  <li>The result is divided by the size of each profile, so the score always falls between −1 and 1.</li>
                </ol>
                <p className="mt-1 text-gray-600"><span className="font-medium text-green-700">1.0</span> = identical relative priorities · <span className="font-medium text-yellow-600">0</span> = no relationship · <span className="font-medium text-red-700">−1</span> = opposite priorities</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMatrixHelp(false)}
                className="shrink-0 text-gray-400 hover:text-gray-600"
                aria-label="Close explanation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <caption className="sr-only">Pairwise similarity matrix</caption>
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
