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

export function ConsistencyDrill({ model, domainId, signature }: Props) {
  const headline = regionLabel(model.repeatability.value, model.coherence.value);
  const firstPair = model.coherence.perPair[0] ?? null;
  const orderParams = firstPair != null
    ? new URLSearchParams({
        modelId: model.modelId,
        repeatPattern: 'noisy',
        companionRunId: firstPair.targetCompanionRunId ?? '',
        primaryConditionIds: firstPair.primaryConditionIds.join(','),
        companionConditionIds: firstPair.companionConditionIds.join(','),
      })
    : null;
  const transcriptsUrl = firstPair?.targetAnalysisRunId != null && orderParams != null
    && firstPair.targetCompanionRunId != null
    ? buildAnalysisTranscriptsPath(ANALYSIS_BASE_PATH, firstPair.targetAnalysisRunId, orderParams)
    : null;

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
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-gray-900">Coherence chips</div>
            {transcriptsUrl && (
              <Link to={transcriptsUrl} className="text-sm font-medium text-teal-700 hover:underline">
                View transcripts →
              </Link>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {model.coherence.perPair.map((pair) => (
              <div key={`${pair.domainId}:${pair.valueKey}`} className={`rounded-full border px-3 py-1 text-xs ${pair.coherent ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : pair.determinate ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-gray-100 text-gray-600'}`}>
                <span>{pair.valueKey}: ρ {pair.rho == null ? '—' : pair.rho.toFixed(2)}, p {pair.pValue == null ? '—' : pair.pValue.toFixed(3)} {pair.coherent ? '✓' : pair.determinate ? '✗' : 'indeterminate'}</span>
                {(pair.domainId || domainId) && (
                  <Link
                    to={conditionMatrixUrl({ domainId: pair.domainId || domainId, modelId: model.modelId, valueKey: pair.valueKey, signature })}
                    className="ml-2 font-medium text-teal-700 hover:underline"
                  >
                    View condition matrix →
                  </Link>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-gray-600">
            Order effect: {model.orderEffect.notApplicable ? 'n/a' : `${pct(model.orderEffect.samePct)} same, ${pct(model.orderEffect.flippedPct)} flipped, ${pct(model.orderEffect.noisyPct)} noisy`}
          </div>
        </div>
      </div>
    </section>
  );
}
