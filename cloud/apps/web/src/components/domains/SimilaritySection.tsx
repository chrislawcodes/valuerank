import { useMemo } from 'react';
import { DOMAIN_ANALYSIS_AVAILABLE_MODELS, VALUES } from '../../data/domainAnalysisData';

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

export function SimilaritySection() {
  const matrix = useMemo(() => {
    const vectors = new Map<string, number[]>();
    for (const model of DOMAIN_ANALYSIS_AVAILABLE_MODELS) {
      vectors.set(model.model, VALUES.map((value) => model.values[value]));
    }

    const similarities = new Map<string, Map<string, number>>();
    const pairs: PairMetric[] = [];

    for (const a of DOMAIN_ANALYSIS_AVAILABLE_MODELS) {
      const row = new Map<string, number>();
      for (const b of DOMAIN_ANALYSIS_AVAILABLE_MODELS) {
        const av = vectors.get(a.model) ?? [];
        const bv = vectors.get(b.model) ?? [];
        const similarity = cosineSimilarity(av, bv);
        row.set(b.model, similarity);
        if (a.model < b.model) {
          pairs.push({
            a: a.label,
            b: b.label,
            similarity,
            // Normalize cosine-distance-like score into [0, 1].
            distance: (1 - similarity) / 2,
          });
        }
      }
      similarities.set(a.model, row);
    }

    const mostSimilar = [...pairs].sort((left, right) => right.similarity - left.similarity).slice(0, 5);
    const mostDifferent = [...pairs].sort((left, right) => right.distance - left.distance).slice(0, 5);
    return { similarities, mostSimilar, mostDifferent };
  }, []);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <h2 className="text-base font-medium text-gray-900">3. Similarity and Differences</h2>
        <p className="text-sm text-gray-600">Pairwise similarity of model value profiles (cosine similarity).</p>
      </div>

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

      <div className="mb-4 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-gray-600">
              <th scope="col" className="px-2 py-2 text-left font-medium">
                Model
              </th>
              {DOMAIN_ANALYSIS_AVAILABLE_MODELS.map((model) => (
                <th key={model.model} scope="col" className="px-2 py-2 text-right font-medium">
                  {model.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOMAIN_ANALYSIS_AVAILABLE_MODELS.map((row) => (
              <tr key={row.model} className="border-b border-gray-100">
                <th scope="row" className="px-2 py-2 text-left font-medium text-gray-900">
                  {row.label}
                </th>
                {DOMAIN_ANALYSIS_AVAILABLE_MODELS.map((col) => {
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
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <h3 className="text-sm font-medium text-gray-900">Most Similar Pairs</h3>
          <ol className="mt-2 space-y-1 text-sm text-gray-700">
            {matrix.mostSimilar.map((pair, index) => (
              <li key={`${pair.a}-${pair.b}-sim`}>
                {index + 1}. {pair.a} + {pair.b} ({pair.similarity.toFixed(2)})
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <h3 className="text-sm font-medium text-gray-900">Most Different Pairs</h3>
          <ol className="mt-2 space-y-1 text-sm text-gray-700">
            {matrix.mostDifferent.map((pair, index) => (
              <li key={`${pair.a}-${pair.b}-diff`}>
                {index + 1}. {pair.a} + {pair.b} (distance {pair.distance.toFixed(2)})
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
