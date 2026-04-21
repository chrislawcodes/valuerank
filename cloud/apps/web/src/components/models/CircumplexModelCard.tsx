import { CircumplexMatrix } from './CircumplexMatrix';
import { CircumplexMdsScatter } from './CircumplexMdsScatter';
import { CircumplexVerdictPanel } from './CircumplexVerdictPanel';
import type { CircumplexResult } from '../../api/operations/circumplex';
import type { ValueKey } from '../../data/domainAnalysisData';

type Props = {
  result: CircumplexResult;
};

function toExcludedSet(values: string[]): Set<ValueKey> {
  return new Set(values as ValueKey[]);
}

export function CircumplexModelCard({ result }: Props) {
  return (
    <section className="w-full rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{result.modelLabel}</h2>
          <p className="text-sm text-gray-600">{result.providerName} · Signature {result.signature}</p>
        </div>
        <div className="text-right text-sm text-gray-500">
          <div>ρ {result.spearmanRho == null ? '—' : result.spearmanRho.toFixed(2)}</div>
          <div>p {result.spearmanP == null ? '—' : result.spearmanP.toFixed(3)}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <CircumplexMatrix
          matrix={result.profileCorrelationMatrix}
          pairTrialCounts={result.pairTrialCounts}
          valueOrder={result.valueOrder as ValueKey[]}
          excludedValues={toExcludedSet(result.excludedValues)}
        />
        <div className="space-y-4">
        <CircumplexMdsScatter
          mds={result.mds2d}
          excludedValues={result.excludedValues as ValueKey[]}
          mdsWarning={result.mdsWarning ?? null}
          mdsStress={result.mdsStress ?? 0}
        />
        <CircumplexVerdictPanel
          rho={result.spearmanRho ?? null}
          p={result.spearmanP ?? null}
          verdictBand={result.verdictBand}
          excludedValues={result.excludedValues as ValueKey[]}
        />
        </div>
      </div>
    </section>
  );
}
