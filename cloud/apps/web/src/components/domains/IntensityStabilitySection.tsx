import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
import { Button } from '../ui/Button';
import type { IntensityStabilityAnalysis, ModelIntensityStability, ValueStabilityResult } from '../../api/operations/domainAnalysis';

type Props = {
  intensityStability: IntensityStabilityAnalysis | undefined;
};

const SENSITIVITY_CHIP: Record<ModelIntensityStability['sensitivityLabel'], { label: string; className: string }> = {
  highly_stable:        { label: 'Highly stable',          className: 'bg-green-100 text-green-800' },
  moderately_sensitive: { label: 'Moderately sensitive',   className: 'bg-amber-100 text-amber-800' },
  highly_sensitive:     { label: 'Highly sensitive',        className: 'bg-red-100 text-red-800' },
  insufficient_data:    { label: 'Insufficient data',       className: 'bg-gray-100 text-gray-500' },
};

const DIRECTION_CHIP: Record<ValueStabilityResult['direction'], { label: string; className: string }> = {
  strengthens:       { label: 'Strengthens',       className: 'text-green-600' },
  weakens:           { label: 'Weakens',            className: 'text-red-600' },
  stable:            { label: 'Stable',             className: 'text-gray-500' },
  insufficient_data: { label: '—',                  className: 'text-gray-400' },
};

function valueLabel(key: string): string {
  return VALUE_LABELS[key as ValueKey] ?? key.replace(/_/g, ' ');
}

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-gray-400">—</span>;
  const sign = delta > 0 ? '+' : '';
  const color = Math.abs(delta) >= 3 ? 'text-amber-700 font-semibold' : delta !== 0 ? 'text-gray-700' : 'text-gray-400';
  return <span className={color}>{sign}{delta}</span>;
}

function ModelDetail({ model }: { model: ModelIntensityStability }) {
  const sortedValues = [...model.valueStability].sort((a, b) => {
    // Unstable first, then by abs rank delta descending
    if (a.isUnstable !== b.isUnstable) return a.isUnstable ? -1 : 1;
    const aDelta = Math.abs(a.rankDelta ?? 0);
    const bDelta = Math.abs(b.rankDelta ?? 0);
    return bDelta - aDelta;
  });

  return (
    <div className="mt-3">
      {model.dataWarning != null && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          <AlertTriangle size={12} className="shrink-0" />
          {model.dataWarning}
        </div>
      )}
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="pb-1 font-medium w-36">Value</th>
            <th className="pb-1 font-medium text-center w-16">Low rank</th>
            <th className="pb-1 font-medium text-center w-16">High rank</th>
            <th className="pb-1 font-medium text-center w-16">Delta</th>
            <th className="pb-1 font-medium text-center w-20">Direction</th>
          </tr>
        </thead>
        <tbody>
          {sortedValues.map((vs) => (
            <tr
              key={vs.valueKey}
              className={vs.isUnstable ? 'bg-amber-50' : ''}
            >
              <td className="py-1 pr-2">
                <span className="flex items-center gap-1">
                  {vs.isUnstable && (
                    <AlertTriangle size={10} className="text-amber-500 shrink-0" />
                  )}
                  <span className={vs.isUnstable ? 'text-amber-800 font-medium' : 'text-gray-700'}>
                    {valueLabel(vs.valueKey)}
                  </span>
                </span>
              </td>
              <td className="py-1 text-center text-gray-600">
                {vs.lowRank ?? <span className="text-gray-400">—</span>}
              </td>
              <td className="py-1 text-center text-gray-600">
                {vs.highRank ?? <span className="text-gray-400">—</span>}
              </td>
              <td className="py-1 text-center">
                <DeltaCell delta={vs.rankDelta} />
              </td>
              <td className="py-1 text-center">
                <span className={DIRECTION_CHIP[vs.direction].className}>
                  {DIRECTION_CHIP[vs.direction].label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModelRow({ model }: { model: ModelIntensityStability }) {
  const [expanded, setExpanded] = useState(false);
  const chip = SENSITIVITY_CHIP[model.sensitivityLabel];
  const unstableCount = model.valueStability.filter((v) => v.isUnstable).length;

  if (model.valuesWithSufficientData === 0) {
    return (
      <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
        <span className="text-sm text-gray-700 w-48 shrink-0">{model.label}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${chip.className}`}>
          {chip.label}
        </span>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100 last:border-0">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded((e) => !e)}
        className="w-full justify-start gap-3 py-2.5 text-left hover:bg-gray-50 rounded font-normal"
      >
        <span className="text-gray-400 shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="text-sm text-gray-700 w-44 shrink-0">{model.label}</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${chip.className}`}>
          {chip.label}
        </span>
        {unstableCount > 0 && (
          <span className="text-xs text-amber-700 ml-1">
            {unstableCount} unstable {unstableCount === 1 ? 'value' : 'values'}
          </span>
        )}
      </Button>
      {expanded && (
        <div className="pb-3 px-5">
          <ModelDetail model={model} />
        </div>
      )}
    </div>
  );
}

const SKIP_MESSAGES: Record<string, string> = {
  insufficient_dimension_coverage: 'Intensity analysis unavailable — vignettes in this domain do not have dimension scores.',
  no_intensity_variation:          'Intensity analysis unavailable — all scenarios have similar intensity levels.',
  all_models_insufficient:         'Intensity analysis unavailable — insufficient data across all models.',
};

export function IntensityStabilitySection({ intensityStability }: Props) {
  if (intensityStability == null) return null;

  const hasPartialWarning = !intensityStability.skipped &&
    intensityStability.models.some((m) => m.dataWarning != null);

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-gray-800 mb-0.5">
        4. Value Ranking Stability Across Intensity Levels
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Do preferences hold under pressure? Compares value rankings in low-stakes vs. high-stakes scenarios.
      </p>

      {intensityStability.skipped ? (
        <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          {SKIP_MESSAGES[intensityStability.skipReason ?? ''] ?? 'Intensity analysis unavailable.'}
        </div>
      ) : (
        <>
          {/* Domain-level callout */}
          {intensityStability.mostUnstableValues.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <AlertTriangle size={14} className="text-amber-600 shrink-0" />
              <span className="text-amber-800 font-medium">
                {intensityStability.mostUnstableValues.length === 1
                  ? '1 value is unstable in 2+ models:'
                  : `${intensityStability.mostUnstableValues.length} values are unstable in 2+ models:`}
              </span>
              {intensityStability.mostUnstableValues.map((vk) => (
                <span
                  key={vk}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300"
                >
                  {valueLabel(vk)}
                </span>
              ))}
            </div>
          ) : (
            <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              All rankings are stable across intensity levels.
            </div>
          )}

          {hasPartialWarning && (
            <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Some models lack sufficient coverage for intensity analysis.
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg px-4 py-2">
            {intensityStability.models.map((model) => (
              <ModelRow key={model.model} model={model} />
            ))}
          </div>

          <p className="mt-2 text-xs text-gray-400">
            Low intensity: average pair score 1.0–2.4. High intensity: 3.5–5.0. Delta = high rank − low rank. Positive delta = dropped in rank under pressure.
          </p>
        </>
      )}
    </section>
  );
}
