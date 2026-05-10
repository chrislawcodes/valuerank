/**
 * PooledVignetteMetricsCard
 *
 * Renders pooled per-model metrics for the current run's vignette, mixing this
 * vignette's runs with its mirrored sibling's runs at the same trial signature.
 *
 * Replaces the old PairedRunComparisonCard (deleted in Wave 5). The card
 * intentionally drops the "two directions" framing — the new server-side
 * pressureSensitivity query handles direction-balanced pooling automatically,
 * so the user just sees this vignette's correctly-pooled numbers.
 *
 * Methodology rule (load-bearing): direction-balanced averaging only. Each
 * direction's win rate is computed independently across that direction's
 * trials, and the two directions are then averaged with EQUAL weight. Never
 * sum trials across directions. The `pressureSensitivity` resolver enforces
 * this; the matching server-side test lives at
 * `cloud/apps/api/tests/services/pressure-sensitivity/direction-balanced-invariant.test.ts`.
 */

import { useMemo, useRef } from 'react';
import { useQuery } from 'urql';
import { formatTrialSignature } from '@valuerank/shared/trial-signature';
import {
  PRESSURE_SENSITIVITY_QUERY,
  type PressureSensitivityQueryResult,
  type PressureSensitivityQueryVariables,
} from '../../api/operations/pressureSensitivity';
import type { Run } from '../../api/operations/runs';
import { hasMirroredValueTokens, getPairedOrientationLabels } from '../../utils/methodology';
import { useRuns } from '../../hooks/useRuns';
import { CopyVisualButton } from '../ui/CopyVisualButton';

const PAIR_KEY_COMPANION_COLLISION = 'pair_key_companion_collision';

const PRESSURE_REASON_TOOLTIPS: Record<string, string> = {
  'directional-thin': 'Not enough trials with Value A stacked higher to compute pressure response.',
  'inverted-thin': 'Not enough trials with Value B stacked higher to compute pressure response.',
  'directional-and-inverted-thin': 'Both pressure conditions are too thin to compute pressure response.',
  'baseline-thin': 'Baseline (equal-pressure) trials are too thin to compute pressure response.',
};

const FALLBACK_PRESSURE_TOOLTIP = 'Pressure response could not be computed.';

type PooledVignetteMetricsCardProps = {
  currentRun: Run;
  isAggregate: boolean;
};

function deriveTrialSignature(run: Run): string {
  const config = run.config as
    | {
        definitionSnapshot?: { _meta?: { definitionVersion?: number | string }; version?: number | string };
        temperature?: number | null;
      }
    | null;
  const versionRaw = config?.definitionSnapshot?._meta?.definitionVersion ?? config?.definitionSnapshot?.version;
  const versionNum = typeof versionRaw === 'number' && Number.isFinite(versionRaw)
    ? versionRaw
    : typeof versionRaw === 'string' && versionRaw.trim() !== '' && Number.isFinite(Number(versionRaw))
      ? Number(versionRaw)
      : run.definitionVersion ?? null;
  const temperature = typeof config?.temperature === 'number' && Number.isFinite(config.temperature)
    ? config.temperature
    : null;
  return formatTrialSignature(versionNum, temperature);
}

function formatPercentRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const pct = value * 100;
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

