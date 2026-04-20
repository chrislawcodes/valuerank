import { Link } from 'react-router-dom';
import { ANALYSIS_BASE_PATH, buildAnalysisTranscriptsPath } from '../../utils/analysisRouting';
import type { ModelsConsistencyModel } from '../../api/operations/modelsConsistency';

type Props = {
  model: ModelsConsistencyModel;
  domainId: string | null;
  signature: string;
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function regionLabel(repeatability: number, coherence: number): string {
  if (repeatability >= 0.85 && coherence >= 0.8) return 'Reliable & follows pressure';
  if (repeatability < 0.85 && coherence >= 0.8) return 'Follows pressure but jittery';
  if (repeatability >= 0.85 && coherence < 0.8) return "Steady but doesn't follow pressure";
  return 'Neither steady nor responsive';
}

function conditionMatrixUrl(args: { domainId: string; modelId: string; valueKey: string; signature: string }): string {
  const params = new URLSearchParams({
    domainId: args.domainId,
    modelId: args.modelId,
    valueKey: args.valueKey,
    signature: args.signature,
    scoreMethod: 'LOG_ODDS',
  });
  return `/domains/analysis/value-detail?${params.toString()}`;
}

type PerPair = ModelsConsistencyModel['coherence']['perPair'][number];

const COHERENT_RHO_THRESHOLD = 0.8;

type RhoDistribution = {
  values: number[];
  determinateCount: number;
  totalCount: number;
  median: number | null;
  q1: number | null;
  q3: number | null;
  min: number | null;
  max: number | null;
};

function quantile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0] ?? null;
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower];
  const upperValue = sorted[upper];
  if (lowerValue == null || upperValue == null) return null;
  if (lower === upper) return lowerValue;
  const weight = position - lower;
  return lowerValue * (1 - weight) + upperValue * weight;
}

function summarizeRhoDistribution(perPair: PerPair[]): RhoDistribution {
  const values: number[] = [];
  for (const pair of perPair) {
    if (pair.determinate && pair.rho != null) {
      values.push(pair.rho);
    }
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    values,
    determinateCount: values.length,
    totalCount: perPair.length,
    median: quantile(sorted, 0.5),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
  };
}

function formatRho(value: number | null): string {
  return value == null ? '—' : value.toFixed(2);
}