function formatSignedPoints(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const pp = value * 100;
  const rounded = Math.round(pp * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}`;
}

function pressureTooltipFor(reason: string | null | undefined): string {
  if (reason == null) return FALLBACK_PRESSURE_TOOLTIP;
  return PRESSURE_REASON_TOOLTIPS[reason] ?? FALLBACK_PRESSURE_TOOLTIP;
}

export function PooledVignetteMetricsCard({
  currentRun,
  isAggregate,
}: PooledVignetteMetricsCardProps) {
  const definitionContent = currentRun.definition?.content ?? null;
  const definitionId = currentRun.definition?.id ?? null;
  const isPairedDefinition = hasMirroredValueTokens(definitionContent);

  // Visibility checks #1 (paired tokens) and #2 (not aggregate) are evaluated before any
  // data-fetching hooks are mounted. This keeps the card from forcing a urql Provider into
  // contexts that have no use for one (test harnesses for non-paired runs, for example).
  if (!isPairedDefinition || isAggregate || definitionId == null) {
    return null;
  }

  return <PooledVignetteMetricsContent currentRun={currentRun} />;
}

type PooledVignetteMetricsContentProps = {
  currentRun: Run;
};

function PooledVignetteMetricsContent({ currentRun }: PooledVignetteMetricsContentProps) {
  const cardRef = useRef<HTMLElement>(null);
  const definitionContent = currentRun.definition?.content ?? null;
  const definitionId = currentRun.definition?.id ?? null;
  const signature = deriveTrialSignature(currentRun);

  const [{ data, fetching, error }] = useQuery<PressureSensitivityQueryResult, PressureSensitivityQueryVariables>({
    query: PRESSURE_SENSITIVITY_QUERY,
    variables: {
      definitionId: definitionId ?? undefined,
      signature,
    },
    requestPolicy: 'cache-and-network',
  });

  // Pull all completed runs of this same definition so we can count N (this-vignette runs at this signature).
  // The resolver pools across the mirror server-side; M (mirrored runs) comes from `currentRun.mirroredRuns`
  // which Wave 4's resolver already populates.
  const { runs: definitionRuns } = useRuns({
    definitionId: definitionId ?? undefined,
    status: 'COMPLETED',
    limit: 100,
  });

  const sameVignetteRunCount = useMemo(() => {
    return definitionRuns.filter((run) => deriveTrialSignature(run) === signature).length;
  }, [definitionRuns, signature]);

  const mirroredRunCount = currentRun.mirroredRuns?.length ?? 0;

  const pressureResult = data?.pressureSensitivity ?? null;
  const collision = pressureResult?.excludedDefinitions.some((entry) => entry.reason === PAIR_KEY_COMPANION_COLLISION) ?? false;
  const models = pressureResult?.models ?? [];

  // Visibility check #3: hide entirely if the API has no models for this paired vignette.
  // (Loading and error states render via the branches below.)
  if (!fetching && error == null && !collision && models.length === 0) {
    return null;
  }

  const labels = getPairedOrientationLabels(definitionContent);
  const firstValueLabel = labels.canonicalValues?.[0] ?? 'First value';
  const secondValueLabel = labels.canonicalValues?.[1] ?? 'Second value';
  const sortedModels = [...models].sort((a, b) => (a.label ?? a.modelId).localeCompare(b.label ?? b.modelId));

  const countLine = mirroredRunCount === 0
    ? `Includes ${sameVignetteRunCount} run${sameVignetteRunCount === 1 ? '' : 's'} of this vignette. Mirrored runs at signature ${signature} will populate this card once the companion vignette has runs.`
    : `Includes ${sameVignetteRunCount} run${sameVignetteRunCount === 1 ? '' : 's'} of this vignette and ${mirroredRunCount} mirrored run${mirroredRunCount === 1 ? '' : 's'} at signature ${signature}.`;

  return (
    <section
      ref={cardRef}
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-4"
      data-testid="pooled-vignette-metrics"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Pooled vignette metrics</h2>
          <p className="text-sm font-medium text-gray-700">{currentRun.definition?.name ?? 'This vignette'}</p>
          <p className="text-xs text-gray-500">{countLine}</p>
        </div>
        <CopyVisualButton targetRef={cardRef} label="pooled vignette metrics" />
      </div>

      {collision ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          Cannot blend this vignette pair — multiple companion vignettes share its mirrored token. Investigate before
          relying on these numbers.
        </div>
      ) : error != null ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Failed to load pooled metrics: {error.message}
        </div>
      ) : fetching && pressureResult == null ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          Loading pooled metrics…
        </div>
      ) : sortedModels.every((model) => (model.valuePairs[0]?.n ?? 0) === 0) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Trials in flight; no completed runs yet at this signature.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-700">
                  Model
                </th>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                  {firstValueLabel} %
                </th>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                  {secondValueLabel} %
                </th>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                  Pressure response
                </th>
                <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700">
                  Trials
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedModels.map((model) => {
                const pair = model.valuePairs[0] ?? null;
                const pressureValue = pair?.pressureResponse?.value ?? null;
                const pressureTooltip = pressureValue == null
                  ? pressureTooltipFor(pair?.pressureResponse?.reason ?? null)
                  : null;
                return (
                  <tr key={model.modelId}>
                    <td className="border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800">
                      {model.label || model.modelId}
                    </td>
                    <td className="border border-gray-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                      {formatPercentRate(pair?.directionBalancedWinRate ?? null)}
                    </td>
                    <td className="border border-gray-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                      {formatPercentRate(pair?.directionBalancedOpponentWinRate ?? null)}
                    </td>
                    <td className="border border-gray-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                      {pressureTooltip != null ? (
                        <span title={pressureTooltip} aria-label={pressureTooltip}>—</span>
                      ) : (
                        formatSignedPoints(pressureValue)
                      )}
                    </td>
                    <td className="border border-gray-200 bg-white px-3 py-2 text-center text-sm text-gray-800">
                      {pair?.n ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-600">
            Win rates are direction-balanced (each direction counts once before averaging). Pressure response is the
            percentage-point shift in {firstValueLabel} preference between scenarios that stack {firstValueLabel} higher
            and scenarios that stack {secondValueLabel} higher.
          </p>
        </div>
      )}
    </section>
  );
}