function rhoToPercent(value: number): number {
  // ρ is in [-1, 1]; map to [0, 100]% horizontal position
  return ((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100;
}

function RhoDistributionPanel({ distribution }: { distribution: RhoDistribution }) {
  if (distribution.determinateCount === 0) {
    return (
      <div className="mt-3 rounded-md border border-gray-200 bg-white p-2 text-xs text-gray-600">
        <span className="font-medium">ρ distribution:</span> no determinate pairs yet.
      </div>
    );
  }

  const thresholdPct = rhoToPercent(COHERENT_RHO_THRESHOLD);

  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-white p-2 text-xs text-gray-700">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-gray-900">ρ distribution</span>
        <span className="text-gray-500">
          median {formatRho(distribution.median)} · IQR {formatRho(distribution.q1)}–{formatRho(distribution.q3)} · range {formatRho(distribution.min)}–{formatRho(distribution.max)} (N={distribution.determinateCount} / {distribution.totalCount})
        </span>
      </div>
      <div className="relative mt-2 h-3 w-full rounded bg-gray-100">
        {/* Coherent threshold marker */}
        <div
          className="absolute top-0 h-3 w-[2px] bg-emerald-500"
          style={{ left: `${thresholdPct}%` }}
          aria-hidden
        />
        {distribution.values.map((value, index) => (
          <div
            key={index}
            className={`absolute top-0 h-3 w-[4px] -translate-x-[2px] rounded-sm ${value >= COHERENT_RHO_THRESHOLD ? 'bg-emerald-500' : value >= 0 ? 'bg-amber-400/70' : 'bg-gray-400/70'}`}
            style={{ left: `${rhoToPercent(value)}%` }}
            aria-label={`rho ${formatRho(value)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>-1</span>
        <span>0</span>
        <span className="font-medium text-emerald-600">0.8 threshold</span>
        <span>1</span>
      </div>
    </div>
  );
}

function transcriptsUrlForPair(modelId: string, pair: PerPair): string | null {
  if (pair.targetAnalysisRunId == null || pair.targetCompanionRunId == null) {
    return null;
  }
  const params = new URLSearchParams({
    modelId,
    repeatPattern: 'noisy',
    companionRunId: pair.targetCompanionRunId,
    primaryConditionIds: pair.primaryConditionIds.join(','),
    companionConditionIds: pair.companionConditionIds.join(','),
  });
  return buildAnalysisTranscriptsPath(ANALYSIS_BASE_PATH, pair.targetAnalysisRunId, params);
}

export function ConsistencyDrill({ model, domainId, signature }: Props) {
  const headline = regionLabel(model.repeatability.value, model.coherence.value);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{model.label}</h2>
          <p className="text-sm text-gray-600">{model.providerName} - {headline}</p>
          <p className="mt-1 text-sm text-gray-600">
            This model is {headline.toLowerCase()}. That means its answers are {model.repeatability.value >= 0.85 ? 'fairly steady' : 'less steady'} and its response to pressure is {model.coherence.value >= 0.8 ? 'usually lawful' : 'often weak'}.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="text-sm font-medium text-gray-900">Repeatability by domain</div>
          <div className="mt-2 space-y-2 text-sm text-gray-700">
            {model.repeatability.perDomain.map((domain) => (
              <div key={domain.domainId} className="flex items-center justify-between gap-3">
                <span>{domain.domainName}</span>
                <span>{pct(domain.value)} ± {pct((domain.ciHigh - domain.ciLow) / 2)} ({domain.scenariosMeasured})</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 md:col-span-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm font-medium text-gray-900">Coherence chips</div>
            <div className="text-xs text-gray-500">
              {model.coherence.coherentPairs} / {model.coherence.determinatePairs} coherent · {model.coherence.indeterminatePairs} indeterminate
            </div>
          </div>
          <RhoDistributionPanel distribution={summarizeRhoDistribution(model.coherence.perPair)} />
          <div className="mt-3 flex flex-wrap gap-2">
            {model.coherence.perPair.map((pair) => {
              const pairTranscriptsUrl = transcriptsUrlForPair(model.modelId, pair);
              const resolvedDomainId = pair.domainId || domainId;
              return (
                <div key={`${pair.domainId}:${pair.valueKey}`} className={`rounded-full border px-3 py-1 text-xs ${pair.coherent ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : pair.determinate ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-gray-100 text-gray-600'}`}>
                  <span>{pair.valueKey}: ρ {pair.rho == null ? '—' : pair.rho.toFixed(2)}, p {pair.pValue == null ? '—' : pair.pValue.toFixed(3)} {pair.coherent ? '✓' : pair.determinate ? '✗' : 'indeterminate'}</span>
                  {resolvedDomainId != null && (
                    <Link
                      to={conditionMatrixUrl({ domainId: resolvedDomainId, modelId: model.modelId, valueKey: pair.valueKey, signature })}
                      className="ml-2 font-medium text-teal-700 hover:underline"
                    >
                      condition matrix →
                    </Link>
                  )}
                  {pairTranscriptsUrl != null && (
                    <Link
                      to={pairTranscriptsUrl}
                      className="ml-2 font-medium text-teal-700 hover:underline"
                    >
                      transcripts →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-xs text-gray-600">
            Order effect: {model.orderEffect.notApplicable ? 'n/a' : `${pct(model.orderEffect.samePct)} same, ${pct(model.orderEffect.flippedPct)} flipped, ${pct(model.orderEffect.noisyPct)} noisy`}
          </div>
        </div>
      </div>
    </section>
  );
}
